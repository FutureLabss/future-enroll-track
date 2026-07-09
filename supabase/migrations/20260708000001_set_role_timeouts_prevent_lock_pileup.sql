-- Backfill of guardrails applied live on 2026-07-08 after the 13:08 UTC outage
-- (applied via dashboard/MCP during the incident; this file makes them tracked).
-- Idempotent: ALTER ROLE ... SET overwrites the previous value.
--
-- Long migrations/backfills run as postgres and will hit the 2min cap —
-- override per session inside the migration when legitimately needed:
--   SET LOCAL statement_timeout = '10min';

ALTER ROLE postgres SET lock_timeout = '10s';
ALTER ROLE postgres SET statement_timeout = '2min';
ALTER ROLE postgres SET idle_in_transaction_session_timeout = '2min';

ALTER ROLE service_role SET statement_timeout = '30s';
ALTER ROLE service_role SET lock_timeout = '10s';
ALTER ROLE service_role SET idle_in_transaction_session_timeout = '60s';

-- statement_timeouts for authenticated (8s) and anon (3s) pre-existed
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '15s';
