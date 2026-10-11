-- Original CareFlow schema. Apply with Supabase migrations or SQL editor.
create extension if not exists pgcrypto;
create table public.settings(id boolean primary key default true check(id),timezone text not null default 'Asia/Kolkata');
insert into public.settings default values;
create table public.departments(id uuid primary key default gen_random_uuid(),name text not null,room text not null default '',default_minutes int not null default 10 check(default_minutes between 1 and 120));
create table public.profiles(id uuid primary key references auth.users on delete cascade,name text not null,role text not null default 'patient' check(role in ('patient','reception','doctor','admin')),department_id uuid references public.departments,email_opt_in boolean not null default false);
create table public.doctors(id uuid primary key references public.profiles,name text not null,department_id uuid not null references public.departments,available boolean not null default true,paused_until timestamptz);
create table public.shifts(id uuid primary key default gen_random_uuid(),doctor_id uuid not null references public.doctors,starts_at timestamptz not null,ends_at timestamptz not null,check(ends_at>starts_at));
create table public.slots(id uuid primary key default gen_random_uuid(),doctor_id uuid not null references public.doctors,department_id uuid not null references public.departments,starts_at timestamptz not null,ends_at timestamptz not null,capacity int not null check(capacity between 1 and 30),check(ends_at>starts_at),unique(doctor_id,starts_at));
create table public.token_counters(department_id uuid references public.departments,hospital_date date,last_token int not null,primary key(department_id,hospital_date));
create table public.appointments(id uuid primary key default gen_random_uuid(),patient_id uuid references public.profiles,patient_name text not null,doctor_id uuid not null references public.doctors,department_id uuid not null references public.departments,slot_id uuid references public.slots,token int not null,hospital_date date not null,status text not null default 'scheduled' check(status in ('scheduled','checked_in','waiting','called','in_consultation','completed','cancelled','no_show')),symptoms text not null default '',priority int check(priority between 1 and 3),vitals jsonb not null default '{}',arrived_at timestamptz,called_at timestamptz,started_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now(),qr_token uuid not null default gen_random_uuid(),qr_expires_at timestamptz not null,unique(department_id,hospital_date,token));
create unique index one_active_consultation on public.appointments(doctor_id) where status='in_consultation';
create unique index one_called_patient on public.appointments(doctor_id) where status='called';
create unique index duplicate_patient_slot on public.appointments(patient_id,slot_id) where status not in ('cancelled','no_show');
create index appointment_queue on public.appointments(doctor_id,status,priority desc,arrived_at);
create index appointment_patient on public.appointments(patient_id,created_at desc);
create table public.priority_reviews(id uuid primary key default gen_random_uuid(),appointment_id uuid not null references public.appointments,reviewer_id uuid not null references public.profiles,priority int not null check(priority between 1 and 3),reason text not null check(length(reason)>0),created_at timestamptz not null default now());
create table public.consultation_notes(appointment_id uuid primary key references public.appointments,doctor_id uuid not null references public.doctors,note text not null);
create table public.queue_events(id uuid primary key default gen_random_uuid(),appointment_id uuid not null references public.appointments,actor_id uuid references public.profiles,from_status text,to_status text not null,created_at timestamptz not null default now());
create table public.resources(id uuid primary key default gen_random_uuid(),name text not null,total int not null check(total>=0),available int not null check(available>=0 and available<=total));
create table public.audit(id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles,action text not null,entity_id uuid,created_at timestamptz not null default now());
create table public.resource_changes(id uuid primary key default gen_random_uuid(),resource_id uuid references public.resources,actor_id uuid references public.profiles,old_available int,new_available int,created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles,message text not null,status text not null default 'unread',created_at timestamptz not null default now());
create table public.delivery_attempts(id uuid primary key default gen_random_uuid(),notification_id uuid not null unique references public.notifications,status text not null default 'pending',attempts int not null default 0,claimed_at timestamptz,provider_id text,last_error text);
create table public.waitlist(id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles,department_id uuid not null references public.departments,status text not null default 'waiting',created_at timestamptz not null default now());
create unique index one_waitlist on public.waitlist(patient_id,department_id) where status='waiting';
create table public.offers(id uuid primary key default gen_random_uuid(),waitlist_id uuid not null references public.waitlist,patient_id uuid not null references public.profiles,slot_id uuid not null references public.slots,status text not null default 'offered',expires_at timestamptz not null,created_at timestamptz not null default now());
create unique index one_live_offer on public.offers(waitlist_id) where status='offered';
create table public.feedback(appointment_id uuid primary key references public.appointments,patient_id uuid not null references public.profiles,rating int not null check(rating between 1 and 5),comment text not null default '');
create table public.command_results(actor_id uuid references public.profiles,key uuid,result jsonb not null,primary key(actor_id,key));
create table public.rate_limits(actor_id uuid references public.profiles,minute timestamptz,count int not null,primary key(actor_id,minute));

