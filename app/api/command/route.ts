import { authorized, failure } from "@/lib/careflow/server";
import { parseCommand } from "@/lib/careflow/validation";
export async function POST(request: Request) {
  try {
    const { db } = await authorized(request);
    if (Number(request.headers.get("content-length") || 0) > 16000)
      throw new Error("Request too large");
    const input = parseCommand(await request.json());
    const { data, error } = await db.rpc("command", input);
    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (e) {
    return failure(e);
  }
}
