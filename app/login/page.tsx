"use client";
import { useEffect, useState } from "react";
import { getClient } from "@/lib/careflow/client";
import { Button } from "@/components/ui/button";
export default function Login() {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getClient().then((c) => {
      setReady(!!c);
      if (c && window.location.hash.includes("type=recovery"))
        setMode("update");
    });
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const c = await getClient();
      if (!c)
        throw Error(
          "Supabase is not configured. Use the demo or follow SETUP.md.",
        );
      const f = new FormData(e.currentTarget);
      const email = String(f.get("email"));
      const password = String(f.get("password"));
      const r =
        mode === "signup"
          ? await c.auth.signUp({
              email,
              password,
              options: {
                data: { name: f.get("name") },
                emailRedirectTo: window.location.origin + "/login",
              },
            })
          : mode === "reset"
            ? await c.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + "/login",
              })
            : mode === "update"
              ? await c.auth.updateUser({ password })
              : await c.auth.signInWithPassword({ email, password });
      if (r.error) throw r.error;
      if (mode === "login") window.location.href = "/workspace";
      else
        setMessage(
          mode === "signup"
            ? "Check your email to confirm your account."
            : mode === "reset"
              ? "If the account exists, a reset email has been requested."
              : "Password updated. You can sign in.",
        );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <a className="brand" href="/">
        ✚ CareFlow
      </a>
      <div className="panel auth-card">
        <span className="eyebrow">YOUR CARE WORKSPACE</span>
        <h1>
          {mode === "signup"
            ? "Create your patient account"
            : mode === "reset"
              ? "Reset your password"
              : mode === "update"
                ? "Choose a new password"
                : "Welcome back."}
        </h1>
        <p>Secure access for patients and care teams.</p>
        {ready === false && (
          <div className="notice">
            Connected mode needs Supabase configuration.{" "}
            <a href="/workspace?demo=1">Explore the synthetic demo</a>.
          </div>
        )}
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Full name
              <input name="name" required minLength={2} maxLength={100} />
            </label>
          )}
          {mode !== "update" && (
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
          )}
          <Button className="btn primary" disabled={busy || !ready}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : mode === "signup"
                  ? "Register as patient"
                  : mode === "update"
                    ? "Update password"
                    : "Send reset email"}
          </Button>
        </form>
        <p role="status">{message}</p>
        <div className="inline-actions">
          <button
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup"
              ? "Already registered? Sign in"
              : "Create patient account"}
          </button>
          <button onClick={() => setMode("reset")}>Forgot password?</button>
        </div>
        <p className="muted small">
          Staff roles are assigned by an administrator after account
          registration.
        </p>
      </div>
    </main>
  );
}
