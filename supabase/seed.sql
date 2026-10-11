-- Optional catalog-only seed. Do not also run this if using scripts/seed.mjs.
insert into public.departments(name,room,default_minutes) values
('General Medicine','G-101',12),('Cardiology','C-204',20),('Orthopedics','O-108',15);
insert into public.resources(name,total,available) values
('General beds',60,18),('ICU beds',12,4),('Ventilators',8,5),('Wheelchairs',20,13);
