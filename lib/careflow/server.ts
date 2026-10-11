import { createClient } from "@supabase/supabase-js";
export function config() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}
export async function authorized(request: Request) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Configure Supabase to use connected mode");
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("Authentication required");
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Authentication required");
  return { db, user: data.user };
}
export function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  return Response.json(
    { error: message },
    { status: /Authentication|Access denied/.test(message) ? 403 : 400 },
  );
}
