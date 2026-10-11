# Five-minute demonstration

1. Open `/workspace?demo=1`, press Reset demo, and explain that records are synthetic and local to this browser.
2. Switch to Patient. Show the appointment token and QR. Book an available slot. Explain that scheduled does not mean checked in, and estimates appear after staff review.
3. Switch to Reception. Open Appointments and check in Ananya's scheduled record. Review priority, enter a reason, and save. Demonstrate walk-in registration.
4. Switch to Doctor. Call next patient, start consultation, then complete with a short synthetic note. Demonstrate pause/resume. Explain confirmed priority and arrival order.
5. Switch to Admin. Show analytics calculated from the stored timestamps, edit available beds, inspect the audit trail, then change arrivals/doctors in Simulation lab. Open the waiting-room display after calling a patient to demonstrate privacy.

The demo is not a substitute for production authentication/RLS. Use the connected workflow and the migration tests to explain those layers. Demo email is simulated; scheduled waitlist allocation runs only in connected mode.

## Accurate resume wording

- Built CareFlow, an original Next.js and Supabase hospital queue prototype with patient, reception, doctor, and administrator workflows.
- Implemented transactional booking, clinician-reviewed queue priority, role-based data policies, QR tokens, operational analytics, and an isolated capacity simulation.
- Added automated unit and PostgreSQL-compatible workflow tests; documented deployment configuration and external-service validation limits.

Use these bullets only after reviewing and understanding the delivered code. Do not claim real hospital deployment, measured wait reductions, trained clinical triage, or live email delivery unless you independently establish those results.
