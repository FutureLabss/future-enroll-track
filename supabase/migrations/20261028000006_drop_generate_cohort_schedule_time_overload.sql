-- generate_cohort_schedule existed as two overloads with identical parameter names,
-- (uuid, text[], text, text, uuid) and (uuid, text[], time, time, uuid). PostgREST picks
-- an overload by argument names, and the clients send times as JSON strings, so every
-- call failed with PGRST203 "Could not choose the best candidate function" — cohort
-- creation with auto-schedule, the schedule setup dialog and the staff workspace alike.
-- Keep the per-module (text) version, the one the live project ran before
-- 20261022000007 recreated the weekly (time) version alongside it.
DROP FUNCTION IF EXISTS public.generate_cohort_schedule(uuid, text[], time, time, uuid);
