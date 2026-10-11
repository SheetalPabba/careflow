import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const id = (n: number) =>
  `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
async function asUser(n: number) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id(n)}',false);`,
  );
}
async function root() {
  await db.exec("reset role");
}
async function cmd(
  action: string,
  payload: unknown,
  key = crypto.randomUUID(),
) {
  const r = await db.query<{ result: any }>(
    "select public.command($1,$2,$3::jsonb) as result",
    [action, key, JSON.stringify(payload)],
  );
  return r.rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`,
  );
  const sql = readFileSync("supabase/migrations/001_careflow.sql", "utf8")
    .replace("create extension if not exists pgcrypto;", "")
    .replace(/alter publication supabase_realtime[^;]+;/g, "");
  await db.exec(sql);
  await db.exec(
    `insert into departments(id,name) values('${id(10)}','General'),('${id(11)}','Cardiology');insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');update profiles set role='admin' where id='${id(4)}';update profiles set role='doctor',department_id='${id(10)}' where id='${id(2)}';update profiles set role='reception',department_id='${id(10)}' where id='${id(3)}';insert into doctors(id,name,department_id) values('${id(2)}','Doctor','${id(10)}');insert into slots values('${id(20)}','${id(2)}','${id(10)}',now()+interval '1 hour',now()+interval '2 hours',1),('${id(21)}','${id(2)}','${id(10)}',now()+interval '2 hours',now()+interval '3 hours',5);`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("PostgreSQL authorization and workflow", () => {
  let appointment: string;
  let other: string;
  it("public signup ignores a requested administrator role", async () => {
    await root();
    await db.exec(
      `insert into auth.users(id,raw_user_meta_data) values('${id(6)}','{"role":"admin","name":"Attacker"}')`,
    );
    const r = await db.query<any>(
      `select role from profiles where id='${id(6)}'`,
    );
    expect(r.rows[0].role).toBe("patient");
  });
  it("blocks anonymous commands", async () => {
    await db.exec("set role anon");
    await expect(cmd("profile", { name: "Nope" })).rejects.toThrow(
      /permission denied/,
    );
  });
  it("books a slot and replays identical idempotency key", async () => {
    await asUser(1);
    const key = crypto.randomUUID();
    const a = await cmd(
      "book",
      { slot_id: id(20), symptoms: "Synthetic" },
      key,
    );
    const again = await cmd("book", { slot_id: id(20) }, key);
    expect(again.id).toBe(a.id);
    appointment = a.id;
  });
  it("rejects another booking at capacity", async () => {
    await asUser(5);
    await expect(cmd("book", { slot_id: id(20) })).rejects.toThrow(/Slot full/);
  });
  it("prevents direct writes and role escalation", async () => {
    await asUser(1);
    await expect(
      db.exec(`update profiles set role='admin' where id='${id(1)}'`),
    ).rejects.toThrow(/permission denied/);
    await expect(cmd("staff", { id: id(1), role: "admin" })).rejects.toThrow(
      /Administrator/,
    );
  });
  it("enforces cross-patient RLS and command isolation", async () => {
    await asUser(5);
    const r = await db.query("select * from appointments");
    expect(r.rows).toHaveLength(0);
    await expect(
      cmd("transition", { id: appointment, to: "cancelled" }),
    ).rejects.toThrow(/Access denied/);
    other = (await cmd("book", { slot_id: id(21), symptoms: "Test" })).id;
  });
  it("prevents unreviewed consultation and handles repeated QR check-in", async () => {
    await asUser(3);
    await expect(
      cmd("transition", { id: appointment, to: "in_consultation" }),
    ).rejects.toThrow();
    await cmd("checkin", { token: appointment });
    const repeat = await cmd("checkin", { token: appointment });
    expect(repeat.message).toBe("Already checked in");
    await cmd("review", {
      id: appointment,
      priority: 1,
      reason: "Reviewed by nurse",
    });
    await cmd("checkin", { token: other });
    await cmd("review", {
      id: other,
      priority: 3,
      reason: "Urgent clinician review",
    });
  });
  it("respects doctor breaks and confirmed urgent priority", async () => {
    await asUser(2);
    await cmd("pause", { doctor_id: id(2), minutes: 15 });
    await expect(cmd("call_next", { doctor_id: id(2) })).rejects.toThrow(
      /break/,
    );
    await cmd("pause", { doctor_id: id(2), minutes: 0 });
    const result = await cmd("call_next", { doctor_id: id(2) });
    expect(result.id).toBe(other);
    await expect(cmd("call_next", { doctor_id: id(2) })).rejects.toThrow(
      /Finish current/,
    );
  });
  it("sanitizes public display and rejects terminal state replay", async () => {
    await asUser(2);
    await cmd("transition", { id: other, to: "in_consultation" });
    await db.exec("set role anon");
    const board = await db.query<any>("select public.public_board() as board");
    expect(Object.keys(board.rows[0].board[0]).sort()).toEqual([
      "department",
      "room",
      "status",
      "token",
    ]);
    await asUser(2);
    await cmd("transition", {
      id: other,
      to: "completed",
      note: "Private note",
    });
    await expect(
      cmd("transition", { id: other, to: "completed" }),
    ).rejects.toThrow(/Invalid transition/);
  });
  it("protects notes from the patient", async () => {
    await asUser(5);
    const r = await db.query("select * from consultation_notes");
    expect(r.rows).toHaveLength(0);
  });
  it("rejects expired check-in codes", async () => {
    await root();
    await db.exec(
      `update appointments set qr_expires_at=now()-interval '1 minute' where id='${appointment}'`,
    );
    await asUser(3);
    await expect(cmd("checkin", { token: appointment })).rejects.toThrow(
      /expired/,
    );
  });
  it("reserves a waitlist offer and accepts only once", async () => {
    await asUser(1);
    await cmd("transition", { id: appointment, to: "cancelled" });
    await asUser(5);
    await cmd("waitlist", { department_id: id(10) });
    await root();
    await db.query("select run_jobs()");
    await asUser(5);
    const r = await db.query<any>(
      `select * from offers where status='offered'`,
    );
    expect(r.rows.length).toBeGreaterThan(0);
    const o = r.rows[0];
    const result = await cmd("accept_offer", { id: o.id });
    expect(result.id).toBeTruthy();
    await expect(cmd("accept_offer", { id: o.id })).rejects.toThrow(
      /expired or unavailable/,
    );
  });
  it("resource inventory is constrained and audited", async () => {
    await asUser(4);
    await expect(
      cmd("resource", { name: "Beds", total: 2, available: 3 }),
    ).rejects.toThrow();
    await cmd("resource", { name: "Beds", total: 2, available: 1 });
    const rows = await db.query("select * from resource_changes");
    expect(rows.rows).toHaveLength(1);
  });
});
