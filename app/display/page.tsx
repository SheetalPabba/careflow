"use client";
import { useEffect, useState } from "react";
import { demoSnapshot } from "@/lib/careflow/demo";
export default function Display() {
  const [rows, setRows] = useState<
    { token: number; department: string; room: string; status: string }[]
  >([]);
  const [note, setNote] = useState("Connecting…");
  useEffect(() => {
    const load = async () => {
      try {
        if (new URLSearchParams(location.search).get("demo") === "1") {
          const d = demoSnapshot("admin");
          setRows(
            d.appointments
              .filter((a) => ["called", "in_consultation"].includes(a.status))
              .map((a) => ({
                token: a.token,
                department:
                  d.departments.find((x) => x.id === a.department_id)?.name ||
                  "",
                room:
                  d.departments.find((x) => x.id === a.department_id)?.room ||
                  "",
                status: a.status,
              })),
          );
          setNote("Synthetic demo · refreshes every 8 seconds");
        } else {
          const r = await fetch("/api/board");
          const data = (await r.json()) as {
            rows: {
              token: number;
              department: string;
              room: string;
              status: string;
            }[];
            configured: boolean;
            error?: string;
          };
          if (!r.ok) throw Error(data.error);
          setRows(data.rows);
          setNote(
            data.configured
              ? "Live queue display"
              : "Configure Supabase to display a connected queue",
          );
        }
      } catch {
        setNote("Unable to refresh. Reconnecting…");
      }
    };
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);
  return (
    <main className="display-page">
      <header>
        <a className="brand" href="/">
          ✚ CareFlow
        </a>
        <span>WAITING ROOM</span>
      </header>
      <h1>Your next step in care.</h1>
      <p>Please proceed to the room when your token is called.</p>
      <div className="board-grid">
        {rows.map((r, i) => (
          <article className="board-token" key={i}>
            <span className="eyebrow">{r.department}</span>
            <strong>#{String(r.token).padStart(3, "0")}</strong>
            <h2>Room {r.room}</h2>
            <span className="badge green">
              {r.status === "called"
                ? "Please come in"
                : "Consultation in progress"}
            </span>
          </article>
        ))}
      </div>
      {!rows.length && (
        <div className="panel pad">
          <h2>No tokens currently called</h2>
          <p>Your token will appear here when the doctor calls you.</p>
        </div>
      )}
      <footer>
        {note} · No patient names or medical details are displayed.
      </footer>
    </main>
  );
}
