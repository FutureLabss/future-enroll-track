-- Stage 0A of the classroom RLS rework (docs/rls-rework-plan.md).
-- Captures every policy on the 13 scoped tables AS LIVE AT APPLY TIME into a backup
-- table, so each later stage has a one-line restore path. Executable restore script:
-- docs/rls-rollback-classroom.sql (generated from the 2026-07-09 prod dump).
-- Ops table, not domain data: no hub_id/policies on purpose — RLS enabled with no
-- policies + revoked grants means only postgres/service_role can read it
-- (same shape as _rls_policy_backup from the perf audit).

create table if not exists public._rls_policy_backup_classroom (
  captured_at timestamptz not null default now(),
  schemaname  name not null,
  tablename   name not null,
  policyname  name not null,
  permissive  text,
  roles       name[],
  cmd         text,
  qual        text,
  with_check  text
);

alter table public._rls_policy_backup_classroom enable row level security;
revoke all on table public._rls_policy_backup_classroom from anon, authenticated;

insert into public._rls_policy_backup_classroom
  (schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check)
select schemaname, tablename, policyname, permissive, roles::name[], cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'assignments','assignment_submissions','schedules','field_values',
    'attendance_sessions','attendance_records','presentations','presentation_grades',
    'curricula','tracks','modules','units','lessons');
