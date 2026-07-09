# Uptime Monitoring Setup (UptimeRobot)

Both 2026-07-08 outages were discovered by accident, not by an alert. This closes that
gap. Total setup time: ~5 minutes at https://uptimerobot.com (free plan: 50 monitors,
5-minute checks, email alerts).

## Monitor 1 — Auth service (the canary)

Auth died first in both outages, so this is the primary signal.

- **Type**: HTTP(s)
- **URL**: `https://ozjxktxbzhkujavmzjrf.supabase.co/auth/v1/health`
- **Interval**: 5 minutes
- **Custom HTTP header**: `apikey: <VITE_SUPABASE_PUBLISHABLE_KEY from .env>`
  (this key is public — it ships in the frontend bundle — so putting it in
  UptimeRobot is fine)
- Healthy = HTTP 200 in ~1–3s. During an outage this returns 522 after ~20s.

## Monitor 2 — Database through REST (catches DB-only failures)

A fast gateway 401/404 can mask a dead database, so this one must exercise a real
table query.

- **Type**: HTTP(s) with keyword
- **URL**: `https://ozjxktxbzhkujavmzjrf.supabase.co/rest/v1/hubs?select=id&limit=1`
- **Custom HTTP headers**:
  - `apikey: <same publishable key>`
  - `Authorization: Bearer <same publishable key>`
- **Keyword**: `[` — keyword *exists* means up (the endpoint returns a JSON array;
  a Cloudflare 522 HTML page contains no `[`... it does contain `[if lt IE`, so
  instead set keyword type to "keyword exists" with keyword `"id"` OR simply rely on
  status-code monitoring: any non-2xx or timeout = down. Simplest reliable config:
  plain HTTP(s) monitor, alert on non-2xx/timeout.)
- **Interval**: 5 minutes

## Alerts

- Add your email (and phone if you upgrade) as an alert contact on both monitors.
- Set "alert when down for" to 1 check (immediate) — both outages lasted 30+ minutes,
  and the 5-min interval already provides debounce.

## When an alert fires

Follow the incident playbook in `database-change-policy.md` §4: confirm scope, capture
logs via the Management API analytics endpoint BEFORE restarting, try SQL diagnosis,
restart only as last resort (`POST https://api.supabase.com/v1/projects/ozjxktxbzhkujavmzjrf/restart`).
