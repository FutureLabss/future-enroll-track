# Coriftech LMS

An isolated learning, enrollment, finance, CRM, and operations platform for Coriftech Solutions Ltd. It includes admin, staff, student, sponsor-organization, marketing, finance, payroll, reporting, classroom, cohort, and multi-hub portals.

## Local setup

1. Install Node.js and run `npm install`.
2. Copy `.env.example` to `.env` and enter the credentials for a new Coriftech Supabase project.
3. Run `npm run dev` and open `http://localhost:8080`.

The application intentionally has no legacy project, URL, bank-account, sender, or payment fallback. Bank-transfer instructions remain hidden until all three `VITE_BANK_*` fields are present. Online checkout remains hidden while `VITE_ONLINE_PAYMENTS_ENABLED=false`.

## Supabase provisioning

Use a new, isolated Supabase project; never link this fork to the source installation.

1. Link the repository with `supabase link --project-ref <coriftech-project-ref>`.
2. Apply the migration history with `supabase db push`.
3. Confirm the default hub is `Coriftech` / `coriftech` and remove any explicitly labelled demo tenant/data before production use.
4. Create the initial user through Supabase Auth, insert its UUID into `public.superadmins`, and add an owner row in `public.hub_members` for hub `00000000-0000-0000-0000-000000000001`.
5. Confirm RLS, payment-receipt storage policies, and database backups.

Required Edge Function secrets:

```text
FRONTEND_URL=https://staging-or-production-domain.example
EMAIL_FROM=Coriftech LMS <notifications@verified-domain.example>
SUPPORT_EMAIL=support@coriftech.com
ADMIN_NOTIFY_EMAILS=operations@example.com,finance@example.com
RESEND_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
UNSUBSCRIBE_SECRET=
BANK_ACCOUNT_NAME=
BANK_ACCOUNT_NUMBER=
BANK_NAME=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
GOOGLE_AI_KEY=
```

`FRONTEND_URL` and `EMAIL_FROM` are mandatory; Edge Functions fail closed when either is absent. Bank details are optional as a group, but instructions appear only when all three values exist. Paystack secrets are not required for the initial bank-transfer-only launch.

Deploy all functions after setting secrets. Configure the existing reminder and CRM schedules with `CRON_SECRET`, then test invitations, password resets, reminders, unsubscribe links, and operational alerts from staging.

## Deployment checklist

- Set the final frontend URL in both Vite and Edge Function configuration.
- Add the site URL and callback patterns to Supabase Auth redirect allowlists.
- Verify the sending domain and set `EMAIL_FROM`.
- Confirm Coriftech's bank details before adding them to frontend or backend configuration.
- Keep online payments disabled until isolated Coriftech payment credentials are approved.
- Point DNS to the host, enable TLS, and test every role on desktop and mobile.
- Run `npm test`, `npm run lint`, `npm run build`, and the relevant Playwright suite.

## Brand assets

The public Coriftech logo files are stored locally as `public/coriftech-logo.png` and `public/coriftech-mark.png`; runtime pages do not hotlink the marketing website.
