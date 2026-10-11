# Setup and deployment

## 1. Run the Next.js application

Requirements: Node.js 22.13+ and npm. The project includes a pnpm lockfile for the exact installed dependency graph. If using pnpm, use the version in package.json.

```bash
npm install
npm run dev:next
```

Open http://localhost:3000. Select **Explore the live demo**. Demo records and changes are saved in localStorage on that browser; Reset demo restores the synthetic seed. Demo role switching is intentionally isolated from connected mode and never sends patient mutations to Supabase.

For a reproducible install with the included lockfile:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:next
```

The Sites adapter uses `npm run dev` / `npm run build`; conventional Next.js uses `dev:next`, `build:next`, and `start:next`.

## 2. Connect a NEW development Supabase project

1. Create a Supabase development project. Use synthetic records only.
2. Apply `supabase/migrations/001_careflow.sql` in the SQL editor. This migration is designed for a fresh database; do not run it against an unrelated existing app.
3. Copy `.env.example` to `.env.local`. Set the public URL and public anon key from your project settings. The service-role key is server-only and needed only for seeding/scheduled jobs.
4. Configure the Supabase Auth Site URL to `http://localhost:3000` and permit `http://localhost:3000/login` as a redirect URL. Add the matching HTTPS URLs when deployed. Set a suitable password policy (the form requires 12 characters for new passwords) and enable email confirmation.
5. Restart the dev server. Register a patient at `/login`, confirm its email, then sign in. Public registration cannot choose a staff role.

No Supabase credentials were provided during development, so the delivered preview starts in unconfigured/demo mode. You control the connected database.

## 3. Bootstrap an administrator

After registering and verifying the administrator's account, use the Supabase SQL editor as database owner:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_VERIFIED_ADMIN_EMAIL');
```

Use your actual verified account email. This statement runs in a trusted console, never in the browser. The administrator can then create departments and assign registered users as doctor/reception through **Care team → Assign role**. Doctor/reception roles require a department.

Create a doctor shift before creating appointment slots. All browser-entered datetime values are explicitly labelled in the browser's timezone, then converted to UTC. Database tokens use the hospital timezone (Asia/Kolkata by default). For this India-focused version, the arrivals chart also uses Asia/Kolkata.

## 4. Optional synthetic connected seed

Instead of manually bootstrapping, seed a fresh DEVELOPMENT project once. This creates four disposable accounts and catalog records. Do not run twice or against production.

Set `CAREFLOW_DEMO_PASSWORD` locally to a unique 12+ character password; do not commit or share it. Then:

```bash
node --env-file=.env.local scripts/seed.mjs
```

The script reads `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CAREFLOW_DEMO_PASSWORD`. Accounts:

- admin@careflow.example.test
- patient@careflow.example.test
- doctor@careflow.example.test
- reception@careflow.example.test

These fictional addresses are for development sign-in only and cannot receive real mail. Do not use these accounts to test email delivery. For real email verification, register your own address separately.

For catalog-only data without creating accounts, use `supabase/seed.sql` instead. Do not combine the two seed methods.

## 5. Email, reminders, and cancellation recovery

Set server environment variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM` (a verified Resend sender)
- `CRON_SECRET` (a random high-entropy secret)

Schedule an authenticated HTTP POST to `/api/jobs` once per minute with `Authorization: Bearer <CRON_SECRET>`. Configure the secret in the scheduler's secret store, not a committed URL or script. A scheduler must be able to reach the application; the private Sites preview additionally requires its platform access boundary and is not intended as a public cron endpoint. Use a conventional deployed Next.js instance for external cron.

Each run expires old offers, reserves available slots for opted-in waitlisted patients, creates hour-before reminders, and atomically claims pending email deliveries. Appointment calls also create in-app notifications and queued emails. Email uses plain text without symptoms or vitals. Delivery respects each profile's opt-in.

If Resend is unconfigured, opted-in deliveries are marked `simulated` in `delivery_attempts`; no email is sent. `skipped` means the patient did not opt in. The UI explains that configuration is needed. Failed deliveries retry at most four claims; Resend idempotency keys prevent duplicate provider sends within its 24-hour window. Do not manually retry uncertain sends after that window without reconciling provider state.

Monitor failed/abandoned jobs in your scheduler and `delivery_attempts`. Scheduler provisioning is deployment-specific and was not performed without credentials.

## 6. Deploy conventional Next.js

On Vercel or a Node-compatible host:

- Install: `npm install` (or frozen pnpm install).
- Build: `npm run build:next`.
- Start on Node: `npm run start:next`.
- Add the environment variables in the host's secret settings.
- Update Supabase Auth Site URL and redirect allowlist.
- Enable HTTPS and run the connected workflow checks against your development deployment.

The `.openai/hosting.json`, `build/`, and Sites scripts enable the separate private preview and are not required by the conventional Next.js runtime. Do not change an existing Site identity to another project.

## 7. Verification

```bash
npm run typecheck
npm test
npm run build:next
```

Browser tests on your machine:

```bash
npx playwright install chromium
npm run test:e2e
```

Or point the tests at an already running instance with `PLAYWRIGHT_BASE_URL`. The test runner starts conventional Next.js by default.

Database tests use PGlite, an embedded PostgreSQL engine, with a minimal Auth role fixture. They execute the migration and test SQL authorization/state constraints. They do not prove Supabase's hosted Auth/Realtime behavior or multiple independent PostgreSQL connections; those need a configured integration environment. `pgcrypto` creation and Supabase publication registration are excluded only inside the embedded test harness; the delivered migration retains them.

## 8. Optional ML experiment

```bash
python -m venv .venv
# Activate the virtual environment for your OS.
pip install -r ml/requirements.txt
python ml/train.py
```

Outputs go to ignored `ml/output/`: a model and evaluation metadata. It compares chronological holdout MAE against the queue baseline using synthetic observations. The web application deliberately retains the transparent baseline; model inference is not integrated.
