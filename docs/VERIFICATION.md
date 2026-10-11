# Verification and scope

## Executed during the build

- TypeScript type check: passed.
- Standard Next.js production build: passed.
- Sites/Vinext production build: passed.
- Vitest unit + PostgreSQL-compatible database tests: 26 tests passed across three suites.
- SQL migration executed in PGlite with Supabase Auth role fixtures.
- Optional ML experiment executed on synthetic data, seed 42, chronological 80/20 split: baseline MAE **8.8968 minutes**, random-forest MAE **9.9736 minutes**. The baseline performed better on this synthetic holdout. The application therefore makes no ML improvement claim and retains its transparent baseline.

## What the automated checks cover

Public signup role protection, anonymous RPC denial, direct-write denial, cross-patient SELECT/RPC isolation, booking capacity, successful-command idempotency, invalid transitions, repeated/expired QR check-in, staff review, doctor break handling, urgent-priority ordering, active-patient protection, sanitized public output, consultation-note privacy, one-time offer acceptance, inventory bounds/audit, hospital-local date boundaries, queue isolation, deterministic simulation and demo workflow persistence.

## Not executed / not verified

- Browser visual QA and Playwright specs: the supported browser-control capability was unavailable in this managed environment. Specs are included for local execution; they are not reported as passing.
- Real Supabase Auth email verification/recovery, RLS on hosted Supabase, Realtime subscriptions and separate-connection concurrency: no project credentials were provided. PGlite validates SQL but serializes embedded access; it is not a multi-connection race test.
- Real Resend email delivery and external scheduler provisioning: no credentials were provided.
- GitHub publication: source uploaded to SheetalPabba/careflow after the owner connected GitHub and created the repository. Live-service verification limits above still apply.

## Remaining feature scope

- QR: generated opaque token; USB scanner/paste entry works. Browser camera scanning is not included.
- Translation: Hindi navigation and key action labels are included; forms, explanatory text and errors are not fully translated.
- ML: reproducible offline experiment only; no inference endpoint or claimed production model.
- Reassignment: reception/admin can choose ranked same-department doctors with a required reason; a separate doctor-to-reception request inbox is not included.
- Walk-ins: supported as staff-managed records; later linking to a patient Auth account is not included.
- Department catalog, shifts and slots support creation/editing shown in the interface. Shift overlap detection, recurring rota editing and leave scheduling are not included.
- Data reads are bounded to 1,000 latest appointments and 200 audit/notification rows. This prototype needs paginated/server-aggregated reporting before hospital-scale use.
- Waiting ranges are heuristic, not calibrated predictive intervals. Prioritization rules are unvalidated and require clinical review.
- The browser demo is single-browser synthetic state and has no real authorization guarantees. Connected mode must be used to assess security.

## Before use beyond a college demonstration

Obtain clinical, privacy and security review; configure verified staff accounts; test hosted RLS/concurrency and job delivery; establish retention, backups, observability and operational procedures. No actual patient data was used in this build.
