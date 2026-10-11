import { authorized, failure } from "@/lib/careflow/server";
export async function GET(request: Request) {
  try {
    const { db, user } = await authorized(request);
    const tables = [
      "profiles",
      "departments",
      "doctors",
      "slots",
      "appointments",
      "resources",
      "notifications",
      "audit",
      "feedback",
      "waitlist",
      "offers",
      "shifts",
    ];
    const data: Record<string, unknown> = {};
    await Promise.all(
      tables.map(async (t) => {
        let query = db.from(t).select("*");
        if (t === "appointments")
          query = query.order("created_at", { ascending: false }).limit(1000);
        if (t === "audit" || t === "notifications")
          query = query.order("created_at", { ascending: false }).limit(200);
        const r = await query;
        if (r.error) throw new Error(`${t}: ${r.error.message}`);
        data[t] = r.data;
      }),
    );
    const p = (data.profiles as { id: string }[]).find((x) => x.id === user.id);
    if (!p)
      throw new Error("Profile missing: apply migration before registering");
    const [stats, positions] = await Promise.all([
      db.rpc("queue_stats"),
      db.rpc("my_positions"),
    ]);
    if (stats.error || positions.error) throw new Error("Queue query failed");
    return Response.json(
      {
        ...data,
        profile: p,
        queue_stats: stats.data,
        positions: positions.data,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
