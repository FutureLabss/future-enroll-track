# Project Tracker access and sign-in

Project Tracker (repo `futurelabs-project-tracker`, Supabase `yijqfophsfudghspoddu`) has no logins of its own. People open it from the LMS sidebar, and only people the **superadmin** has granted access to can get in. The superadmin also sets their Tracker role (member, manager or admin). The Tracker cannot add people, change roles or switch accounts on or off.

## How it fits together

```
LMS superadmin ── /admin/project-tracker-access ──► project-tracker-access (LMS fn)
                                                      │ 1. set/revoke_project_tracker_access (as the superadmin; audited)
                                                      │ 2. POST sync-lms-access (Tracker fn) ──► apply_lms_access()
                                                      ▼
                                       project_tracker_access.synced_at / sync_error

Granted user clicks "Project Tracker" in the LMS sidebar
  └► create-project-tracker-sso (LMS fn)  refuses unless granted; stores SHA-256 of a 90-second code
       └► browser → <tracker>/auth/callback?code=…
            └► consume-project-tracker-sso (Tracker fn)
                 └► POST redeem-project-tracker-sso (LMS fn, server secret)
                      → consumes the code once, re-checks the grant, returns id, name, email, role
                 └► apply_lms_access() then a 15-minute Tracker session (renewed while active)
```

- **Source of truth:** `public.project_tracker_access` in the LMS. One row per person; `revoked_at` marks a revoked grant. No `hub_id`: the Tracker is one workspace across hubs.
- **Who can be granted:** admin, staff and marketing accounts and the superadmin (`is_project_tracker_eligible`). Students and sponsor organisations cannot.
- **Revocation takes effect immediately** when the push succeeds: the Tracker marks the person inactive, ends their sessions and removes them as lead of active projects. Their tasks and history stay.
- **If a push fails** (Tracker down, or a Tracker rule such as "cannot remove the last active administrator"), the LMS change stands, the row shows *Not applied* with the reason, and the superadmin can press **Retry**. Every sign-in also re-applies the LMS's current answer, so a missed grant or role change catches up at the person's next sign-in, and a missed revocation is applied if they try to sign in again. A revoked person who is still signed in keeps their session until it next renews (at most 15 minutes, or longer only while they stay active), so retry failed revocations.
- **Existing Tracker people:** the first grant for an LMS account whose email matches an existing Tracker profile adopts that profile, keeping its tasks and history (`lms_account_links`). Otherwise a profile is created with the LMS user id.
- **Cut-over:** the Tracker migration drops password sign-in (`tracker_auth_links`) and ends every open session. Nobody can use the Tracker until the superadmin grants access in the LMS.

## Secrets and configuration

Generate two independent random secrets (e.g. `openssl rand -hex 32`): **REDEEM** and **SYNC**.

**LMS** (Supabase `ozjxktxbzhkujavmzjrf` → Edge Functions → Secrets):

| Secret | Value |
|---|---|
| `PROJECT_TRACKER_URL` | Tracker origin, e.g. `https://tracker.futurelabs.ng` (no path) |
| `PROJECT_TRACKER_SSO_ALLOWED_ORIGINS` | LMS origins, comma-separated, e.g. `https://admin.futurelabs.ng` |
| `PROJECT_TRACKER_REDEEM_SECRET` | REDEEM |
| `PROJECT_TRACKER_SYNC_URL` | `https://yijqfophsfudghspoddu.supabase.co/functions/v1/sync-lms-access` |
| `PROJECT_TRACKER_SYNC_SECRET` | SYNC |

LMS frontend build: `VITE_PROJECT_TRACKER_URL` = the Tracker origin.

**Tracker** (Supabase `yijqfophsfudghspoddu` → Edge Functions → Secrets), in addition to the existing `TRACKER_SIGNING_JWK`, `TRACKER_SUPABASE_SECRET_KEY` and `TRACKER_ALLOWED_ORIGINS`:

| Secret | Value |
|---|---|
| `LMS_SSO_CONSUME_URL` | `https://ozjxktxbzhkujavmzjrf.supabase.co/functions/v1/redeem-project-tracker-sso` |
| `LMS_SSO_CONSUME_SECRET` | REDEEM |
| `TRACKER_SYNC_SECRET` | SYNC |

Tracker frontend build: `VITE_LMS_APP_URL` = the LMS URL ("Go to the LMS" on the Tracker's landing screen).

## Deployment order

1. **LMS backend:** apply `20261030000001_project_tracker_sso.sql` and `20261030000002_project_tracker_access.sql`, set the LMS secrets, deploy `create-project-tracker-sso`, `redeem-project-tracker-sso` and `project-tracker-access`.
2. **Tracker backend:** set the Tracker secrets, apply `20261030000100_lms_managed_access.sql`, deploy `consume-project-tracker-sso` and `sync-lms-access`. From here until step 3 nobody can use the Tracker.
3. **LMS frontend:** deploy. The superadmin opens **Tracker Access** and grants people, granting at least one Tracker **admin** first. Each row should show *Up to date*.
4. **Tracker frontend:** deploy (password form removed, renewal via the SSO function).

## Verification

Automated: `npm test` here (`src/test/lib/projectTracker*.test.ts`, `ProjectTrackerLink.test.tsx`) and `npm test` in the Tracker (`tests/sso.test.mjs`, `tests/admin-database.test.mjs`). `supabase/tests/project_tracker_sso.sql` checks code expiry, replay and privileges on a migrated test database.

Manual, after deploying:
1. As the superadmin, grant a staff account *member* access. The row shows *Up to date*; that person now sees **Project Tracker** in the LMS sidebar and lands in the Tracker as a member.
2. Change their role to *manager*. The Tracker's People view shows them as a manager straight away, and their own Tracker view switches within about 30 seconds.
3. Revoke them. They are signed out of the Tracker within one request, the sidebar link disappears after the LMS refreshes, and the Tracker shows them inactive.
4. A student account is not offered on the page, and calling `set_project_tracker_access` for one is refused.
5. Opening the Tracker URL directly shows only "Go to the LMS", with no password form.
6. Try to revoke the only Tracker admin: the LMS records it, and the row shows *Not applied — Cannot remove the last active administrator* until another admin is granted and Retry is pressed.
