import { z } from "zod";
const id = z.string().uuid();
const str = z.string().trim().min(1).max(1000);
export const vitals = z.object({
  temperature: z.number().min(25).max(45).optional(),
  spo2: z.number().min(1).max(100).optional(),
  systolic: z.number().min(40).max(300).optional(),
  age: z.number().int().min(0).max(130).optional(),
});
export const payloads = {
  book: z.object({
    slot_id: id,
    symptoms: z.string().max(2000),
    vitals: vitals.optional(),
  }),
  transition: z.object({
    id,
    to: z.enum([
      "checked_in",
      "waiting",
      "called",
      "in_consultation",
      "completed",
      "cancelled",
      "no_show",
    ]),
    note: z.string().max(2000).optional(),
  }),
  checkin: z.object({ token: str }),
  review: z.object({
    id,
    priority: z.number().int().min(1).max(3),
    reason: str,
    vitals: vitals.optional(),
  }),
  call_next: z.object({ doctor_id: id }),
  pause: z.object({ doctor_id: id, minutes: z.number().int().min(0).max(120) }),
  reassign: z.object({ id, doctor_id: id, reason: str }),
  reschedule: z.object({ id, slot_id: id }),
  profile: z.object({
    name: z.string().trim().min(2).max(100),
    email_opt_in: z.boolean(),
  }),
  feedback: z.object({
    id,
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000),
  }),
  waitlist: z.object({ department_id: id }),
  accept_offer: z.object({ id }),
  resource: z
    .object({
      id: id.optional(),
      name: z.string().min(1).max(100),
      total: z.number().int().min(0).max(10000),
      available: z.number().int().min(0).max(10000),
    })
    .refine((p) => p.available <= p.total),
  department: z.object({
    id: id.optional(),
    name: z.string().min(2).max(100),
    room: z.string().max(30),
    default_minutes: z.number().int().min(1).max(120),
  }),
  staff: z.object({
    id,
    role: z.enum(["patient", "doctor", "reception", "admin"]),
    department_id: id.nullable(),
  }),
  slot: z.object({
    doctor_id: id,
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    capacity: z.number().int().min(1).max(30),
  }),
  shift: z.object({
    doctor_id: id,
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
  }),
  walkin: z.object({
    name: z.string().min(2).max(100),
    doctor_id: id,
    symptoms: z.string().max(2000),
  }),
  mark_read: z.object({ id }),
};
export function parseCommand(input: unknown) {
  const c = z
    .object({
      action: z.enum(
        Object.keys(payloads) as [
          keyof typeof payloads,
          ...(keyof typeof payloads)[],
        ],
      ),
      key: id,
      payload: z.unknown(),
    })
    .parse(input);
  return { ...c, payload: payloads[c.action].parse(c.payload) };
}
