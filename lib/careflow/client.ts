import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null = null;
export async function getClient() {
  if (client) return client;
  const r = await fetch("/api/config");
  const c = (await r.json()) as { url: string; key: string };
  if (!c.url || !c.key) return null;
  client = createClient(c.url, c.key);
  return client;
}
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const db = await getClient();
  const { data } = await db!.auth.getSession();
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token || ""}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await r.json()) as any;
  if (!r.ok) throw Error(json.error || "Request failed");
  return json;
}
