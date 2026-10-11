import { createClient } from "@supabase/supabase-js";
import { config } from "@/lib/careflow/server";
export async function GET() {
  const { url, key } = config();
  if (!url || !key) return Response.json({ rows: [], configured: false });
  const { data, error } = await createClient(url, key).rpc("public_board");
  if (error)
    return Response.json({ error: "Board unavailable" }, { status: 503 });
  return Response.json(
    { rows: data, configured: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