create function public.on_signup() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,name) values(new.id,left(coalesce(new.raw_user_meta_data->>'name','Patient'),100));return new;end $$;
create trigger careflow_signup after insert on auth.users for each row execute function public.on_signup();
create function public.my_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
create function public.can_access(p_patient uuid,p_doctor uuid,p_department uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and (role='admin' or (role='patient' and id=p_patient) or (role='doctor' and id=p_doctor) or (role='reception' and department_id=p_department)))$$;
create function public.next_token(dep uuid,day date) returns int language plpgsql security definer set search_path=public as $$declare n int;begin insert into token_counters values(dep,day,1) on conflict(department_id,hospital_date) do update set last_token=token_counters.last_token+1 returning last_token into n;return n;end$$;
create function public.notify(p uuid,msg text) returns void language plpgsql security definer set search_path=public as $$declare n uuid;begin if p is not null then insert into notifications(patient_id,message) values(p,msg) returning id into n;insert into delivery_attempts(notification_id) values(n);end if;end$$;

-- All browser mutations pass through this transaction boundary. Tables are read-only to authenticated clients.
create function public.command(action text,key uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor profiles; a appointments; s slots; d doctors; o offers; prior jsonb; result jsonb:='{}'; eid uuid; dep uuid; old text; target text; day date; n int; r resources; count_requests int;
begin
 select * into actor from profiles where id=auth.uid();if actor.id is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text,0));
 select cr.result into prior from command_results cr where cr.actor_id=actor.id and cr.key=command.key;if found then return prior;end if;
 insert into rate_limits values(actor.id,date_trunc('minute',now()),1) on conflict(actor_id,minute) do update set count=rate_limits.count+1 returning count into count_requests;
 if count_requests>60 then raise exception 'Too many requests';end if;
 if action in ('transition','review','reassign','reschedule','feedback') then
 select * into a from appointments where id=(payload->>'id')::uuid for update;
 if a.id is null or not can_access(a.patient_id,a.doctor_id,a.department_id) then raise exception 'Access denied';end if;eid:=a.id;
 end if;
 if action='book' or action='accept_offer' then
 if actor.role<>'patient' then raise exception 'Patient account required';end if;
 if action='accept_offer' then
 select * into o from offers where id=(payload->>'id')::uuid for update;
 if o.patient_id<>actor.id or o.id is null or o.status<>'offered' or o.expires_at<=now() then raise exception 'Offer expired or unavailable';end if;
 select * into s from slots where id=o.slot_id for update;
 else select * into s from slots where id=(payload->>'slot_id')::uuid for update;end if;
 if s.id is null or s.starts_at<=now() then raise exception 'Slot unavailable';end if;
 select * into d from doctors where id=s.doctor_id;
 if not d.available then raise exception 'Doctor unavailable';end if;
 select count(*) into n from appointments where slot_id=s.id and status not in ('cancelled','no_show');
 n:=n+(select count(*) from offers where slot_id=s.id and status='offered' and expires_at>now() and (o.id is null or id<>o.id));
 if n>=s.capacity then raise exception 'Slot full';end if;
 select (s.starts_at at time zone timezone)::date into day from settings;
 insert into appointments(patient_id,patient_name,doctor_id,department_id,slot_id,token,hospital_date,symptoms,vitals,qr_expires_at) values(actor.id,actor.name,s.doctor_id,s.department_id,s.id,next_token(s.department_id,day),day,left(coalesce(payload->>'symptoms',''),2000),coalesce(payload->'vitals','{}'),s.ends_at+interval '4 hours') returning id into eid;
 if o.id is not null then update offers set status='accepted' where id=o.id;update waitlist set status='accepted' where id=o.waitlist_id;end if;
 perform notify(actor.id,'Appointment confirmed. View your token in CareFlow.');
 elsif action='walkin' then
 select * into d from doctors where id=(payload->>'doctor_id')::uuid;
 if d.id is null or not d.available or actor.role not in ('admin','reception') or (actor.role='reception' and actor.department_id is distinct from d.department_id) then raise exception 'Access denied';end if;
 if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Name required';end if;
 select (now() at time zone timezone)::date into day from settings;
 insert into appointments(patient_name,doctor_id,department_id,token,hospital_date,status,symptoms,arrived_at,qr_expires_at) values(left(payload->>'name',100),d.id,d.department_id,next_token(d.department_id,day),day,'checked_in',left(coalesce(payload->>'symptoms',''),2000),now(),now()+interval '12 hours') returning id into eid;
 elsif action='checkin' then
 select * into a from appointments where qr_token::text=payload->>'token' or id::text=payload->>'token' for update;
 if a.id is null or actor.role not in ('admin','reception') or not can_access(a.patient_id,a.doctor_id,a.department_id) then raise exception 'Invalid token or access denied';end if;
 if a.qr_expires_at<now() then raise exception 'Check-in token expired';end if;
 if a.status in ('checked_in','waiting','called','in_consultation') then result:=jsonb_build_object('id',a.id,'message','Already checked in');
 elsif a.status='scheduled' then
 select (now() at time zone timezone)::date into day from settings;
 if a.hospital_date<>day then raise exception 'Check in on appointment date';end if;
 update appointments set status='checked_in',arrived_at=now() where id=a.id;insert into queue_events(appointment_id,actor_id,from_status,to_status) values(a.id,actor.id,a.status,'checked_in');
 else raise exception 'Appointment cannot be checked in';end if;eid:=a.id;
 elsif action='review' then
 if actor.role not in ('reception','doctor','admin') or a.status not in ('checked_in','waiting') then raise exception 'Review unavailable';end if;
 if (payload->>'priority')::int not between 1 and 3 or length(trim(coalesce(payload->>'reason','')))=0 then raise exception 'Priority and reason required';end if;
 insert into priority_reviews(appointment_id,reviewer_id,priority,reason) values(a.id,actor.id,(payload->>'priority')::int,left(payload->>'reason',1000));
 update appointments set priority=(payload->>'priority')::int,status='waiting',vitals=coalesce(payload->'vitals',vitals) where id=a.id;
 insert into queue_events(appointment_id,actor_id,from_status,to_status) values(a.id,actor.id,a.status,'waiting');
 elsif action='call_next' then
 select * into d from doctors where id=(payload->>'doctor_id')::uuid for update;
 if d.id is null or actor.role<>'doctor' or actor.id<>d.id then raise exception 'Doctor access required';end if;
 if not d.available or d.paused_until>now() then raise exception 'Doctor unavailable or on break';end if;
 if exists(select 1 from appointments where doctor_id=d.id and status in ('called','in_consultation')) then raise exception 'Finish current patient first';end if;
 select * into a from appointments where doctor_id=d.id and status='waiting' and priority is not null and arrived_at is not null order by priority desc,arrived_at,id limit 1 for update skip locked;
 if a.id is null then raise exception 'No eligible patients';end if;
 update appointments set status='called',called_at=now() where id=a.id;insert into queue_events(appointment_id,actor_id,from_status,to_status) values(a.id,actor.id,'waiting','called');perform notify(a.patient_id,'It is your turn. Please proceed to your consultation room.');eid:=a.id;
 elsif action='transition' then
 target:=payload->>'to';
 if actor.role='patient' then if target<>'cancelled' or a.status not in ('scheduled','checked_in','waiting') then raise exception 'Patient may only cancel before being called';end if;
 elsif target in ('in_consultation','completed') then if actor.role<>'doctor' or actor.id<>a.doctor_id then raise exception 'Assigned doctor required';end if;
 elsif target='no_show' then if actor.role not in ('reception','doctor','admin') then raise exception 'Staff required';end if;
 elsif target<>'cancelled' then raise exception 'Use check-in, review or call-next workflow';end if;
 if not ((a.status='scheduled' and target in ('cancelled','no_show')) or (a.status in ('checked_in','waiting') and target='cancelled') or (a.status='waiting' and target='no_show') or (a.status='called' and target in ('in_consultation','no_show')) or (a.status='in_consultation' and target='completed')) then raise exception 'Invalid transition';end if;
 if target='no_show' and ((a.status='scheduled' and exists(select 1 from slots where id=a.slot_id and ends_at>now())) or (a.status='called' and a.called_at>now()-interval '5 minutes') or (a.status='waiting' and a.arrived_at>now()-interval '15 minutes')) then raise exception 'No-show grace period has not elapsed';end if;
 if target='in_consultation' then perform 1 from doctors where id=a.doctor_id for update;end if;
 update appointments set status=target,started_at=case when target='in_consultation' then now() else started_at end,completed_at=case when target='completed' then now() else completed_at end where id=a.id;
 if target='completed' and coalesce(payload->>'note','')<>'' then insert into consultation_notes values(a.id,actor.id,left(payload->>'note',2000)) on conflict(appointment_id) do update set note=excluded.note;end if;
 insert into queue_events(appointment_id,actor_id,from_status,to_status) values(a.id,actor.id,a.status,target);
 perform notify(a.patient_id,'Appointment status changed to '||replace(target,'_',' ')||'.');
 elsif action='pause' then
 if actor.role<>'doctor' or actor.id<>(payload->>'doctor_id')::uuid or (payload->>'minutes')::int not between 0 and 120 then raise exception 'Invalid break';end if;
 update doctors set paused_until=now()+make_interval(mins=>(payload->>'minutes')::int) where id=actor.id;eid:=actor.id;
 elsif action='reassign' then
 if actor.role not in ('reception','admin') or a.status not in ('checked_in','waiting') or length(trim(coalesce(payload->>'reason','')))=0 then raise exception 'Staff confirmation and reason required';end if;
 select * into d from doctors where id=(payload->>'doctor_id')::uuid for update;
 if d.id is null or not d.available or d.department_id<>a.department_id then raise exception 'Choose available doctor in same department';end if;
 update appointments set doctor_id=d.id where id=a.id;
 elsif action='reschedule' then
 if actor.id is distinct from a.patient_id or a.status<>'scheduled' then raise exception 'Only scheduled appointments can be rescheduled';end if;
 select * into s from slots where id=(payload->>'slot_id')::uuid for update;
 if s.id is null or s.starts_at<=now() then raise exception 'Slot unavailable';end if;
 select count(*) into n from appointments where slot_id=s.id and id<>a.id and status not in ('cancelled','no_show');
 n:=n+(select count(*) from offers where slot_id=s.id and status='offered' and expires_at>now());if n>=s.capacity then raise exception 'Slot full';end if;
 select (s.starts_at at time zone timezone)::date into day from settings;
 update appointments set doctor_id=s.doctor_id,department_id=s.department_id,slot_id=s.id,hospital_date=day,token=case when department_id=s.department_id and hospital_date=day then token else next_token(s.department_id,day) end,qr_token=gen_random_uuid(),qr_expires_at=s.ends_at+interval '4 hours' where id=a.id;
 elsif action='profile' then
 if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Name required';end if;
 update profiles set name=left(payload->>'name',100),email_opt_in=(payload->>'email_opt_in')::boolean where id=actor.id;eid:=actor.id;
 elsif action='feedback' then
 if actor.id is distinct from a.patient_id or a.status<>'completed' then raise exception 'Completed appointment required';end if;
 insert into feedback values(a.id,actor.id,(payload->>'rating')::int,left(coalesce(payload->>'comment',''),1000)) on conflict(appointment_id) do update set rating=excluded.rating,comment=excluded.comment;
 elsif action='waitlist' then
 if actor.role<>'patient' then raise exception 'Patient access required';end if;
 insert into waitlist(patient_id,department_id) values(actor.id,(payload->>'department_id')::uuid) on conflict do nothing;
 elsif action='mark_read' then update notifications set status='read' where id=(payload->>'id')::uuid and patient_id=actor.id;
 elsif action in ('resource','department','staff','slot','shift') then
 if actor.role<>'admin' then raise exception 'Administrator required';end if;
 eid:=coalesce((payload->>'id')::uuid,gen_random_uuid());
 if action='resource' then
 select * into r from resources where id=eid for update;
 insert into resources values(eid,left(payload->>'name',100),(payload->>'total')::int,(payload->>'available')::int) on conflict(id) do update set name=excluded.name,total=excluded.total,available=excluded.available;
 insert into resource_changes(resource_id,actor_id,old_available,new_available) values(eid,actor.id,r.available,(payload->>'available')::int);
 elsif action='department' then insert into departments values(eid,left(payload->>'name',100),left(payload->>'room',30),(payload->>'default_minutes')::int) on conflict(id) do update set name=excluded.name,room=excluded.room,default_minutes=excluded.default_minutes;
 elsif action='staff' then
 if eid=actor.id then raise exception 'Cannot change your own role';end if;
 if payload->>'role' in ('doctor','reception') and payload->>'department_id' is null then raise exception 'Department required';end if;
 if exists(select 1 from doctors where id=eid) and payload->>'role'<>'doctor' then raise exception 'Doctor role cannot be removed while doctor records exist';end if;
 update profiles set role=payload->>'role',department_id=(payload->>'department_id')::uuid where id=eid;
 if not found then raise exception 'User must register first';end if;
 if payload->>'role'='doctor' then insert into doctors(id,name,department_id) select id,name,department_id from profiles where id=eid on conflict(id) do update set department_id=excluded.department_id,name=excluded.name;end if;
 else
 select * into d from doctors where id=(payload->>'doctor_id')::uuid;
 if d.id is null then raise exception 'Unknown doctor';end if;
 if action='shift' then insert into shifts(id,doctor_id,starts_at,ends_at) values(eid,d.id,(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz);
 else
 if not exists(select 1 from shifts where doctor_id=d.id and starts_at<=(payload->>'starts_at')::timestamptz and ends_at>=(payload->>'ends_at')::timestamptz) then raise exception 'Slot must fit a configured shift';end if;
 insert into slots values(eid,d.id,d.department_id,(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,(payload->>'capacity')::int);
 end if;end if;
 else raise exception 'Unknown command';end if;
 result:=result||jsonb_build_object('id',eid,'message',coalesce(result->>'message','Saved'));
 insert into audit(actor_id,action,entity_id) values(actor.id,action,eid);
 insert into command_results values(actor.id,key,result);return result;
end$$;

create function public.queue_stats() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(x),'[]') from (
 select d.id doctor_id,
 (select count(*) from appointments a where a.doctor_id=d.id and a.status='waiting') waiting,
 (select min(started_at) from appointments a where a.doctor_id=d.id and a.status='in_consultation') active_started_at,
 coalesce((select avg(extract(epoch from (completed_at-started_at))/60) from (select completed_at,started_at from appointments where doctor_id=d.id and status='completed' and started_at is not null and completed_at>started_at order by completed_at desc limit 30) t),dep.default_minutes) average_minutes,
 (select count(*) from appointments a where a.doctor_id=d.id and a.status='completed' and a.started_at is not null) samples
 from doctors d join departments dep on dep.id=d.department_id where auth.uid() is not null
 ) x $$;
create function public.my_positions() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(m.id,(select count(*) from appointments a where a.doctor_id=m.doctor_id and a.status='waiting' and a.priority is not null and (a.priority>m.priority or (a.priority=m.priority and (a.arrived_at,a.id)<(m.arrived_at,m.id))))),'{}') from appointments m where m.patient_id=auth.uid() and m.status='waiting' $$;
create function public.public_board() returns jsonb language sql stable security definer set search_path=public as $$select coalesce(jsonb_agg(x),'[]') from(select a.token,d.name department,d.room,a.status from appointments a join departments d on d.id=a.department_id where a.status in ('called','in_consultation') order by a.called_at desc limit 50)x$$;

