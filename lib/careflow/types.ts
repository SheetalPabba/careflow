export type Role = "patient" | "reception" | "doctor" | "admin";
export type Status =
  | "scheduled"
  | "checked_in"
  | "waiting"
  | "called"
  | "in_consultation"
  | "completed"
  | "cancelled"
  | "no_show";
export interface Profile {
  id: string;
  name: string;
  role: Role;
  department_id: string | null;
  email_opt_in: boolean;
}
export interface Department {
  id: string;
  name: string;
  room: string;
  default_minutes: number;
}
export interface Doctor {
  id: string;
  name: string;
  department_id: string;
  paused_until: string | null;
  available: boolean;
}
export interface Slot {
  id: string;
  doctor_id: string;
  department_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
}
export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  doctor_id: string;
  department_id: string;
  slot_id: string | null;
  token: number;
  hospital_date: string;
  status: Status;
  symptoms: string;
  priority: number | null;
  arrived_at: string | null;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  qr_token?: string;
  qr_expires_at?: string;
  vitals?: Record<string, number>;
}
export interface Resource {
  id: string;
  name: string;
  total: number;
  available: number;
}
export interface Snapshot {
  profile: Profile;
  profiles: Profile[];
  departments: Department[];
  doctors: Doctor[];
  slots: Slot[];
  appointments: Appointment[];
  resources: Resource[];
  notifications: {
    id: string;
    message: string;
    status: string;
    created_at: string;
  }[];
  audit: { id: string; action: string; created_at: string }[];
  feedback: { appointment_id: string; rating: number }[];
  waitlist: { id: string; department_id: string; status: string }[];
  offers: { id: string; slot_id: string; expires_at: string; status: string }[];
  shifts: {
    id: string;
    doctor_id: string;
    starts_at: string;
    ends_at: string;
  }[];
  queue_stats: QueueStat[];
}
export interface QueueStat {
  doctor_id: string;
  waiting: number;
  active_started_at: string | null;
  average_minutes: number;
  samples: number;
  ahead?: number;
}
export interface Command {
  action: string;
  key: string;
  payload: Record<string, unknown>;
}
