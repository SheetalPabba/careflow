import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
export async function POST(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    return Response.json(
      { error: "Missing server configuration" },
      { status: 503 },
    );
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const jobs = await db.rpc("run_jobs");
  const reminders = await db.rpc("create_reminders");
  if (jobs.error || reminders.error)
    return Response.json({ error: "Job transaction failed" }, { status: 500 });
  const { data: deliveries, error } = await db.rpc("claim_deliveries");
  if (error)
    return Response.json({ error: "Delivery claim failed" }, { status: 500 });
  let sent = 0;
  for (const d of deliveries || []) {
    const { data: n } = await db
      .from("notifications")
      .select("*")
      .eq("id", d.notification_id)
      .single();
    const { data: p } = await db
      .from("profiles")
      .select("email_opt_in")
      .eq("id", n?.patient_id)
      .single();
    let status = "skipped";
    let provider_id = null;
    let last_error = null;
    if (p?.email_opt_in) {
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
        status = "simulated";
      } else {
        try {
          const { data: u } = await db.auth.admin.getUserById(n.patient_id);
          if (!u.user?.email) throw new Error("No email");
          const result = await new Resend(
            process.env.RESEND_API_KEY,
          ).emails.send(
            {
              from: process.env.EMAIL_FROM,
              to: u.user.email,
              subject: "CareFlow appointment update",
              text: n.message,
            },
            { idempotencyKey: `careflow/${d.notification_id}` },
          );
          if (result.error) throw new Error("Provider rejected delivery");
          provider_id = result.data?.id;
          status = "sent";
          sent++;
        } catch {
          status = d.attempts >= 4 ? "failed" : "pending";
          last_error = "Delivery failed; inspect provider dashboard";
        }
      }
    }
    await db
      .from("delivery_attempts")
      .update({ status, provider_id, last_error })
      .eq("id", d.id);
  }
  return Response.json({ ok: true, sent, processed: deliveries?.length || 0 });
}