-- Runs once a minute, server-only. Locks each slot before counting bookings and reservations.
create function public.run_jobs() returns jsonb language plpgsql security definer set search_path=public as $$declare s slots; w waitlist; n int; expired offers;begin
 for expired in select * from offers where status='offered' and expires_at<=now() for update skip locked loop update offers set status='expired' where id=expired.id;end loop;
 for s in select * from slots where starts_at>now() and starts_at<now()+interval '7 days' order by starts_at for update skip locked loop
 select count(*) into n from appointments where slot_id=s.id and status not in ('cancelled','no_show');n:=n+(select count(*) from offers where slot_id=s.id and status='offered' and expires_at>now());
 while n<s.capacity loop
 select * into w from waitlist where department_id=s.department_id and status='waiting' and not exists(select 1 from offers where waitlist_id=waitlist.id and (status='offered' or slot_id=s.id)) and not exists(select 1 from appointments where patient_id=waitlist.patient_id and slot_id=s.id and status not in ('cancelled','no_show')) order by created_at limit 1 for update skip locked;
 if w.id is null then exit;end if;
 insert into offers(waitlist_id,patient_id,slot_id,expires_at) values(w.id,w.patient_id,s.id,least(now()+interval '15 minutes',s.starts_at));perform notify(w.patient_id,'A waitlist slot is available. Open CareFlow to accept your time-limited offer.');n:=n+1;
 end loop;end loop;
 delete from rate_limits where minute<now()-interval '1 day';return '{"ok":true}';end$$;

