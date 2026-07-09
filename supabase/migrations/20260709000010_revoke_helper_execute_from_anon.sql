-- Post-apply hardening flagged by the security advisor: CREATE FUNCTION grants
-- EXECUTE to PUBLIC by default, which exposed the 12 rework helpers as anon-callable
-- /rest/v1/rpc endpoints (the walk-up scalars would answer "which classroom does
-- assignment X belong to" for anyone holding a uuid). No policy evaluates the helpers
-- as anon (all swapped policies are TO authenticated; the verbatim public policies on
-- field_values/attendance_records don't call helpers), so anon loses nothing it uses.

revoke execute on function
  public.classroom_read_access(uuid),
  public.classroom_staff_access(uuid),
  public.classroom_manage_access(uuid),
  public.classroom_attendance_access(uuid),
  public.classroom_admin_access(uuid),
  public.cohort_is_mine(uuid),
  public.assignment_classroom_id(uuid),
  public.presentation_classroom_id(uuid),
  public.curriculum_classroom_id(uuid),
  public.track_classroom_id(uuid),
  public.module_classroom_id(uuid),
  public.unit_classroom_id(uuid)
from public, anon;
