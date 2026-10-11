# CareFlow — Smart Hospital Queue and Patient Flow Management

An original educational full-stack project for patients, reception/nursing teams, doctors, and administrators. Designed in teal, navy and neutral colors with a responsive interface. **Synthetic prototype, not a clinical triage or diagnostic product.**

## Run immediately

```bash
npm install
npm run dev:next
```

Open http://localhost:3000 and choose **Explore the live demo**. No Supabase account is needed for the browser-local demonstration. For connected authentication, persistence, Realtime and transactional workflows, follow [SETUP.md](docs/SETUP.md).

## Implemented

- Original landing page and four role-specific workspaces.
- Supabase Auth signup/signin/password reset; public signup always creates patients.
- RLS read isolation plus server-validated transactional database commands.
- Departments, doctors, shifts, slot capacity and unique department/day tokens.
- Patient booking, rescheduling, cancellation, history, QR tokens, feedback and profile preferences.
- Reception walk-ins, scanner/paste check-in, vitals and clinician-confirmed priority review.
- Doctor call/start/complete/no-show workflows and pause/resume.
- Explainable waiting ranges, long-wait flags, and staff-confirmed doctor reassignment suggestions.
- Resource inventory, audit history, filtered operational analytics and aggregate CSV export.
- In-app updates, optional Resend delivery worker, waitlists and expiring atomic slot offers.
- Sanitized waiting-room display, deterministic simulation lab and English/Hindi navigation controls.
- SQL migration, synthetic seed tooling, automated unit/database tests and Playwright workflow specifications.
- Optional offline Python waiting-time experiment with chronological evaluation.

## Stack

Next.js App Router, TypeScript, React, Tailwind CSS, shadcn/ui Button, Supabase PostgreSQL/Auth/Realtime, Zod, Recharts, Resend, Vitest and Playwright. Exact dependency versions are in package.json and pnpm-lock.yaml. The private Sites preview uses the supplied Vinext/Cloudflare adapter; standard Next.js scripts are provided separately.

## Documentation

- [Setup, credentials and deployment](docs/SETUP.md)
- [Architecture, ER diagram, permissions and metrics](docs/ARCHITECTURE.md)
- [Five-minute demo and accurate resume wording](docs/DEMO.md)
- [Verification results and scope limits](docs/VERIFICATION.md)
- [GitHub publishing instructions](docs/GITHUB.md)

## Attribution and originality

Workflow background: https://github.com/Shashankpabba6/ai-smart-hospital-queue-management-system

That repository was reviewed for workflow understanding. No reuse license was found in the reviewed checkout, so its application code, credentials and assets were not copied. CareFlow's business logic, SQL, workspaces, simulation and documentation were written independently. The included framework/hosting scaffold and UI component retain their upstream dependencies/licensing; see `build/sites-vite-plugin.LICENSE` and package metadata. Do not claim ownership of third-party dependencies.

## Honest limitations

This project still requires your own Supabase setup for connected use and email/scheduler configuration for deliveries and offers. The browser demo is not an authorization boundary. Camera QR scanning, full Hindi translation, account-linking for walk-ins, clinician reassignment requests, and integrated ML inference are not implemented in this version. No live hospital results, clinical validation, production readiness or performance improvements are claimed. Read the verification report before presenting it.
