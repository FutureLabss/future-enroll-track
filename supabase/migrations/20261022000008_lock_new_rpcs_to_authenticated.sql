-- The client-facing RPCs from 20261022000002-07 all check auth.uid() internally,
-- but Supabase's default privileges also granted them to anon (security advisor
-- anon_security_definer_function_executable). Signed-in users only.
REVOKE EXECUTE ON FUNCTION
  public.can_set_schedule(uuid, uuid),
  public.can_view_activity_report(),
  public.get_activity_counts(timestamptz, timestamptz),
  public.get_activity_report(timestamptz, timestamptz, text, integer),
  public.get_calendar_feed_token(boolean),
  public.get_schedule_permissions(uuid),
  public.grant_activity_report_access(uuid),
  public.list_activity_report_candidates(),
  public.list_activity_report_viewers(),
  public.list_cohort_setup_gaps(uuid),
  public.revoke_activity_report_access(uuid)
FROM PUBLIC, anon;
