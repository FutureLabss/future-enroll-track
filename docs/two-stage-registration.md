# Two-stage registration

New self-service registrations use flow version 2. Existing enrollments and existing admin-managed enrollment workflows remain version 1 and retain access. Every enrollment receives a database-generated, immutable registration number.

## Deploy and configure

1. Apply `20261019000000_two_stage_registration.sql` after the existing migrations. It backfills IDs without changing historical invoices or payments. Back up the database through the normal release process first.
   Also apply `20261019000001_restore_registration_profile_fields.sql`. It inserts missing definitions for the eight existing v2 core profile questions without overwriting custom definitions. These fields are required by profile version. It also reopens new-flow profiles completed without the required data and removes their premature classroom/cohort memberships; confirmed money and legacy access are preserved.
   Apply `20261019000002_capture_registration_names.sql` before releasing the updated frontend. It adds `start_registration_with_names`, which builds the full name and saves first name/surname alongside registration creation in one transaction. The original RPC remains available for older clients.
2. Deploy `paystack-init`, `paystack-verify`, and `paystack-webhook` together. The webhook has JWT verification disabled in `supabase/config.toml`; it authenticates the exact body using Paystack's HMAC SHA512 signature. Both webhook and callback verification use one transactional settlement operation.
3. Set backend `PAYSTACK_SECRET_KEY` and `FRONTEND_URL` to the checkout environment and deployed frontend origin. Existing notification configuration remains required for payment emails. Configure Paystack's webhook URL as `https://YOUR_PROJECT.supabase.co/functions/v1/paystack-webhook`. See [Paystack webhook setup](https://paystack.com/docs/payments/webhooks/).
4. Configure frontend `VITE_ONLINE_PAYMENTS_ENABLED` and/or all three `VITE_BANK_ACCOUNT_NAME`, `VITE_BANK_ACCOUNT_NUMBER`, `VITE_BANK_NAME` variables before releasing the frontend. A disabled method is hidden. Receipts for new registrations use the private `registration-receipts` bucket and short-lived signed read links.
5. In **Programs → open a program → Registration pricing**, set the course fee and installment schedules. Fees are not inferred from old invoices. Blank prices disable new paid registration for that course. Percentages must total 100, start at day 0, and have increasing integer day offsets; each installment must be at least NGN 1,000. Removing a plan does not change existing registrations.
6. Release the frontend after the backend and prices are ready. Verify one full payment, installment deposit, bank receipt review, and custom deposit approval in the payment provider's test environment before switching to live keys.

## Applicant and admin behavior

- `/enroll` asks the applicant to sign in or create an account, then collects first name and surname and saves one active registration per account/course. The full name is generated automatically. Segment 2 loads those saved name components for review or correction, so applicants do not need to re-enter them. Email verification, if enabled, continues through the existing login flow. The registration price and schedule are fixed when it is saved.
- Standard amounts are derived on the server. Custom deposits change only the initial payment, require NGN 1,000 minimum for both the deposit and remaining balance, and must be approved by an admin after payment.
- Profile completion becomes available after verified online payment or a submitted transfer receipt. Completing a profile never approves a transfer or custom amount.
- Review transfers in **Pending Payments**. Review custom arrangements in the enrollment detail screen, with a reason and a remaining schedule. Due dates must be in the future and amounts must total the fee minus the agreed deposit. Review order does not matter. Repeated approval is harmless.
- Rejected custom requests keep confirmed payments credited. An admin may subsequently approve revised remaining terms. Refunds are handled outside this feature.
- Login, registration, invoices, payment retry/callbacks, and review status stay reachable before clearance. A new applicant cannot enter the dashboard or classroom content until profile completion and payment clearance, including custom approval. An existing eligible course still permits dashboard use while another registration is incomplete.
- The PDF supplied for planning is reference material. Inquiry forms and the list of profile questions are unchanged. Existing completion URLs require the applicant's login and enforce enrollment ownership.
- Segment 2 needs active, student-visible definitions for `surname`, `first_name`, `date_of_birth`, `sex`, `pwd_status`, `state_of_residence`, `residential_address`, and `highest_educational_qualification`. Check **Custom Fields** if a form reports it is unavailable. Existing definitions are preserved by the setup migration, including their labels, options, and visibility. Missing or hidden required definitions block new-flow completion instead of silently accepting an empty form.

## Verification

- `npm run build`
- `npm test -- src/test/lib/registration.test.ts`
- `npx playwright test e2e/registration.spec.ts` (mocked account/payment responses; no real charges). Set `PLAYWRIGHT_BASE_URL` when using an already running server on another port.
- `node scripts/test-registration-db.mjs` against a **disposable local** PostgreSQL server at `127.0.0.1:55439`, user `postgres`, trust authentication. Override only the port with `REGISTRATION_TEST_PORT`. The script creates and removes its own database, bootstraps minimal Supabase auth/storage fixtures, applies the full migration chain, and exercises real SQL permissions, legacy access, required fields, payment review, concurrency, and settlement. It never connects to the configured Supabase project.

Monitor Edge Function logs for payment verification/webhook failures and notification failures, audit logs for transfer/custom reviews, and initialized payment attempts with a matching successful provider transaction that has not settled. Webhook failures return HTTP 500 for Paystack retries; successful repeated deliveries do not credit again. Checkout references created by the old handler can still be reconciled for legacy enrollments using verified provider metadata.

Regenerate `src/integrations/supabase/types.ts` after applying the migration through the project's normal typegen process. New interfaces currently live in `src/lib/registration.ts`, with the ungenerated client boundary kept in one place.
