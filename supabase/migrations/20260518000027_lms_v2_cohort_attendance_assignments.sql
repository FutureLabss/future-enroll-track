-- LMS v2.0: extend existing tables to support new content hierarchy.
-- Cohorts get scope_type/scope_id for curriculum|track|module scoping.
-- Attendance sessions/records get schedule_id.
-- Assignments get unit_id.

ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS scope_type text CHECK (scope_type IN ('curriculum','track','module')),
  ADD COLUMN IF NOT EXISTS scope_id   uuid;

ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;
