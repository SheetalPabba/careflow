import type { Appointment, Status, Doctor, QueueStat } from "./types";
export const transitions: Record<Status, Status[]> = {
  scheduled: ["checked_in", "cancelled", "no_show"],
  checked_in: ["waiting", "cancelled"],
  waiting: ["called", "cancelled", "no_show"],
  called: ["in_consultation", "no_show"],
  in_consultation: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};
export function canTransition(from: Status, to: Status) {
  return transitions[from].includes(to);
}
export function hospitalDate(date = new Date(), timezone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function queueFor(rows: Appointment[], doctor: string) {
  return rows
    .filter(
      (a) =>
        a.doctor_id === doctor &&
        a.status === "waiting" &&
        a.priority !== null &&
        a.arrived_at,
    )
    .sort(
      (a, b) =>
        b.priority! - a.priority! ||
        Date.parse(a.arrived_at!) - Date.parse(b.arrived_at!) ||
        a.id.localeCompare(b.id),
    );
}
export function suggestPriority(v: Record<string, number>, symptoms: string) {
  const reasons: string[] = [];
  let priority = 1;
  if (v.spo2 !== undefined && v.spo2 < 92) {
    priority = 3;
    reasons.push("Low oxygen reading requires staff review");
  }
  if (v.temperature !== undefined && v.temperature >= 39) {
    priority = Math.max(priority, 2);
    reasons.push("Elevated temperature reading");
  }
  if (
    /chest pain|breathing difficulty|unconscious|severe bleeding/i.test(
      symptoms,
    )
  ) {
    priority = 3;
    reasons.push("Urgent symptom phrase requires staff review");
  }
  return {
    priority,
    reasons: reasons.length
      ? reasons
      : ["No configured rule triggered; staff review still required"],
    label: "Unvalidated rule suggestion — not a diagnosis",
  };
}
export function estimate(
  stat: QueueStat,
  doctor: Doctor,
  ahead: number,
  now = Date.now(),
) {
  const m = stat.average_minutes;
  const remaining = stat.active_started_at
    ? Math.max(0, m - (now - Date.parse(stat.active_started_at)) / 60000)
    : 0;
  const pause =
    Math.max(0, (Date.parse(doctor.paused_until || "") - now) / 60000) || 0;
  const mid = Math.max(0, ahead * m + remaining + pause);
  return {
    low: Math.floor(mid * 0.75),
    high: Math.ceil(mid * 1.3 + 3),
    confidence:
      stat.samples >= 10
        ? "Recent consultation history"
        : "Limited history · department baseline",
    explanation: pause
      ? "Your doctor is currently on a break."
      : "Based on patients ahead and recent consultation durations.",
  };
}
export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(p * s.length) - 1)];
}
export function metrics(rows: Appointment[]) {
  const completed = rows.filter((a) => a.status === "completed");
  const waits = completed
    .filter((a) => a.arrived_at && a.started_at)
    .map(
      (a) => (Date.parse(a.started_at!) - Date.parse(a.arrived_at!)) / 60000,
    );
  const duration = completed
    .filter((a) => a.started_at && a.completed_at)
    .map(
      (a) => (Date.parse(a.completed_at!) - Date.parse(a.started_at!)) / 60000,
    );
  const terminal = rows.filter((a) =>
    ["completed", "cancelled", "no_show"].includes(a.status),
  );
  return {
    median: percentile(waits, 0.5),
    p90: percentile(waits, 0.9),
    consultation: duration.length
      ? duration.reduce((a, b) => a + b, 0) / duration.length
      : null,
    completed: completed.length,
    cancelled: rows.filter((a) => a.status === "cancelled").length,
    noShows: rows.filter((a) => a.status === "no_show").length,
    terminal: terminal.length,
    total: rows.length,
  };
}
export function simulate(
  arrivals: number,
  doctors: number,
  minutes: number,
  urgent: number,
  seed = 42,
) {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const free = Array(doctors).fill(0);
  let queue: { at: number; priority: number }[] = [];
  const waits: number[] = [];
  const points: { hour: string; queue: number }[] = [];
  let busy = 0;
  for (let t = 0; t < 480; t++) {
    let n =
      Math.floor(arrivals / 60) + (random() < (arrivals / 60) % 1 ? 1 : 0);
    while (n-- > 0)
      queue.push({ at: t, priority: random() < urgent / 100 ? 3 : 1 });
    queue.sort((a, b) => b.priority - a.priority || a.at - b.at);
    for (let i = 0; i < doctors; i++) {
      if (free[i] <= t && queue.length) {
        const p = queue.shift()!;
        waits.push(t - p.at);
        const d = Math.max(1, Math.round(minutes * (0.75 + random() * 0.5)));
        free[i] = t + d;
        busy += Math.min(d, 480 - t);
      }
    }
    if (t % 60 === 59)
      points.push({ hour: `${(t / 60 + 1) | 0}h`, queue: queue.length });
  }
  return {
    points,
    served: waits.length,
    median: percentile(waits, 0.5),
    p90: percentile(waits, 0.9),
    utilization: Math.round((100 * busy) / (doctors * 480)),
    remaining: queue.length,
  };
}
export function rankDoctors(
  doctors: Doctor[],
  stats: QueueStat[],
  shifts: { doctor_id: string; starts_at: string; ends_at: string }[],
  department: string,
  now = Date.now(),
) {
  return doctors
    .filter((d) => d.available && d.department_id === department)
    .map((d) => {
      const s = stats.find((x) => x.doctor_id === d.id);
      const shift = shifts
        .filter(
          (x) =>
            x.doctor_id === d.id &&
            Date.parse(x.starts_at) <= now &&
            Date.parse(x.ends_at) > now,
        )
        .sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at))[0];
      const remaining = shift ? (Date.parse(shift.ends_at) - now) / 60000 : 0;
      const workload = (s?.waiting || 0) * (s?.average_minutes || 15);
      const pause =
        Math.max(0, (Date.parse(d.paused_until || "") - now) / 60000) || 0;
      const score =
        workload +
        pause +
        (remaining <= workload ? 500 : 0) +
        (shift ? 0 : 1000);
      return {
        doctor: d,
        score,
        explanation: `${s?.waiting || 0} waiting · ${Math.round(s?.average_minutes || 15)}m consultation estimate · ${shift ? Math.round(remaining) + "m shift remaining" : "no active shift"}${pause ? " · on break" : ""}`,
      };
    })
    .sort((a, b) => a.score - b.score);
}
