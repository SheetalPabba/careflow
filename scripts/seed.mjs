import { createClient } from "@supabase/supabase-js";
// Run against a NEW development Supabase project only. Never use real patient records.
const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: key,
  CAREFLOW_DEMO_PASSWORD: password,
} = process.env;
if (!url || !key || !password || password.length < 12)
  throw Error(
    "Set Supabase URL, service-role key and CAREFLOW_DEMO_PASSWORD (12+ characters) in your local environment.",
  );
const db = createClient(url, key, { auth: { persistSession: false } });
async function check(p) {
  const r = await p;
  if (r.error) throw Error(r.error.message);
  return r.data;
}
const deps = await check(
  db
    .from("departments")
    .insert([
      { name: "General Medicine", room: "G-101", default_minutes: 12 },
      { name: "Cardiology", room: "C-204", default_minutes: 20 },
      { name: "Orthopedics", room: "O-108", default_minutes: 15 },
    ])
    .select(),
);
const users = [];
for (const [role, name, email, department] of [
  ["admin", "Demo Administrator", "admin@careflow.example.test", null],
  ["patient", "Demo Patient", "patient@careflow.example.test", null],
  ["doctor", "Dr. Meera Shah", "doctor@careflow.example.test", deps[0].id],
  [
    "reception",
    "Demo Reception",
    "reception@careflow.example.test",
    deps[0].id,
  ],
]) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw Error(error.message);
  await check(
    db
      .from("profiles")
      .update({ role, department_id: department })
      .eq("id", data.user.id),
  );
  users.push({ id: data.user.id, role, name });
  if (role === "doctor")
    await check(
      db
        .from("doctors")
        .insert({ id: data.user.id, name, department_id: department }),
    );
}
const doctor = users.find((u) => u.role === "doctor");
const starts = new Date(Date.now() + 30 * 60000);
const end = new Date(starts.getTime() + 8 * 3600000);
await check(
  db
    .from("shifts")
    .insert({
      doctor_id: doctor.id,
      starts_at: starts.toISOString(),
      ends_at: end.toISOString(),
    }),
);
await check(
  db
    .from("slots")
    .insert(
      Array.from({ length: 12 }, (_, i) => ({
        doctor_id: doctor.id,
        department_id: deps[0].id,
        starts_at: new Date(starts.getTime() + i * 30 * 60000).toISOString(),
        ends_at: new Date(
          starts.getTime() + (i + 1) * 30 * 60000,
        ).toISOString(),
        capacity: 3,
      })),
    ),
);
await check(
  db.from("resources").insert([
    { name: "General beds", total: 60, available: 18 },
    { name: "ICU beds", total: 12, available: 4 },
    { name: "Ventilators", total: 8, available: 5 },
    { name: "Wheelchairs", total: 20, available: 13 },
  ]),
);
console.log(
  "Synthetic development setup created. Use the four @careflow.example.test accounts listed in SETUP.md with your supplied password. No passwords were printed.",
);
