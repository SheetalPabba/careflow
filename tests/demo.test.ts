import { beforeEach, describe, it, expect, vi } from "vitest";
import { demoSnapshot, demoCommand, resetDemo } from "../lib/careflow/demo";
import { rankDoctors } from "../lib/careflow/engine";
const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) || null,
    setItem: (k: string, v: string) => memory.set(k, v),
  });
  resetDemo();
});
const run = (
  role: any,
  action: string,
  payload: any,
  key = crypto.randomUUID(),
) => demoCommand(role, { action, key, payload });
describe("isolated synthetic demo", () => {
  it("persists reception to doctor workflow without sharing patient records", () => {
    const patient = demoSnapshot("patient");
    expect(patient.appointments).toHaveLength(1);
    const a = patient.appointments[0];
    run("reception", "checkin", { token: a.id });
    run("reception", "review", {
      id: a.id,
      priority: 3,
      reason: "Synthetic review",
    });
    const doc = demoSnapshot("doctor").profile.id;
    run("doctor", "call_next", { doctor_id: doc });
    expect(demoSnapshot("patient").appointments[0].status).toBe("called");
    run("doctor", "transition", { id: a.id, to: "in_consultation" });
    run("doctor", "transition", { id: a.id, to: "completed" });
    expect(demoSnapshot("patient").appointments[0].completed_at).toBeTruthy();
  });
  it("replays a booking key only once", () => {
    const d = demoSnapshot("patient");
    const key = crypto.randomUUID();
    const payload = { slot_id: d.slots[0].id, symptoms: "Synthetic" };
    run("patient", "book", payload, key);
    run("patient", "book", payload, key);
    expect(demoSnapshot("patient").appointments).toHaveLength(2);
  });
  it("rolls back rejected changes", () => {
    const d = demoSnapshot("patient");
    expect(() =>
      run("patient", "transition", {
        id: d.appointments[0].id,
        to: "completed",
      }),
    ).toThrow();
    expect(demoSnapshot("patient").appointments[0].status).toBe("scheduled");
  });
  it("doctor suggestions include shift and workload evidence", () => {
    const d = demoSnapshot("admin");
    const ranked = rankDoctors(
      d.doctors,
      d.queue_stats,
      d.shifts,
      d.departments[0].id,
    );
    expect(ranked[0].explanation).toContain("shift remaining");
    expect(ranked[0].doctor.department_id).toBe(d.departments[0].id);
  });
});
