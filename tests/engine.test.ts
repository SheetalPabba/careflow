import { describe, it, expect } from "vitest";
import {
  canTransition,
  hospitalDate,
  queueFor,
  estimate,
  metrics,
  simulate,
  suggestPriority,
} from "../lib/careflow/engine";
import { parseCommand } from "../lib/careflow/validation";
import type { Appointment } from "../lib/careflow/types";
const a = (id: string, priority: number, doctor_id = "d"): Appointment =>
  ({
    id,
    priority,
    doctor_id,
    arrived_at: "2026-10-11T08:00:00Z",
    status: "waiting",
  }) as Appointment;
describe("queue safeguards", () => {
  it("isolates doctors and excludes unreviewed or unchecked patients", () => {
    expect(
      queueFor(
        [
          a("a", 1),
          a("b", 3),
          a("x", 3, "other"),
          { ...a("y", 3), status: "scheduled" },
          { ...a("z", 3), priority: null },
        ],
        "d",
      ).map((x) => x.id),
    ).toEqual(["b", "a"]);
  });
  it("does not age normal patients ahead of urgency", () =>
    expect(
      queueFor(
        [
          { ...a("old", 1), arrived_at: "2020-01-01T00:00:00Z" },
          a("urgent", 3),
        ],
        "d",
      )[0].id,
    ).toBe("urgent"));
  it("rejects invalid transitions", () => {
    expect(canTransition("scheduled", "completed")).toBe(false);
    expect(canTransition("completed", "waiting")).toBe(false);
    expect(canTransition("called", "in_consultation")).toBe(true);
  });
  it("uses hospital date at UTC boundary", () =>
    expect(hospitalDate(new Date("2026-10-11T19:00:00Z"))).toBe("2026-10-12"));
  it("includes break and active consultation remaining time", () => {
    const r = estimate(
      {
        doctor_id: "d",
        waiting: 2,
        active_started_at: "2026-10-11T08:00:00Z",
        average_minutes: 10,
        samples: 0,
      },
      {
        id: "d",
        name: "d",
        department_id: "x",
        available: true,
        paused_until: "2026-10-11T08:15:00Z",
      },
      1,
      Date.parse("2026-10-11T08:05:00Z"),
    );
    expect(r.low).toBe(18);
    expect(r.high).toBe(36);
    expect(r.explanation).toContain("break");
  });
  it("returns insufficient metrics rather than invented data", () =>
    expect(metrics([]).median).toBeNull());
  it("simulation is deterministic and capacity-limited", () => {
    expect(simulate(20, 2, 10, 10)).toEqual(simulate(20, 2, 10, 10));
    expect(simulate(60, 1, 10, 10).remaining).toBeGreaterThan(100);
  });
  it("labels triage unvalidated", () =>
    expect(suggestPriority({ spo2: 89 }, "").label).toContain("Unvalidated"));
  it("rejects malformed commands and resource over-allocation", () => {
    expect(() =>
      parseCommand({
        action: "staff",
        key: crypto.randomUUID(),
        payload: { id: "bad", role: "admin" },
      }),
    ).toThrow();
    expect(() =>
      parseCommand({
        action: "resource",
        key: crypto.randomUUID(),
        payload: { name: "Bed", total: 1, available: 2 },
      }),
    ).toThrow();
  });
});
