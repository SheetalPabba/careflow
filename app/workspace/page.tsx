"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { api, getClient } from "@/lib/careflow/client";
import { demoSnapshot, demoCommand, resetDemo } from "@/lib/careflow/demo";
import {
  estimate,
  metrics,
  queueFor,
  simulate,
  suggestPriority,
  hospitalDate,
  rankDoctors,
} from "@/lib/careflow/engine";
import type { Snapshot, Role, Appointment, Doctor } from "@/lib/careflow/types";
type Data = Snapshot & { positions?: Record<string, number> };
type Modal = { kind: string; a?: Appointment; id?: string; row?: any };
const icons = {
  overview: LayoutDashboard,
  appointments: CalendarDays,
  queue: Users,
  analytics: Activity,
  resources: Warehouse,
  team: Stethoscope,
  simulation: FlaskConical,
  settings: Settings2,
};
const titles: Record<string, string> = {
  overview: "Overview",
  appointments: "Appointments",
  queue: "Live queue",
  analytics: "Analytics",
  resources: "Resources",
  team: "Care team",
  simulation: "Simulation lab",
  settings: "My profile",
};
const hi: Record<string, string> = {
  Overview: "अवलोकन",
  Appointments: "अपॉइंटमेंट",
  "Live queue": "लाइव कतार",
  Analytics: "विश्लेषण",
  Resources: "संसाधन",
  "Care team": "देखभाल टीम",
  "Simulation lab": "सिमुलेशन लैब",
  "My profile": "मेरी प्रोफ़ाइल",
  "Book appointment": "अपॉइंटमेंट बुक करें",
  Refresh: "रीफ़्रेश",
  "Sign out": "साइन आउट",
  "Search patients or tokens": "मरीज़ या टोकन खोजें",
  "All departments": "सभी विभाग",
  "No appointments to show.": "कोई अपॉइंटमेंट नहीं है।",
  Save: "सहेजें",
  Cancel: "रद्द करें",
  Patient: "मरीज़",
  Doctor: "डॉक्टर",
  Reception: "रिसेप्शन",
  Admin: "प्रशासक",
  Notifications: "सूचनाएँ",
  "Good care starts with clarity.": "बेहतर देखभाल स्पष्टता से शुरू होती है।",
  "Waiting for care": "देखभाल की प्रतीक्षा",
  "In consultation": "परामर्श जारी",
  Completed: "पूर्ण",
  "Median wait": "मध्य प्रतीक्षा",
  "Queue overview": "कतार अवलोकन",
  "View queue": "कतार देखें",
  "Today’s care team": "आज की देखभाल टीम",
  "Check in": "चेक इन",
  "Review priority": "प्राथमिकता समीक्षा",
  "Start consultation": "परामर्श शुरू करें",
  Complete: "पूर्ण करें",
  Reschedule: "समय बदलें",
  "Show token": "टोकन दिखाएँ",
  Feedback: "प्रतिक्रिया",
  "Call next patient": "अगले मरीज़ को बुलाएँ",
  "Take 15m break": "15 मिनट का विराम",
  "Resume queue": "कतार फिर शुरू करें",
};
const time = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const statusName = (s: string) => s.replaceAll("_", " ");
function ModalShell({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} className="modal">
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: typeof Activity;
}) {
  return (
    <article className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}
export default function Workspace() {
  const pendingCommand = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const [data, setData] = useState<Data | null>(null);
  const [demo, setDemo] = useState(false);
  const [role, setRole] = useState<Role>("admin");
  const [tab, setTab] = useState("overview");
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [qr, setQr] = useState("");
  const [arrivals, setArrivals] = useState(12);
  const [doctorCount, setDoctorCount] = useState(3);
  const [duration, setDuration] = useState(12);
  const [urgent, setUrgent] = useState(10);
  const [bookDepartment, setBookDepartment] = useState("");
  const t = (s: string) => (language === "hi" ? hi[s] || s : s);
  const load = useCallback(async (isDemo: boolean, currentRole: Role) => {
    try {
      const d = isDemo ? demoSnapshot(currentRole) : await api("/api/data");
      setData(d);
      setRole(d.profile.role);
      setLastUpdated(new Date().toLocaleTimeString());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const isDemo = new URLSearchParams(location.search).get("demo") === "1";
    setDemo(isDemo);
    load(isDemo, "admin");
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, [load]);
  useEffect(() => {
    let stop = () => {};
    if (!demo) {
      getClient().then((c) => {
        if (!c) return;
        const ch = c
          .channel("careflow-updates")
          .on("postgres_changes", { event: "*", schema: "public" }, () =>
            load(false, role),
          )
          .subscribe();
        stop = () => {
          c.removeChannel(ch);
        };
      });
    }
    const id = setInterval(() => load(demo, role), 30000);
    return () => {
      stop();
      clearInterval(id);
    };
  }, [demo, role, load]);
  useEffect(() => {
    if (modal?.kind === "token" && modal.a?.qr_token)
      QRCode.toDataURL(modal.a.qr_token, { width: 220, margin: 2 }).then(setQr);
    else setQr("");
  }, [modal]);
  async function command(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const fingerprint = JSON.stringify({ action, payload });
      if (pendingCommand.current?.fingerprint !== fingerprint)
        pendingCommand.current = { fingerprint, key: crypto.randomUUID() };
      const c = { action, key: pendingCommand.current.key, payload };
      if (demo) demoCommand(role, c);
      else await api("/api/command", c);
      pendingCommand.current = null;
      setModal(null);
      setMessage(
        demo
          ? "Saved in this browser’s synthetic demo."
          : "Saved successfully.",
      );
      await load(demo, role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sim = useMemo(
    () => simulate(arrivals, doctorCount, duration, urgent),
    [arrivals, doctorCount, duration, urgent],
  );
  if (!data)
    return (
      <main className="loading-page">
        <a className="brand" href="/">
          ✚ CareFlow
        </a>
        <h1>{error ? "Workspace unavailable" : "Opening your workspace…"}</h1>
        <p role="alert">{error}</p>
        <a className="btn primary" href="/login">
          Sign in
        </a>
        <a className="btn ghost" href="/workspace?demo=1">
          Explore demo
        </a>
      </main>
    );
  const filtered = data.appointments.filter(
    (a) =>
      (!department || a.department_id === department) &&
      (!doctorFilter || a.doctor_id === doctorFilter) &&
      (!dateFilter || a.hospital_date === dateFilter) &&
      (!search ||
        `${a.patient_name} ${a.token} ${a.status}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const m = metrics(filtered);
  const waiting = filtered.filter((a) =>
    ["checked_in", "waiting", "called"].includes(a.status),
  );
  const current = filtered.filter((a) => a.status === "in_consultation");
  const isPatient = role === "patient";
  const isAdmin = role === "admin";
  const tabs = isAdmin
    ? [
        "overview",
        "appointments",
        "queue",
        "analytics",
        "resources",
        "team",
        "simulation",
        "settings",
      ]
    : isPatient
      ? ["overview", "appointments", "settings"]
      : ["overview", "queue", "appointments", "settings"];
  const myDoctor = data.doctors.find((d) => d.id === data.profile.id);
  const rows =
    tab === "queue"
      ? filtered
          .filter((a) =>
            ["checked_in", "waiting", "called", "in_consultation"].includes(
              a.status,
            ),
          )
          .sort(
            (a, b) =>
              (b.priority || 0) - (a.priority || 0) ||
              Date.parse(a.arrived_at || a.created_at) -
                Date.parse(b.arrived_at || b.created_at),
          )
      : filtered;
  const departmentName = (id: string) =>
    data.departments.find((d) => d.id === id)?.name || "Department";
  const doctorName = (id: string) =>
    data.doctors.find((d) => d.id === id)?.name || "Doctor";
  function ahead(a: Appointment) {
    return isPatient
      ? (data!.positions?.[a.id] ?? 0)
      : Math.max(
          0,
          queueFor(data!.appointments, a.doctor_id).findIndex(
            (x) => x.id === a.id,
          ),
        );
  }
  function wait(a: Appointment) {
    if (a.status === "scheduled") return "After check-in";
    if (a.status === "checked_in") return "Awaiting review";
    if (a.status === "called") return "Your turn";
    if (a.status === "in_consultation") return "With doctor";
    if (a.status !== "waiting") return "—";
    const d = data!.doctors.find((x) => x.id === a.doctor_id)!;
    const stat = data!.queue_stats.find((x) => x.doctor_id === d.id);
    if (!stat) return "Insufficient data";
    const e = estimate(stat, d, ahead(a));
    return `${e.low}–${e.high} min`;
  }
  function open(kind: string, a?: Appointment, row?: any) {
    setError("");
    setBookDepartment(a?.department_id || "");
    setModal({ kind, a, row });
  }
  function exportCsv() {
    const entries = [
      ["Metric", "Value"],
      ["Appointments", m.total],
      ["Median waiting minutes", m.median ?? "Insufficient data"],
      ["P90 waiting minutes", m.p90 ?? "Insufficient data"],
      ["Average consultation minutes", m.consultation ?? "Insufficient data"],
      ["Completed", m.completed],
      ["Cancelled", m.cancelled],
      ["No show", m.noShows],
      ["Terminal denominator", m.terminal],
    ];
    const blob = new Blob([entries.map((r) => r.join(",")).join("\n")], {
      type: "text/csv",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "careflow-aggregate-metrics.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const Table = ({ items }: { items: Appointment[] }) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Token / {t("Patient")}</th>
            <th>{t("Doctor")}</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Wait estimate</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>
                <div className="patient-cell">
                  <span className="token">
                    {String(a.token).padStart(3, "0")}
                  </span>
                  <div>
                    <strong>{a.patient_name}</strong>
                    <small>{departmentName(a.department_id)}</small>
                  </div>
                </div>
              </td>
              <td>
                {doctorName(a.doctor_id).replace("Dr. ", "")}
                <small>{a.hospital_date}</small>
              </td>
              <td>
                <span
                  className={`badge ${a.status === "completed" ? "green" : a.status === "in_consultation" ? "blue" : a.status === "called" ? "purple" : "neutral"}`}
                >
                  {statusName(a.status)}
                </span>
              </td>
              <td>
                <span className={`priority priority-${a.priority || 0}`}>
                  {a.priority === 3
                    ? "● Urgent"
                    : a.priority === 2
                      ? "● Elevated"
                      : a.priority === 1
                        ? "● Routine"
                        : "○ Needs review"}
                </span>
                {a.arrived_at &&
                  Date.now() - Date.parse(a.arrived_at) > 3600000 &&
                  ["waiting", "checked_in"].includes(a.status) && (
                    <small className="warn">Long wait · review</small>
                  )}
              </td>
              <td>
                <strong>{wait(a)}</strong>
                {a.status === "waiting" && (
                  <small>Position {ahead(a) + 1}</small>
                )}
              </td>
              <td>
                <div className="row-actions">
                  {isPatient && a.status === "scheduled" && (
                    <>
                      <button onClick={() => open("token", a)}>
                        {t("Show token")}
                      </button>
                      <button onClick={() => open("reschedule", a)}>
                        {t("Reschedule")}
                      </button>
                    </>
                  )}
                  {isPatient &&
                    ["scheduled", "checked_in", "waiting"].includes(
                      a.status,
                    ) && (
                      <button onClick={() => open("cancel", a)}>
                        {t("Cancel")}
                      </button>
                    )}
                  {isPatient && a.status === "completed" && (
                    <button onClick={() => open("feedback", a)}>
                      {t("Feedback")}
                    </button>
                  )}
                  {["reception", "admin"].includes(role) &&
                    a.status === "scheduled" && (
                      <button
                        onClick={() => command("checkin", { token: a.id })}
                        disabled={busy}
                      >
                        {t("Check in")}
                      </button>
                    )}
                  {!isPatient &&
                    ["checked_in", "waiting"].includes(a.status) && (
                      <button onClick={() => open("review", a)}>
                        {t("Review priority")}
                      </button>
                    )}
                  {["reception", "admin"].includes(role) &&
                    ["checked_in", "waiting"].includes(a.status) && (
                      <button onClick={() => open("reassign", a)}>
                        Reassign
                      </button>
                    )}
                  {role === "doctor" && a.status === "called" && (
                    <button
                      onClick={() =>
                        command("transition", {
                          id: a.id,
                          to: "in_consultation",
                        })
                      }
                      disabled={busy}
                    >
                      {t("Start consultation")}
                    </button>
                  )}
                  {role === "doctor" && a.status === "in_consultation" && (
                    <button onClick={() => open("complete", a)}>
                      {t("Complete")}
                    </button>
                  )}
                  {!isPatient &&
                    ["scheduled", "waiting", "called"].includes(a.status) && (
                      <button onClick={() => open("no_show", a)}>
                        No-show
                      </button>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <div className="empty">
          <CalendarDays />
          <h3>{t("No appointments to show.")}</h3>
          <p>Bookings and checked-in patients will appear here.</p>
        </div>
      )}
    </div>
  );
  async function submitModal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const p: Record<string, any> = Object.fromEntries(form);
    const kind = modal!.kind;
    const a = modal!.a;
    if (["book", "reschedule"].includes(kind)) {
      if (kind === "book") {
        const v: Record<string, number> = {};
        for (const key of ["temperature", "spo2", "systolic", "age"])
          if (p[key] !== "") v[key] = Number(p[key]);
        await command("book", {
          slot_id: p.slot_id,
          symptoms: p.symptoms || "",
          vitals: v,
        });
      } else await command("reschedule", { id: a!.id, slot_id: p.slot_id });
    } else if (kind === "review") {
      const v: Record<string, number> = {};
      for (const key of ["temperature", "spo2", "systolic", "age"])
        if (p[key] !== "") v[key] = Number(p[key]);
      await command("review", {
        id: a!.id,
        priority: Number(p.priority),
        reason: p.reason,
        vitals: v,
      });
    } else if (["complete", "cancel", "no_show"].includes(kind))
      await command("transition", {
        id: a!.id,
        to:
          kind === "complete"
            ? "completed"
            : kind === "cancel"
              ? "cancelled"
              : "no_show",
        note: p.note || "",
      });
    else if (kind === "feedback")
      await command("feedback", {
        id: a!.id,
        rating: Number(p.rating),
        comment: p.comment,
      });
    else if (kind === "reassign")
      await command("reassign", {
        id: a!.id,
        doctor_id: p.doctor_id,
        reason: p.reason,
      });
    else if (kind === "checkin") await command("checkin", { token: p.token });
    else if (kind === "walkin")
      await command("walkin", {
        name: p.name,
        doctor_id: p.doctor_id,
        symptoms: p.symptoms,
      });
    else if (kind === "resource")
      await command(kind, {
        ...(modal!.row?.id ? { id: modal!.row.id } : {}),
        name: p.name,
        total: Number(p.total),
        available: Number(p.available),
      });
    else if (kind === "department")
      await command(kind, {
        ...(modal!.row?.id ? { id: modal!.row.id } : {}),
        name: p.name,
        room: p.room,
        default_minutes: Number(p.default_minutes),
      });
    else if (kind === "slot" || kind === "shift")
      await command(kind, {
        doctor_id: p.doctor_id,
        starts_at: new Date(p.starts_at).toISOString(),
        ends_at: new Date(p.ends_at).toISOString(),
        ...(kind === "slot" ? { capacity: Number(p.capacity) } : {}),
      });
    else if (kind === "staff")
      await command("staff", {
        id: p.id,
        role: p.role,
        department_id: p.department_id || null,
      });
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Plus size={20} />
          </span>
          CareFlow
        </a>
        <p className="sidebar-label">HOSPITAL WORKSPACE</p>
        <nav>
          {tabs.map((k) => {
            const Icon = icons[k as keyof typeof icons];
            return (
              <button
                key={k}
                className={tab === k ? "active" : ""}
                onClick={() => {
                  setTab(k);
                  setSearch("");
                }}
              >
                <Icon size={18} />
                {t(titles[k])}
                {k === "queue" && (
                  <span className="nav-count">{waiting.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="prototype-note">
            <ShieldCheck size={18} />
            <strong>Care with oversight</strong>
            <p>Priority suggestions always need a clinical review.</p>
          </div>
          <a
            href={demo ? "/display?demo=1" : "/display"}
            target="_blank"
            rel="noreferrer"
          >
            Open waiting-room display ↗
          </a>
          <div className="sidebar-user">
            <span className="avatar">
              {data.profile.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{data.profile.name}</strong>
              <small>{role === "reception" ? "Reception / nurse" : role}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{t(titles[tab])}</strong>
          </div>
          <div className="top-actions">
            <span className="live-status">
              <span className="live-dot" />
              {demo ? "Browser demo" : "Connected"}
            </span>
            <select
              aria-label="Language"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                document.documentElement.lang = e.target.value;
              }}
            >
              <option value="en">EN</option>
              <option value="hi">हिन्दी</option>
            </select>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
              {data.notifications.some((n) => n.status === "unread") && <i />}
            </button>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                const c = await getClient();
                if (!demo) await c?.auth.signOut();
                location.href = "/";
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="workspace-main">
          {demo && (
            <div className="demo-banner">
              <span>
                <FlaskConical size={16} />
                <strong>Synthetic demo</strong> · Changes stay in this browser;
                no real patient data.
              </span>
              <div>
                <label>
                  Explore as{" "}
                  <select
                    aria-label="Demo role"
                    value={role}
                    onChange={(e) => {
                      const r = e.target.value as Role;
                      setRole(r);
                      setTab("overview");
                      setDepartment("");
                      setDoctorFilter("");
                      load(true, r);
                    }}
                  >
                    <option value="admin">Admin</option>
                    <option value="patient">Patient</option>
                    <option value="reception">Reception</option>
                    <option value="doctor">Doctor</option>
                  </select>
                </label>
                <button
                  onClick={() => {
                    resetDemo();
                    load(true, role);
                    setMessage("Demo reset.");
                  }}
                >
                  Reset demo
                </button>
              </div>
            </div>
          )}
          {offline && (
            <div className="notice error">
              You’re offline. Connected updates are paused; reconnect before
              saving.
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              {message}
              <button
                onClick={() => setMessage("")}
                aria-label="Dismiss message"
              >
                ×
              </button>
            </div>
          )}
          {notifications && (
            <section className="panel notification-panel">
              <div className="section-heading">
                <h2>{t("Notifications")}</h2>
                <button onClick={() => setNotifications(false)}>Close</button>
              </div>
              {!data.notifications.length ? (
                <p>No notifications yet.</p>
              ) : (
                data.notifications.map((n) => (
                  <div className="notification" key={n.id}>
                    <span>
                      {n.message}
                      <small>{time(n.created_at)}</small>
                    </span>
                    {n.status === "unread" && (
                      <button
                        onClick={() => command("mark_read", { id: n.id })}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))
              )}
            </section>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Date().toLocaleDateString(
                  language === "hi" ? "hi-IN" : "en-IN",
                  { weekday: "long", day: "numeric", month: "long" },
                )}
              </div>
              <h1>
                {tab === "overview"
                  ? t("Good care starts with clarity.")
                  : t(titles[tab])}
              </h1>
              <p>
                {tab === "overview"
                  ? `Welcome, ${data.profile.name}. Here’s your patient flow at a glance.`
                  : tab === "queue"
                    ? "A shared view of arrivals, reviewed priority, and the next handoff."
                    : tab === "simulation"
                      ? "Explore capacity decisions with an isolated, reproducible model."
                      : "Organize the details that keep care moving."}
              </p>
            </div>
            <div className="heading-actions">
              <button className="btn ghost" onClick={() => load(demo, role)}>
                <RefreshCw size={16} />
                {t("Refresh")}
              </button>
              {isPatient && (
                <Button className="btn primary" onClick={() => open("book")}>
                  <Plus size={17} />
                  {t("Book appointment")}
                </Button>
              )}
              {["admin", "reception"].includes(role) && (
                <Button className="btn primary" onClick={() => open("walkin")}>
                  <Plus size={17} />
                  Register walk-in
                </Button>
              )}
            </div>
          </div>
          {["overview", "analytics"].includes(tab) && (
            <div className="stats-grid">
              <Stat
                label={t("Waiting for care")}
                value={waiting.length}
                sub="Checked in, waiting or called"
                icon={Users}
              />
              <Stat
                label={t("In consultation")}
                value={current.length}
                sub="With their assigned doctor"
                icon={Stethoscope}
              />
              <Stat
                label={t("Completed")}
                value={m.completed}
                sub="Within the current data filters"
                icon={Check}
              />
              <Stat
                label={t("Median wait")}
                value={m.median === null ? "—" : `${Math.round(m.median)}m`}
                sub={
                  m.median === null
                    ? "Insufficient completed records"
                    : "Arrival to consultation start"
                }
                icon={Clock3}
              />
            </div>
          )}
          {role === "doctor" && ["overview", "queue"].includes(tab) && (
            <div className="doctor-controls panel">
              <span>
                <span className="live-dot" />
                {myDoctor?.paused_until &&
                Date.parse(myDoctor.paused_until) > Date.now()
                  ? `On break until ${time(myDoctor.paused_until)}`
                  : "Your queue is open"}
              </span>
              <div>
                <Button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    command("pause", {
                      doctor_id: data.profile.id,
                      minutes:
                        myDoctor?.paused_until &&
                        Date.parse(myDoctor.paused_until) > Date.now()
                          ? 0
                          : 15,
                    })
                  }
                >
                  {myDoctor?.paused_until &&
                  Date.parse(myDoctor.paused_until) > Date.now()
                    ? t("Resume queue")
                    : t("Take 15m break")}
                </Button>
                <Button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    command("call_next", { doctor_id: data.profile.id })
                  }
                >
                  {t("Call next patient")} <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}
          {tab === "overview" && (
            <div className="overview-grid">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>{t("Queue overview")}</h2>
                    <p>
                      {isPatient
                        ? "Your upcoming and active appointments"
                        : "Every patient, the right next step"}
                    </p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => setTab(isPatient ? "appointments" : "queue")}
                  >
                    {t("View queue")} <ArrowRight size={15} />
                  </button>
                </div>
                <Table
                  items={filtered
                    .filter(
                      (a) =>
                        !["completed", "cancelled", "no_show"].includes(
                          a.status,
                        ),
                    )
                    .slice(0, 6)}
                />
              </section>
              <section className="panel team-panel">
                <div className="section-heading">
                  <h2>{t("Today’s care team")}</h2>
                  <span className="badge neutral">{data.doctors.length}</span>
                </div>
                {data.doctors.map((d) => {
                  const stat = data.queue_stats.find(
                    (s) => s.doctor_id === d.id,
                  );
                  return (
                    <div className="doctor-card" key={d.id}>
                      <span className="avatar teal">
                        {d.name
                          .replace("Dr. ", "")
                          .split(" ")
                          .map((s) => s[0])
                          .join("")}
                      </span>
                      <div>
                        <strong>{d.name}</strong>
                        <small>{departmentName(d.department_id)}</small>
                        <span className="doctor-status">
                          <span className="live-dot" />
                          {d.paused_until &&
                          Date.parse(d.paused_until) > Date.now()
                            ? "On break"
                            : d.available
                              ? "Available"
                              : "Unavailable"}{" "}
                          · {stat?.waiting || 0} waiting
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="insight">
                  <HeartPulse size={19} />
                  <h3>Priority with a human in the loop</h3>
                  <p>
                    Symptoms can suggest a review. Only a staff-confirmed
                    priority changes the queue.
                  </p>
                </div>
              </section>
            </div>
          )}
          {["appointments", "queue", "analytics"].includes(tab) && (
            <div className="filters">
              <div className="search-input">
                <Search size={17} />
                <input
                  aria-label="Search patients or tokens"
                  placeholder={t("Search patients or tokens")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                aria-label="Filter department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="">{t("All departments")}</option>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter doctor"
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
              >
                <option value="">All doctors</option>
                {data.doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="Filter hospital date"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              {["reception", "admin"].includes(role) && tab === "queue" && (
                <Button className="btn primary" onClick={() => open("checkin")}>
                  QR / token check-in
                </Button>
              )}
            </div>
          )}
          {["appointments", "queue"].includes(tab) && (
            <section className="panel">
              <div className="section-heading">
                <h2>
                  {tab === "queue"
                    ? "Active patient queue"
                    : "Appointment records"}
                </h2>
                <span className="badge neutral">{rows.length} records</span>
              </div>
              <Table items={rows} />
            </section>
          )}
          {isPatient && tab === "appointments" && (
            <section className="panel section-gap">
              <div className="section-heading">
                <div>
                  <h2>Find an earlier opening</h2>
                  <p>
                    Join a department waitlist. Offers reserve a slot for up to
                    15 minutes.
                  </p>
                </div>
              </div>
              <div className="waitlist-options">
                {data.departments.map((d) => (
                  <Button
                    key={d.id}
                    className="btn ghost"
                    disabled={
                      busy ||
                      data.waitlist.some(
                        (w) =>
                          w.department_id === d.id && w.status === "waiting",
                      )
                    }
                    onClick={() => command("waitlist", { department_id: d.id })}
                  >
                    {data.waitlist.some(
                      (w) => w.department_id === d.id && w.status === "waiting",
                    )
                      ? "Joined: "
                      : "Join: "}
                    {d.name}
                  </Button>
                ))}
              </div>
              {data.offers
                .filter(
                  (o) =>
                    o.status === "offered" &&
                    Date.parse(o.expires_at) > Date.now(),
                )
                .map((o) => (
                  <div className="notification" key={o.id}>
                    <span>
                      Available slot ·{" "}
                      {time(
                        data.slots.find((s) => s.id === o.slot_id)?.starts_at,
                      )}{" "}
                      · expires {time(o.expires_at)}
                    </span>
                    <Button
                      className="btn primary"
                      onClick={() => command("accept_offer", { id: o.id })}
                    >
                      Accept slot
                    </Button>
                  </div>
                ))}
              <p className="small muted pad">
                {demo
                  ? "Offer creation is available in connected mode with the scheduled worker."
                  : "Offers and reminders require the scheduled worker described in SETUP.md."}
              </p>
            </section>
          )}
          {tab === "analytics" && (
            <>
              <div className="analytics-grid">
                <section className="panel chart-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Department patient flow</h2>
                      <p>Appointments in the selected dataset</p>
                    </div>
                    <button className="text-link" onClick={exportCsv}>
                      <ArrowDownToLine size={16} /> Export CSV
                    </button>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={data.departments.map((d) => ({
                        name: d.name.split(" ")[0],
                        Waiting: filtered.filter(
                          (a) =>
                            a.department_id === d.id &&
                            ["waiting", "checked_in", "called"].includes(
                              a.status,
                            ),
                        ).length,
                        Completed: filtered.filter(
                          (a) =>
                            a.department_id === d.id &&
                            a.status === "completed",
                        ).length,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar
                        dataKey="Waiting"
                        fill="#9dd8c9"
                        radius={[5, 5, 0, 0]}
                      />
                      <Bar
                        dataKey="Completed"
                        fill="#087f74"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
                <section className="panel pad">
                  <h2>Operational measures</h2>
                  <dl className="metric-list">
                    <dt>90th percentile wait</dt>
                    <dd>
                      {m.p90 === null
                        ? "Insufficient data"
                        : `${m.p90.toFixed(1)} min`}
                    </dd>
                    <dt>Average consultation</dt>
                    <dd>
                      {m.consultation === null
                        ? "Insufficient data"
                        : `${m.consultation.toFixed(1)} min`}
                    </dd>
                    <dt>Completion rate</dt>
                    <dd>
                      {m.total
                        ? `${Math.round((m.completed / m.total) * 100)}%`
                        : "—"}
                    </dd>
                    <dt>Cancellation rate</dt>
                    <dd>
                      {m.total
                        ? `${Math.round((m.cancelled / m.total) * 100)}%`
                        : "—"}
                    </dd>
                    <dt>No-show rate</dt>
                    <dd>
                      {m.terminal
                        ? `${Math.round((m.noShows / m.terminal) * 100)}%`
                        : "—"}
                    </dd>
                  </dl>
                  <p className="small muted">
                    Completion and cancellation use all selected appointments.
                    No-shows use completed + cancelled + no-show appointments.
                  </p>
                  <h3>Feedback</h3>
                  {[5, 4, 3, 2, 1].map((r) => (
                    <div className="rating-line" key={r}>
                      <span>{r} stars</span>
                      <strong>
                        {
                          data.feedback.filter(
                            (f) =>
                              f.rating === r &&
                              filtered.some((a) => a.id === f.appointment_id),
                          ).length
                        }
                      </strong>
                    </div>
                  ))}
                </section>
              </div>
              <section className="panel section-gap pad">
                <h2>Arrivals by hour</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={Array.from({ length: 24 }, (_, h) => ({
                      hour: `${h}:00`,
                      arrivals: filtered.filter(
                        (a) =>
                          a.arrived_at &&
                          Number(
                            new Intl.DateTimeFormat("en-GB", {
                              timeZone: "Asia/Kolkata",
                              hour: "2-digit",
                              hourCycle: "h23",
                            }).format(new Date(a.arrived_at)),
                          ) === h,
                      ).length,
                    }))}
                  >
                    <XAxis dataKey="hour" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="arrivals" fill="#087f74" />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            </>
          )}
          {tab === "resources" && (
            <>
              <div className="section-heading">
                <h2>Hospital inventory</h2>
                <Button
                  className="btn primary"
                  onClick={() => open("resource")}
                >
                  Add resource
                </Button>
              </div>
              <div className="resource-grid">
                {data.resources.map((r) => (
                  <section className="panel resource-card" key={r.id}>
                    <div className="section-heading">
                      <Warehouse size={22} />
                      <button
                        className="text-link"
                        onClick={() => open("resource", undefined, r)}
                      >
                        Edit
                      </button>
                    </div>
                    <h2>{r.name}</h2>
                    <div className="resource-number">
                      {r.available}
                      <span>/ {r.total} available</span>
                    </div>
                    <progress max={r.total || 1} value={r.available} />
                    <small>{r.total - r.available} currently in use</small>
                  </section>
                ))}
              </div>
              <section className="panel section-gap pad">
                <h2>Audit trail</h2>
                {data.audit.length ? (
                  data.audit.slice(0, 30).map((a) => (
                    <div className="notification" key={a.id}>
                      <span>{statusName(a.action)}</span>
                      <small>{new Date(a.created_at).toLocaleString()}</small>
                    </div>
                  ))
                ) : (
                  <p>No changes recorded yet.</p>
                )}
              </section>
            </>
          )}
          {tab === "team" && (
            <>
              <div className="section-heading">
                <h2>Departments & schedules</h2>
                <div className="inline-actions">
                  <Button
                    className="btn ghost"
                    onClick={() => open("department")}
                  >
                    Add department
                  </Button>
                  <Button className="btn ghost" onClick={() => open("shift")}>
                    Add shift
                  </Button>
                  <Button className="btn primary" onClick={() => open("slot")}>
                    Create slot
                  </Button>
                  <Button className="btn ghost" onClick={() => open("staff")}>
                    Assign role
                  </Button>
                </div>
              </div>
              <div className="resource-grid">
                {data.departments.map((d) => (
                  <section className="panel pad" key={d.id}>
                    <span className="eyebrow">ROOM {d.room}</span>
                    <h2>{d.name}</h2>
                    <p>{d.default_minutes} min default consultation</p>
                    <button
                      className="text-link"
                      onClick={() => open("department", undefined, d)}
                    >
                      Edit department <ArrowRight size={14} />
                    </button>
                  </section>
                ))}
              </div>
              <section className="panel section-gap">
                <div className="section-heading">
                  <h2>Doctor schedules</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Doctor</th>
                        <th>Department</th>
                        <th>Configured shifts</th>
                        <th>Consultation utilization</th>
                        <th>Upcoming slots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.doctors.map((d) => {
                        const shifts = data.shifts.filter(
                          (s) => s.doctor_id === d.id,
                        );
                        const minutes = shifts.reduce(
                          (n, s) =>
                            n +
                            (Date.parse(s.ends_at) - Date.parse(s.starts_at)) /
                              60000,
                          0,
                        );
                        const used = data.appointments
                          .filter(
                            (a) =>
                              a.doctor_id === d.id &&
                              a.started_at &&
                              a.completed_at &&
                              shifts.some(
                                (s) =>
                                  a.started_at! >= s.starts_at &&
                                  a.completed_at! <= s.ends_at,
                              ),
                          )
                          .reduce(
                            (n, a) =>
                              n +
                              (Date.parse(a.completed_at!) -
                                Date.parse(a.started_at!)) /
                                60000,
                            0,
                          );
                        return (
                          <tr key={d.id}>
                            <td>{d.name}</td>
                            <td>{departmentName(d.department_id)}</td>
                            <td>
                              {shifts.map((s) => (
                                <small key={s.id}>
                                  {new Date(s.starts_at).toLocaleDateString()} ·{" "}
                                  {time(s.starts_at)}–{time(s.ends_at)}
                                </small>
                              ))}
                            </td>
                            <td>
                              {minutes
                                ? `${Math.round((100 * used) / minutes)}%`
                                : "No shift configured"}
                            </td>
                            <td>
                              {
                                data.slots.filter(
                                  (s) =>
                                    s.doctor_id === d.id &&
                                    Date.parse(s.starts_at) > Date.now(),
                                ).length
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === "simulation" && (
            <>
              <div className="notice">
                Synthetic simulation only. These outputs never enter patient
                records or operational analytics.
              </div>
              <div className="simulation-grid">
                <section className="panel pad">
                  <h2>Explore a shift</h2>
                  <p>Eight hours · deterministic seed 42</p>
                  {[
                    {
                      label: "Patient arrivals / hour",
                      value: arrivals,
                      set: setArrivals,
                      min: 1,
                      max: 60,
                    },
                    {
                      label: "Available doctors",
                      value: doctorCount,
                      set: setDoctorCount,
                      min: 1,
                      max: 10,
                    },
                    {
                      label: "Consultation minutes",
                      value: duration,
                      set: setDuration,
                      min: 3,
                      max: 40,
                    },
                    {
                      label: "Urgent cases (%)",
                      value: urgent,
                      set: setUrgent,
                      min: 0,
                      max: 50,
                    },
                  ].map((c) => (
                    <label className="slider-label" key={c.label}>
                      {c.label}
                      <strong>{c.value}</strong>
                      <input
                        type="range"
                        min={c.min}
                        max={c.max}
                        value={c.value}
                        onChange={(e) => c.set(Number(e.target.value))}
                      />
                    </label>
                  ))}
                </section>
                <section className="panel chart-panel">
                  <div className="section-heading">
                    <h2>Simulated queue over time</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={sim.points}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip />
                      <Line
                        dataKey="queue"
                        stroke="#087f74"
                        strokeWidth={3}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </section>
              </div>
              <div className="stats-grid section-gap">
                <Stat
                  label="Patients served"
                  value={sim.served}
                  sub="Simulated, over eight hours"
                  icon={Users}
                />
                <Stat
                  label="Median wait"
                  value={`${sim.median ?? 0}m`}
                  sub={`P90: ${sim.p90 ?? 0} min`}
                  icon={Clock3}
                />
                <Stat
                  label="Utilization"
                  value={`${sim.utilization}%`}
                  sub="Occupied doctor-minutes / capacity"
                  icon={Activity}
                />
                <Stat
                  label="Still waiting"
                  value={sim.remaining}
                  sub="At the end of the simulation"
                  icon={CalendarDays}
                />
              </div>
            </>
          )}
          {tab === "settings" && (
            <section className="panel pad settings-card">
              <h2>Your details</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  command("profile", {
                    name: f.get("name"),
                    email_opt_in: f.get("email_opt_in") === "on",
                  });
                }}
              >
                <label>
                  Full name
                  <input
                    name="name"
                    defaultValue={data.profile.name}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    name="email_opt_in"
                    type="checkbox"
                    defaultChecked={data.profile.email_opt_in}
                  />
                  Receive appointment email reminders
                </label>
                <p className="muted small">
                  In-app updates remain available. Email delivery requires the
                  configured scheduled worker and Resend sender. Demo emails are
                  simulated.
                </p>
                <Button className="btn primary" disabled={busy}>
                  {t("Save")}
                </Button>
              </form>
            </section>
          )}
          <footer className="workspace-footer">
            <span>CareFlow · Educational prototype</span>
            <span>
              Updated {lastUpdated} ·{" "}
              {demo
                ? "Browser-local synthetic records"
                : "Realtime with 30-second fallback"}
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <ModalShell
          title={
            modal.kind === "book"
              ? t("Book appointment")
              : modal.kind === "token"
                ? "Your check-in token"
                : statusName(modal.kind).replace(/^./, (c) => c.toUpperCase())
          }
          onClose={() => setModal(null)}
        >
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          {modal.kind === "token" ? (
            <div className="token-modal">
              <span className="eyebrow">
                {departmentName(modal.a!.department_id)}
              </span>
              <h1>#{String(modal.a!.token).padStart(3, "0")}</h1>
              {qr && (
                <img
                  src={qr}
                  alt="Opaque appointment check-in QR code"
                  width={220}
                  height={220}
                />
              )}
              <p>
                Show this code to reception. It contains no medical information.
              </p>
              <code>{modal.a!.qr_token}</code>
              <small>
                Expires {new Date(modal.a!.qr_expires_at!).toLocaleString()}
              </small>
              <p>
                {modal.a!.hospital_date} · {doctorName(modal.a!.doctor_id)}
              </p>
              <Button
                className="btn ghost"
                onClick={() => {
                  navigator.clipboard
                    .writeText(modal.a!.qr_token!)
                    .then(() => setMessage("Check-in code copied."))
                    .catch(() =>
                      setMessage("Select the code above to copy it."),
                    );
                }}
              >
                Copy check-in code
              </Button>
            </div>
          ) : (
            <form onSubmit={submitModal}>
              {["book", "reschedule"].includes(modal.kind) && (
                <>
                  <label>
                    Department
                    <select
                      value={bookDepartment}
                      onChange={(e) => setBookDepartment(e.target.value)}
                    >
                      <option value="">All departments</option>
                      {data.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Available appointment slot
                    <select name="slot_id" required defaultValue="">
                      <option value="" disabled>
                        Select a doctor and time
                      </option>
                      {data.slots
                        .filter(
                          (s) =>
                            (!bookDepartment ||
                              s.department_id === bookDepartment) &&
                            Date.parse(s.starts_at) > Date.now(),
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {doctorName(s.doctor_id)} ·{" "}
                            {new Date(s.starts_at).toLocaleString()} · capacity{" "}
                            {s.capacity}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="small muted">
                    Capacity is checked atomically when you confirm.
                  </p>
                  {modal.kind === "book" && (
                    <>
                      <label>
                        Symptoms or reason for visit
                        <textarea
                          name="symptoms"
                          maxLength={2000}
                          placeholder="Describe what brings you in today"
                        />
                      </label>
                      <div className="form-grid">
                        {[
                          {
                            key: "temperature",
                            label: "Temperature (°C)",
                            min: 25,
                            max: 45,
                          },
                          { key: "spo2", label: "SpO₂ (%)", min: 1, max: 100 },
                          {
                            key: "systolic",
                            label: "Systolic BP",
                            min: 40,
                            max: 300,
                          },
                          { key: "age", label: "Age", min: 0, max: 130 },
                        ].map((v) => (
                          <label key={v.key}>
                            {v.label}
                            <input
                              name={v.key}
                              type="number"
                              step="any"
                              min={v.min}
                              max={v.max}
                            />
                          </label>
                        ))}
                      </div>
                      <p className="small muted">
                        Vitals are optional and reviewed by staff. Booking does
                        not assign a clinical priority.
                      </p>
                    </>
                  )}
                </>
              )}
              {modal.kind === "review" && (
                <>
                  <p>
                    <strong>{modal.a!.patient_name}</strong> ·{" "}
                    {modal.a!.symptoms}
                  </p>
                  <div className="notice">
                    {
                      suggestPriority(modal.a!.vitals || {}, modal.a!.symptoms)
                        .label
                    }
                    <ul>
                      {suggestPriority(
                        modal.a!.vitals || {},
                        modal.a!.symptoms,
                      ).reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <label>
                    Confirmed priority
                    <select
                      name="priority"
                      defaultValue={
                        modal.a!.priority ||
                        suggestPriority(
                          modal.a!.vitals || {},
                          modal.a!.symptoms,
                        ).priority
                      }
                    >
                      <option value="1">1 · Routine</option>
                      <option value="2">2 · Elevated</option>
                      <option value="3">3 · Urgent</option>
                    </select>
                  </label>
                  <label>
                    Clinical review / override reason
                    <textarea name="reason" required maxLength={1000} />
                  </label>
                  <div className="form-grid">
                    {["temperature", "spo2", "systolic", "age"].map((k) => (
                      <label key={k}>
                        {k}
                        <input
                          name={k}
                          type="number"
                          step="any"
                          defaultValue={modal.a!.vitals?.[k]}
                        />
                      </label>
                    ))}
                  </div>
                </>
              )}
              {modal.kind === "reassign" && (
                <>
                  <p>
                    Only available doctors in{" "}
                    {departmentName(modal.a!.department_id)} are eligible.
                  </p>
                  <label>
                    Doctor
                    <select name="doctor_id" required>
                      {rankDoctors(
                        data.doctors,
                        data.queue_stats,
                        data.shifts,
                        modal.a!.department_id,
                      ).map(({ doctor: d, explanation }) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {explanation}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="small muted">
                    Suggestions consider availability, queue workload, recent
                    consultation duration, breaks, and remaining shift time.
                    Staff must confirm the change.
                  </p>
                  <label>
                    Reason
                    <textarea name="reason" required />
                  </label>
                </>
              )}
              {modal.kind === "complete" && (
                <>
                  <p>Complete the consultation for {modal.a!.patient_name}?</p>
                  <label>
                    Private consultation note
                    <textarea name="note" maxLength={2000} />
                  </label>
                </>
              )}
              {["cancel", "no_show"].includes(modal.kind) && (
                <p>
                  Mark token #{modal.a!.token} as{" "}
                  {modal.kind === "cancel" ? "cancelled" : "no-show"}? No-show
                  changes enforce arrival/call grace periods in connected mode.
                </p>
              )}
              {modal.kind === "feedback" && (
                <>
                  <label>
                    Your rating
                    <select name="rating">
                      {[5, 4, 3, 2, 1].map((r) => (
                        <option key={r} value={r}>
                          {r} stars
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Comments
                    <textarea name="comment" maxLength={1000} />
                  </label>
                </>
              )}
              {modal.kind === "checkin" && (
                <>
                  <label>
                    Scanned QR value or appointment ID
                    <input
                      name="token"
                      required
                      autoFocus
                      placeholder="Paste opaque check-in code"
                    />
                  </label>
                  <p className="small muted">
                    Use a USB QR scanner or paste the patient’s code. Camera
                    scanning is not included in this version.
                  </p>
                </>
              )}
              {modal.kind === "walkin" && (
                <>
                  <label>
                    Patient name
                    <input name="name" required minLength={2} maxLength={100} />
                  </label>
                  <label>
                    Doctor
                    <select name="doctor_id">
                      {data.doctors
                        .filter(
                          (d) =>
                            role === "admin" ||
                            d.department_id === data.profile.department_id,
                        )
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Reason for visit
                    <textarea name="symptoms" maxLength={2000} />
                  </label>
                </>
              )}
              {modal.kind === "resource" && (
                <>
                  <label>
                    Resource name
                    <input
                      name="name"
                      defaultValue={modal.row?.name}
                      required
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Total
                      <input
                        type="number"
                        name="total"
                        min={0}
                        required
                        defaultValue={modal.row?.total || 0}
                      />
                    </label>
                    <label>
                      Available
                      <input
                        type="number"
                        name="available"
                        min={0}
                        required
                        defaultValue={modal.row?.available || 0}
                      />
                    </label>
                  </div>
                </>
              )}
              {modal.kind === "department" && (
                <>
                  <label>
                    Name
                    <input
                      name="name"
                      required
                      defaultValue={modal.row?.name}
                    />
                  </label>
                  <label>
                    Room
                    <input name="room" defaultValue={modal.row?.room} />
                  </label>
                  <label>
                    Default consultation minutes
                    <input
                      name="default_minutes"
                      type="number"
                      min={1}
                      max={120}
                      required
                      defaultValue={modal.row?.default_minutes || 12}
                    />
                  </label>
                </>
              )}
              {["slot", "shift"].includes(modal.kind) && (
                <>
                  <label>
                    Doctor
                    <select name="doctor_id">
                      {data.doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Start (your browser timezone)
                    <input name="starts_at" type="datetime-local" required />
                  </label>
                  <label>
                    End (your browser timezone)
                    <input name="ends_at" type="datetime-local" required />
                  </label>
                  {modal.kind === "slot" && (
                    <label>
                      Capacity
                      <input
                        name="capacity"
                        type="number"
                        min={1}
                        max={30}
                        defaultValue={1}
                        required
                      />
                    </label>
                  )}
                  <p className="small muted">
                    Create a shift before adding slots inside it.
                  </p>
                </>
              )}
              {modal.kind === "staff" && (
                <>
                  <p>
                    Users must register first. The administrator grants staff
                    access; public signup always creates a patient.
                  </p>
                  <label>
                    User
                    <select name="id">
                      {data.profiles
                        .filter((p) => p.id !== data.profile.id)
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name} · {p.role}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Role
                    <select name="role">
                      <option value="patient">Patient</option>
                      <option value="doctor">Doctor</option>
                      <option value="reception">Reception / nurse</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <label>
                    Department
                    <select name="department_id">
                      <option value="">None</option>
                      {data.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <div className="modal-actions">
                <Button
                  type="button"
                  className="btn ghost"
                  onClick={() => setModal(null)}
                >
                  {t("Cancel")}
                </Button>
                <Button
                  className="btn primary"
                  disabled={busy || (offline && !demo)}
                >
                  {busy ? "Saving…" : t("Save")}
                </Button>
              </div>
            </form>
          )}
        </ModalShell>
      )}
    </div>
  );
}