alter table public.notifications add column reminder_for uuid unique references public.appointments;
create function public.create_reminders() returns void language plpgsql security definer set search_path=public as $$declare a appointments; n uuid;begin
 for a in select ap.* from appointments ap join slots s on s.id=ap.slot_id where ap.status='scheduled' and ap.patient_id is not null and s.starts_at between now() and now()+interval '1 hour' loop
 n:=null;insert into notifications(patient_id,message,reminder_for) values(a.patient_id,'Your appointment is within the next hour. Please check in at reception.',a.id) on conflict(reminder_for) do nothing returning id into n;
 if n is not null then insert into delivery_attempts(notification_id) values(n);end if;end loop;end$$;
create function public.claim_deliveries() returns setof public.delivery_attempts language plpgsql security definer set search_path=public as $$begin return query update delivery_attempts set status='sending',claimed_at=now(),attempts=attempts+1 where id in(select id from delivery_attempts where (status='pending' or (status='sending' and claimed_at<now()-interval '10 minutes')) and attempts<4 for update skip locked limit 20) returning *;end$$;

-- Private tables: no direct writes from browser roles.
do $$declare t text;begin foreach t in array array['settings','departments','profiles','doctors','shifts','slots','token_counters','appointments','priority_reviews','consultation_notes','queue_events','resources','audit','resource_changes','notifications','delivery_attempts','waitlist','offers','feedback','command_results','rate_limits'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);end loop;end$$;
grant select on public.departments,public.profiles,public.doctors,public.shifts,public.slots,public.appointments,public.priority_reviews,public.consultation_notes,public.queue_events,public.resources,public.audit,public.resource_changes,public.notifications,public.waitlist,public.offers,public.feedback to authenticated;
create policy departments_read on departments for select to authenticated using(true);
create policy doctors_read on doctors for select to authenticated using(true);
create policy shifts_read on shifts for select to authenticated using(true);
create policy slots_read on slots for select to authenticated using(true);
create policy profiles_read on profiles for select to authenticated using(id=auth.uid() or my_role()='admin');
create policy appointments_read on appointments for select to authenticated using(can_access(patient_id,doctor_id,department_id));
create policy resources_read on resources for select to authenticated using(my_role()='admin');
create policy audit_read on audit for select to authenticated using(my_role()='admin');
create policy resource_changes_read on resource_changes for select to authenticated using(my_role()='admin');
create policy notes_read on consultation_notes for select to authenticated using(doctor_id=auth.uid() or my_role()='admin');
create policy reviews_read on priority_reviews for select to authenticated using(exists(select 1 from appointments a where a.id=appointment_id and can_access(a.patient_id,a.doctor_id,a.department_id)));
create policy events_read on queue_events for select to authenticated using(exists(select 1 from appointments a where a.id=appointment_id and can_access(a.patient_id,a.doctor_id,a.department_id)));
create policy notifications_read on notifications for select to authenticated using(patient_id=auth.uid());
create policy waitlist_read on waitlist for select to authenticated using(patient_id=auth.uid() or my_role()='admin');
create policy offers_read on offers for select to authenticated using(patient_id=auth.uid() or my_role()='admin');
create policy feedback_read on feedback for select to authenticated using(patient_id=auth.uid() or my_role()='admin');
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.my_role(),public.can_access(uuid,uuid,uuid),public.command(text,uuid,jsonb),public.queue_stats(),public.my_positions() to authenticated;
grant execute on function public.public_board() to anon,authenticated;
grant execute on function public.run_jobs(),public.create_reminders(),public.claim_deliveries() to service_role;
-- Supabase Realtime applies each subscriber's SELECT policies.
alter publication supabase_realtime add table public.appointments,public.doctors,public.notifications,public.offers,public.resources;
