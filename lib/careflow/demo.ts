import type { Snapshot, Role, Command, Appointment } from "./types";
import { canTransition, hospitalDate, queueFor } from "./engine";
import { parseCommand } from "./validation";
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const DEMO_ROLES: Record<Role, string> = {
  patient: uid(1),
  doctor: uid(2),
  reception: uid(3),
  admin: uid(4),
};
export function seedDemo(): Snapshot {
  const now = Date.now();
  const iso = (minutes: number) =>
    new Date(now + minutes * 60000).toISOString();
  const date = hospitalDate();
  const departments = [
    {
      id: uid(10),
      name: "General Medicine",
      room: "G-101",
      default_minutes: 12,
    },
    { id: uid(11), name: "Cardiology", room: "C-204", default_minutes: 20 },
    { id: uid(12), name: "Orthopedics", room: "O-108", default_minutes: 15 },
  ];
  const profiles = [
    {
      id: uid(1),
      name: "Ananya Rao",
      role: "patient" as Role,
      department_id: null,
      email_opt_in: false,
    },
    {
      id: uid(2),
      name: "Dr. Meera Shah",
      role: "doctor" as Role,
      department_id: uid(10),
      email_opt_in: false,
    },
    {
      id: uid(3),
      name: "Priya Nair",
      role: "reception" as Role,
      department_id: uid(10),
      email_opt_in: false,
    },
    {
      id: uid(4),
      name: "Sheetal Pabba",
      role: "admin" as Role,
      department_id: null,
      email_opt_in: false,
    },
  ];
  const doctors = [
    {
      id: uid(2),
      name: "Dr. Meera Shah",
      department_id: uid(10),
      available: true,
      paused_until: null,
    },
    {
      id: uid(5),
      name: "Dr. Arjun Menon",
      department_id: uid(11),
      available: true,
      paused_until: null,
    },
    {
      id: uid(6),
      name: "Dr. Kavya Reddy",
      department_id: uid(12),
      available: true,
      paused_until: null,
    },
  ];
  const slots = doctors.flatMap((d, i) =>
    [30, 60, 90, 120].map((m, j) => ({
      id: uid(100 + i * 10 + j),
      doctor_id: d.id,
      department_id: d.department_id,
      starts_at: iso(m),
      ends_at: iso(m + 30),
      capacity: 4,
    })),
  );
  const names = [
    "Ananya Rao",
    "Rohan Das",
    "Sara Khan",
    "Vikram Patel",
    "Diya Iyer",
    "Aarav Singh",
    "Neha Joshi",
    "Kabir Sethi",
    "Maya Rao",
    "Ishaan Mehta",
    "Tara Gupta",
    "Arun Kumar",
  ];
  const appointments: Appointment[] = names.map((name, i) => {
    const d = doctors[i % 3];
    const completed = i >= 6;
    return {
      id: uid(200 + i),
      patient_id: i === 0 ? uid(1) : uid(300 + i),
      patient_name: name,
      doctor_id: d.id,
      department_id: d.department_id,
      slot_id: null,
      token: Math.floor(i / 3) + 1,
      hospital_date: date,
      status: completed
        ? "completed"
        : i === 0
          ? "scheduled"
          : i === 3
            ? "checked_in"
            : "waiting",
      symptoms: i % 2 ? "Headache and tiredness" : "Routine follow-up",
      priority: i === 0 || i === 3 ? null : i % 3 === 1 ? 2 : 1,
      vitals: { temperature: 37, spo2: 98 },
      arrived_at: i === 0 ? null : iso(-60 + i * 2),
      called_at: null,
      started_at: completed ? iso(-30 + i) : null,
      completed_at: completed ? iso(-18 + i) : null,
      created_at: iso(-120),
      qr_token: uid(400 + i),
      qr_expires_at: iso(360),
    };
  });
  return {
    profile: profiles[3],
    profiles,
    departments,
    doctors,
    slots,
    appointments,
    resources: [
      { id: uid(40), name: "General beds", total: 60, available: 18 },
      { id: uid(41), name: "ICU beds", total: 12, available: 4 },
      { id: uid(42), name: "Ventilators", total: 8, available: 5 },
      { id: uid(43), name: "Wheelchairs", total: 20, available: 13 },
    ],
    notifications: [],
    audit: [],
    feedback: [],
    waitlist: [],
    offers: [],
    shifts: doctors.map((d, i) => ({
      id: uid(50 + i),
      doctor_id: d.id,
      starts_at: iso(-120),
      ends_at: iso(360),
    })),
    queue_stats: [],
  };
}
interface Store {
  data: Snapshot;
  keys: string[];
}
const storage = "careflow-demo-v1";
function read(): Store {
  try {
    const v = localStorage.getItem(storage);
    if (v) return JSON.parse(v);
  } catch {}
  return { data: seedDemo(), keys: [] };
}
function save(s: Store) {
  localStorage.setItem(storage, JSON.stringify(s));
}
export function resetDemo() {
  save({ data: seedDemo(), keys: [] });
}
export function demoSnapshot(
  role: Role,
): Snapshot & { positions: Record<string, number> } {
  const { data } = read();
  const profile = data.profiles.find((p) => p.id === DEMO_ROLES[role])!;
  const rows = data.appointments;
  const visible = rows.filter(
    (a) =>
      role === "admin" ||
      (role === "doctor" && a.doctor_id === profile.id) ||
      (role === "patient" && a.patient_id === profile.id) ||
      (role === "reception" && a.department_id === profile.department_id),
  );
  const queue_stats = data.doctors.map((d) => {
    const history = rows.filter(
      (a) => a.doctor_id === d.id && a.completed_at && a.started_at,
    );
    return {
      doctor_id: d.id,
      waiting: queueFor(rows, d.id).length,
      active_started_at:
        rows.find((a) => a.doctor_id === d.id && a.status === "in_consultation")
          ?.started_at || null,
      average_minutes: history.length
        ? history.reduce(
            (n, a) =>
              n +
              (Date.parse(a.completed_at!) - Date.parse(a.started_at!)) / 60000,
            0,
          ) / history.length
        : data.departments.find((p) => p.id === d.department_id)!
            .default_minutes,
      samples: history.length,
    };
  });
  const positions = Object.fromEntries(
    visible.map((a) => [
      a.id,
      Math.max(
        0,
        queueFor(rows, a.doctor_id).findIndex((x) => x.id === a.id),
      ),
    ]),
  );
  return {
    ...data,
    profile,
    profiles: role === "admin" ? data.profiles : [profile],
    appointments: visible,
    resources: role === "admin" ? data.resources : [],
    audit: role === "admin" ? data.audit : [],
    queue_stats,
    positions,
  };
}
export function demoCommand(role: Role, input: Command) {
  const c = parseCommand(input);
  const s = read();
  if (s.keys.includes(c.key)) return;
  const p = c.payload as Record<string, any>;
  const data = s.data;
  const actor = data.profiles.find((x) => x.id === DEMO_ROLES[role])!;
  const a = data.appointments.find((x) => x.id === p.id);
  const now = new Date().toISOString();
  const staff = role !== "patient";
  const canAccess = (x: Appointment) =>
    role === "admin" ||
    (role === "patient" && x.patient_id === actor.id) ||
    (role === "doctor" && x.doctor_id === actor.id) ||
    (role === "reception" && x.department_id === actor.department_id);
  if (a && !canAccess(a)) throw Error("Access denied");
  if (c.action === "book" || c.action === "accept_offer") {
    if (role !== "patient") throw Error("Patient role required");
    const offer = data.offers.find((x) => x.id === p.id);
    if (
      c.action === "accept_offer" &&
      (!offer || offer.status !== "offered" || offer.expires_at < now)
    )
      throw Error("Offer expired");
    const slot = data.slots.find((x) => x.id === (offer?.slot_id || p.slot_id));
    if (!slot || slot.starts_at < now) throw Error("Slot unavailable");
    if (
      data.appointments.filter(
        (x) =>
          x.slot_id === slot.id && !["cancelled", "no_show"].includes(x.status),
      ).length >= slot.capacity
    )
      throw Error("Slot full");
    if (
      data.appointments.some(
        (x) =>
          x.patient_id === actor.id &&
          x.slot_id === slot.id &&
          !["cancelled", "no_show"].includes(x.status),
      )
    )
      throw Error("You already booked this slot");
    const date = hospitalDate(new Date(slot.starts_at));
    data.appointments.push({
      id: crypto.randomUUID(),
      patient_id: actor.id,
      patient_name: actor.name,
      doctor_id: slot.doctor_id,
      department_id: slot.department_id,
      slot_id: slot.id,
      token:
        Math.max(
          0,
          ...data.appointments
            .filter(
              (x) =>
                x.department_id === slot.department_id &&
                x.hospital_date === date,
            )
            .map((x) => x.token),
        ) + 1,
      hospital_date: date,
      status: "scheduled",
      symptoms: p.symptoms || "",
      vitals: p.vitals || {},
      priority: null,
      arrived_at: null,
      called_at: null,
      started_at: null,
      completed_at: null,
      created_at: now,
      qr_token: crypto.randomUUID(),
      qr_expires_at: new Date(
        Date.parse(slot.ends_at) + 14400000,
      ).toISOString(),
    });
    if (offer) offer.status = "accepted";
  } else if (c.action === "checkin") {
    const x = data.appointments.find(
      (x) => x.qr_token === p.token || x.id === p.token,
    );
    if (!x || !["reception", "admin"].includes(role) || !canAccess(x))
      throw Error("Invalid token or access denied");
    if (x.qr_expires_at! < now) throw Error("Token expired");
    if (x.status === "scheduled") {
      x.status = "checked_in";
      x.arrived_at = now;
    } else if (
      !["checked_in", "waiting", "called", "in_consultation"].includes(x.status)
    )
      throw Error("Invalid check-in");
  } else if (c.action === "review") {
    if (!a || !staff || !["checked_in", "waiting"].includes(a.status))
      throw Error("Staff review unavailable");
    a.priority = p.priority;
    a.status = "waiting";
    a.vitals = p.vitals || a.vitals;
  } else if (c.action === "call_next") {
    if (role !== "doctor" || p.doctor_id !== actor.id)
      throw Error("Doctor access required");
    const d = data.doctors.find((x) => x.id === actor.id)!;
    if (d.paused_until && d.paused_until > now)
      throw Error("Resume your queue first");
    if (
      data.appointments.some(
        (x) =>
          x.doctor_id === actor.id &&
          ["called", "in_consultation"].includes(x.status),
      )
    )
      throw Error("Finish current patient first");
    const x = queueFor(data.appointments, actor.id)[0];
    if (!x) throw Error("No reviewed waiting patients");
    x.status = "called";
    x.called_at = now;
  } else if (c.action === "transition") {
    if (!a || !canTransition(a.status, p.to)) throw Error("Invalid transition");
    if (
      role === "patient" &&
      (p.to !== "cancelled" ||
        !["scheduled", "checked_in", "waiting"].includes(a.status))
    )
      throw Error("Only cancellation is permitted");
    if (
      ["in_consultation", "completed"].includes(p.to) &&
      (role !== "doctor" || a.doctor_id !== actor.id)
    )
      throw Error("Assigned doctor required");
    if (
      p.to === "in_consultation" &&
      data.appointments.some(
        (x) => x.doctor_id === actor.id && x.status === "in_consultation",
      )
    )
      throw Error("Consultation already active");
    a.status = p.to;
    if (p.to === "in_consultation") a.started_at = now;
    if (p.to === "completed") a.completed_at = now;
  } else if (c.action === "pause") {
    if (role !== "doctor" || p.doctor_id !== actor.id)
      throw Error("Doctor required");
    data.doctors.find((x) => x.id === actor.id)!.paused_until = new Date(
      Date.now() + p.minutes * 60000,
    ).toISOString();
  } else if (c.action === "reschedule") {
    if (!a || a.patient_id !== actor.id || a.status !== "scheduled")
      throw Error("Cannot reschedule");
    const slot = data.slots.find((x) => x.id === p.slot_id)!;
    if (
      !slot ||
      slot.starts_at < now ||
      data.appointments.filter(
        (x) =>
          x.id !== a.id &&
          x.slot_id === slot.id &&
          !["cancelled", "no_show"].includes(x.status),
      ).length >= slot.capacity
    )
      throw Error("Slot unavailable");
    a.doctor_id = slot.doctor_id;
    a.department_id = slot.department_id;
    a.slot_id = slot.id;
    a.qr_token = crypto.randomUUID();
    a.qr_expires_at = new Date(
      Date.parse(slot.ends_at) + 14400000,
    ).toISOString();
  } else if (c.action === "reassign") {
    if (
      !a ||
      !["admin", "reception"].includes(role) ||
      !["checked_in", "waiting"].includes(a.status)
    )
      throw Error("Reassignment unavailable");
    const d = data.doctors.find((x) => x.id === p.doctor_id);
    if (!d || d.department_id !== a.department_id || !d.available)
      throw Error("Doctor must be available in same department");
    a.doctor_id = d.id;
  } else if (c.action === "profile") {
    actor.name = p.name;
    actor.email_opt_in = p.email_opt_in;
  } else if (c.action === "feedback") {
    if (!a || a.patient_id !== actor.id || a.status !== "completed")
      throw Error("Completed appointment required");
    data.feedback = data.feedback.filter((x) => x.appointment_id !== a.id);
    data.feedback.push({ appointment_id: a.id, rating: p.rating });
  } else if (c.action === "waitlist") {
    if (role !== "patient") throw Error("Patient required");
    if (
      !data.waitlist.some(
        (x) => x.department_id === p.department_id && x.status === "waiting",
      )
    )
      data.waitlist.push({
        id: crypto.randomUUID(),
        department_id: p.department_id,
        status: "waiting",
      });
  } else if (c.action === "mark_read") {
    const n = data.notifications.find((x) => x.id === p.id);
    if (n) n.status = "read";
  } else if (c.action === "walkin") {
    const d = data.doctors.find((x) => x.id === p.doctor_id);
    if (
      !d ||
      !["admin", "reception"].includes(role) ||
      (role === "reception" && d.department_id !== actor.department_id)
    )
      throw Error("Access denied");
    data.appointments.push({
      id: crypto.randomUUID(),
      patient_id: "",
      patient_name: p.name,
      doctor_id: d.id,
      department_id: d.department_id,
      slot_id: null,
      token:
        Math.max(
          0,
          ...data.appointments
            .filter((x) => x.department_id === d.department_id)
            .map((x) => x.token),
        ) + 1,
      hospital_date: hospitalDate(),
      status: "checked_in",
      symptoms: p.symptoms,
      priority: null,
      arrived_at: now,
      called_at: null,
      started_at: null,
      completed_at: null,
      created_at: now,
      qr_token: crypto.randomUUID(),
      qr_expires_at: new Date(Date.now() + 43200000).toISOString(),
    });
  } else {
    if (role !== "admin") throw Error("Administrator required");
    if (c.action === "resource") {
      const row = { ...p, id: p.id || crypto.randomUUID() };
      data.resources = data.resources.filter((x) => x.id !== row.id);
      data.resources.push(row as any);
    } else if (c.action === "department") {
      const row = { ...p, id: p.id || crypto.randomUUID() };
      data.departments = data.departments.filter((x) => x.id !== row.id);
      data.departments.push(row as any);
    } else if (c.action === "slot" || c.action === "shift") {
      const d = data.doctors.find((x) => x.id === p.doctor_id)!;
      if (p.ends_at <= p.starts_at) throw Error("End must be after start");
      if (c.action === "shift")
        data.shifts.push({ ...p, id: crypto.randomUUID() } as any);
      else
        data.slots.push({
          ...p,
          id: crypto.randomUUID(),
          department_id: d.department_id,
        } as any);
    } else if (c.action === "staff") {
      throw Error(
        "Role provisioning is available in connected mode only. Demo roles are fixed.",
      );
    }
  }
  data.audit.unshift({
    id: crypto.randomUUID(),
    action: c.action,
    created_at: now,
  });
  if (["book", "transition", "call_next"].includes(c.action))
    data.notifications.unshift({
      id: crypto.randomUUID(),
      message: `Demo appointment update: ${c.action.replace("_", " ")}. Emails are simulated.`,
      status: "unread",
      created_at: now,
    });
  s.keys.push(c.key);
  save(s);
}
