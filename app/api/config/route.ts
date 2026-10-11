import { config } from "@/lib/careflow/server";
export async function GET() {
  return Response.json(config(), { headers: { "Cache-Control": "no-store" } });
}
