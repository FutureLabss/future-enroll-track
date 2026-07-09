-- Security-advisor sweep: 82 pre-existing SECURITY DEFINER functions carried the
-- default EXECUTE grant to PUBLIC, making every one an anon-callable
-- /rest/v1/rpc endpoint. Each gets: revoke from PUBLIC/anon, explicit grant to
-- authenticated + service_role (many relied on the PUBLIC grant for their normal
-- authenticated/edge-function callers, so the grant must be explicit).
--
-- Deliberately UNTOUCHED (still anon-executable, verified against live usage):
--   * policy helpers evaluated under roles={public} policies: is_superadmin (both),
--     has_role, get_my_hub_id, get_*_hub_id walkers, enrollment_is_mine/_in_my_hub,
--     invoice_is_mine/_in_my_hub, _get_classroom_hub_id, _get_hub_id_for_cs
--     (revoking these breaks anon SELECTs with permission-denied errors);
--   * pre-auth RPCs called from public pages (EnrollPage/StudentSignupPage/invite
--     pages run before a session exists when email confirmation is on):
--     get_enrollment_for_completion, get_enrollment_field_values,
--     link_enrollment_to_user, submit_enrollment_fields, accept_hub_invitation,
--     accept_staff_invitation;
--   * the 12 classroom rework helpers (already locked down in 20260709000010).
-- Trigger-typed functions are included in the sweep: EXECUTE is not checked when a
-- trigger fires, and PostgREST cannot expose them, so the revoke is pure hardening.

revoke execute on function public.add_student_to_cohort(uuid,uuid,uuid) from public, anon;
grant execute on function public.add_student_to_cohort(uuid,uuid,uuid) to authenticated, service_role;
revoke execute on function public.admin_delete_enrollment(uuid) from public, anon;
grant execute on function public.admin_delete_enrollment(uuid) to authenticated, service_role;
revoke execute on function public.admin_delete_invoice(uuid) from public, anon;
grant execute on function public.admin_delete_invoice(uuid) to authenticated, service_role;
revoke execute on function public.admin_update_invoice(uuid,numeric,jsonb) from public, anon;
grant execute on function public.admin_update_invoice(uuid,numeric,jsonb) to authenticated, service_role;
revoke execute on function public.approve_invoice_change(uuid) from public, anon;
grant execute on function public.approve_invoice_change(uuid) to authenticated, service_role;
revoke execute on function public.approve_staff_invoice(uuid,date) from public, anon;
grant execute on function public.approve_staff_invoice(uuid,date) to authenticated, service_role;
revoke execute on function public.assign_staff_to_classroom(uuid,uuid,text) from public, anon;
grant execute on function public.assign_staff_to_classroom(uuid,uuid,text) to authenticated, service_role;
revoke execute on function public.auto_enroll_on_classroom_program() from public, anon;
grant execute on function public.auto_enroll_on_classroom_program() to authenticated, service_role;
revoke execute on function public.auto_enroll_student_classroom(uuid) from public, anon;
grant execute on function public.auto_enroll_student_classroom(uuid) to authenticated, service_role;
revoke execute on function public.auto_enroll_student_in_classrooms() from public, anon;
grant execute on function public.auto_enroll_student_in_classrooms() to authenticated, service_role;
revoke execute on function public.backfill_classroom_students_on_classroom_insert() from public, anon;
grant execute on function public.backfill_classroom_students_on_classroom_insert() to authenticated, service_role;
revoke execute on function public.cancel_admin_invite(text) from public, anon;
grant execute on function public.cancel_admin_invite(text) to authenticated, service_role;
revoke execute on function public.clear_cohort_scope_on_entity_delete() from public, anon;
grant execute on function public.clear_cohort_scope_on_entity_delete() to authenticated, service_role;
revoke execute on function public.clone_curriculum_to_cohort(uuid,uuid) from public, anon;
grant execute on function public.clone_curriculum_to_cohort(uuid,uuid) to authenticated, service_role;
revoke execute on function public.clone_curriculum_v2(uuid,uuid,text) from public, anon;
grant execute on function public.clone_curriculum_v2(uuid,uuid,text) to authenticated, service_role;
revoke execute on function public.compute_cohort_graduation(uuid) from public, anon;
grant execute on function public.compute_cohort_graduation(uuid) to authenticated, service_role;
revoke execute on function public.create_admin_invite(text) from public, anon;
grant execute on function public.create_admin_invite(text) to authenticated, service_role;
revoke execute on function public.create_curriculum_from_structure(uuid,jsonb) from public, anon;
grant execute on function public.create_curriculum_from_structure(uuid,jsonb) to authenticated, service_role;
revoke execute on function public.curriculum_add_lesson(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.curriculum_add_lesson(uuid,text,text,text,text,text) to authenticated, service_role;
revoke execute on function public.curriculum_add_lesson(uuid,text,text,text) from public, anon;
grant execute on function public.curriculum_add_lesson(uuid,text,text,text) to authenticated, service_role;
revoke execute on function public.curriculum_add_module(uuid,text,text) from public, anon;
grant execute on function public.curriculum_add_module(uuid,text,text) to authenticated, service_role;
revoke execute on function public.curriculum_add_track(uuid,text,text) from public, anon;
grant execute on function public.curriculum_add_track(uuid,text,text) to authenticated, service_role;
revoke execute on function public.curriculum_add_unit(uuid,text,text) from public, anon;
grant execute on function public.curriculum_add_unit(uuid,text,text) to authenticated, service_role;
revoke execute on function public.curriculum_delete_lesson(uuid) from public, anon;
grant execute on function public.curriculum_delete_lesson(uuid) to authenticated, service_role;
revoke execute on function public.curriculum_delete_module(uuid) from public, anon;
grant execute on function public.curriculum_delete_module(uuid) to authenticated, service_role;
revoke execute on function public.curriculum_delete_track(uuid) from public, anon;
grant execute on function public.curriculum_delete_track(uuid) to authenticated, service_role;
revoke execute on function public.curriculum_delete_unit(uuid) from public, anon;
grant execute on function public.curriculum_delete_unit(uuid) to authenticated, service_role;
revoke execute on function public.curriculum_update_lesson(uuid,text,text,text,integer,text,text) from public, anon;
grant execute on function public.curriculum_update_lesson(uuid,text,text,text,integer,text,text) to authenticated, service_role;
revoke execute on function public.curriculum_update_lesson(uuid,text,text,text,integer) from public, anon;
grant execute on function public.curriculum_update_lesson(uuid,text,text,text,integer) to authenticated, service_role;
revoke execute on function public.curriculum_update_module(uuid,text,text,integer) from public, anon;
grant execute on function public.curriculum_update_module(uuid,text,text,integer) to authenticated, service_role;
revoke execute on function public.curriculum_update_track(uuid,text,text,integer) from public, anon;
grant execute on function public.curriculum_update_track(uuid,text,text,integer) to authenticated, service_role;
revoke execute on function public.curriculum_update_unit(uuid,text,text,integer) from public, anon;
grant execute on function public.curriculum_update_unit(uuid,text,text,integer) to authenticated, service_role;
revoke execute on function public.enforce_admin_role_grant() from public, anon;
grant execute on function public.enforce_admin_role_grant() to authenticated, service_role;
revoke execute on function public.generate_attendance_session(uuid,uuid,uuid,integer,uuid) from public, anon;
grant execute on function public.generate_attendance_session(uuid,uuid,uuid,integer,uuid) to authenticated, service_role;
revoke execute on function public.generate_class_schedule(uuid,uuid,date,date,integer[],time without time zone,time without time zone,uuid) from public, anon;
grant execute on function public.generate_class_schedule(uuid,uuid,date,date,integer[],time without time zone,time without time zone,uuid) to authenticated, service_role;
revoke execute on function public.generate_cohort_schedule(uuid,text[],text,text,uuid) from public, anon;
grant execute on function public.generate_cohort_schedule(uuid,text[],text,text,uuid) to authenticated, service_role;
revoke execute on function public.generate_cohort_schedule(uuid,text[],time without time zone,time without time zone,uuid) from public, anon;
grant execute on function public.generate_cohort_schedule(uuid,text[],time without time zone,time without time zone,uuid) to authenticated, service_role;
revoke execute on function public.get_classroom_curricula_trees(uuid) from public, anon;
grant execute on function public.get_classroom_curricula_trees(uuid) to authenticated, service_role;
revoke execute on function public.get_classroom_curricula(uuid) from public, anon;
grant execute on function public.get_classroom_curricula(uuid) to authenticated, service_role;
revoke execute on function public.get_classroom_lesson_options(uuid) from public, anon;
grant execute on function public.get_classroom_lesson_options(uuid) to authenticated, service_role;
revoke execute on function public.get_classroom_schedules(uuid) from public, anon;
grant execute on function public.get_classroom_schedules(uuid) to authenticated, service_role;
revoke execute on function public.get_classroom_scope_options(uuid) from public, anon;
grant execute on function public.get_classroom_scope_options(uuid) to authenticated, service_role;
revoke execute on function public.get_classroom_students(uuid) from public, anon;
grant execute on function public.get_classroom_students(uuid) to authenticated, service_role;
revoke execute on function public.get_cohort_analytics(uuid) from public, anon;
grant execute on function public.get_cohort_analytics(uuid) to authenticated, service_role;
revoke execute on function public.get_cohort_members(uuid) from public, anon;
grant execute on function public.get_cohort_members(uuid) to authenticated, service_role;
revoke execute on function public.get_curriculum_tree(uuid) from public, anon;
grant execute on function public.get_curriculum_tree(uuid) to authenticated, service_role;
revoke execute on function public.get_dashboard_stats() from public, anon;
grant execute on function public.get_dashboard_stats() to authenticated, service_role;
revoke execute on function public.get_enrollment_performance(integer,date,date) from public, anon;
grant execute on function public.get_enrollment_performance(integer,date,date) to authenticated, service_role;
revoke execute on function public.get_finance_summary(integer,date,date) from public, anon;
grant execute on function public.get_finance_summary(integer,date,date) to authenticated, service_role;
revoke execute on function public.get_my_hub_context() from public, anon;
grant execute on function public.get_my_hub_context() to authenticated, service_role;
revoke execute on function public.get_staff_names(uuid[]) from public, anon;
grant execute on function public.get_staff_names(uuid[]) to authenticated, service_role;
revoke execute on function public.get_student_progress(uuid,uuid) from public, anon;
grant execute on function public.get_student_progress(uuid,uuid) to authenticated, service_role;
revoke execute on function public.get_unit_lessons(uuid) from public, anon;
grant execute on function public.get_unit_lessons(uuid) to authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon;
grant execute on function public.handle_new_user() to authenticated, service_role;
revoke execute on function public.invite_admin(text) from public, anon;
grant execute on function public.invite_admin(text) to authenticated, service_role;
revoke execute on function public.list_admins() from public, anon;
grant execute on function public.list_admins() to authenticated, service_role;
revoke execute on function public.list_audit_logs(integer) from public, anon;
grant execute on function public.list_audit_logs(integer) to authenticated, service_role;
revoke execute on function public.list_hubs() from public, anon;
grant execute on function public.list_hubs() to authenticated, service_role;
revoke execute on function public.list_outstanding_invoices(boolean) from public, anon;
grant execute on function public.list_outstanding_invoices(boolean) to authenticated, service_role;
revoke execute on function public.list_staff_users() from public, anon;
grant execute on function public.list_staff_users() to authenticated, service_role;
revoke execute on function public.mark_attendance(text,numeric,numeric) from public, anon;
grant execute on function public.mark_attendance(text,numeric,numeric) to authenticated, service_role;
revoke execute on function public.notifications_set_hub_id() from public, anon;
grant execute on function public.notifications_set_hub_id() to authenticated, service_role;
revoke execute on function public.post_recurring_expense(uuid,date) from public, anon;
grant execute on function public.post_recurring_expense(uuid,date) to authenticated, service_role;
revoke execute on function public.post_recurring_income(uuid,date) from public, anon;
grant execute on function public.post_recurring_income(uuid,date) to authenticated, service_role;
revoke execute on function public.programs_set_hub_id() from public, anon;
grant execute on function public.programs_set_hub_id() to authenticated, service_role;
revoke execute on function public.promote_staff_to_admin(uuid) from public, anon;
grant execute on function public.promote_staff_to_admin(uuid) to authenticated, service_role;
revoke execute on function public.reject_invoice_change(uuid,text) from public, anon;
grant execute on function public.reject_invoice_change(uuid,text) to authenticated, service_role;
revoke execute on function public.reject_staff_invoice(uuid,text) from public, anon;
grant execute on function public.reject_staff_invoice(uuid,text) to authenticated, service_role;
revoke execute on function public.remove_student_from_cohort(uuid) from public, anon;
grant execute on function public.remove_student_from_cohort(uuid) to authenticated, service_role;
revoke execute on function public.request_invoice_change(uuid,text,jsonb) from public, anon;
grant execute on function public.request_invoice_change(uuid,text,jsonb) to authenticated, service_role;
revoke execute on function public.revoke_admin(text) from public, anon;
grant execute on function public.revoke_admin(text) to authenticated, service_role;
revoke execute on function public.run_cohort_graduation_sweep() from public, anon;
grant execute on function public.run_cohort_graduation_sweep() to authenticated, service_role;
revoke execute on function public.set_graduation_override(uuid,text,text) from public, anon;
grant execute on function public.set_graduation_override(uuid,text,text) to authenticated, service_role;
revoke execute on function public.set_hub_id_from_context() from public, anon;
grant execute on function public.set_hub_id_from_context() to authenticated, service_role;
revoke execute on function public.staff_mark_attendance_manual(uuid,uuid,text) from public, anon;
grant execute on function public.staff_mark_attendance_manual(uuid,uuid,text) to authenticated, service_role;
revoke execute on function public.staff_set_hub_id() from public, anon;
grant execute on function public.staff_set_hub_id() to authenticated, service_role;
revoke execute on function public.stop_recurring_income(uuid) from public, anon;
grant execute on function public.stop_recurring_income(uuid) to authenticated, service_role;
revoke execute on function public.switch_hub_context(uuid) from public, anon;
grant execute on function public.switch_hub_context(uuid) to authenticated, service_role;
revoke execute on function public.switch_student_classroom(uuid,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.switch_student_classroom(uuid,uuid,uuid,uuid,text) to authenticated, service_role;
revoke execute on function public.sync_cohort_student_to_classroom() from public, anon;
grant execute on function public.sync_cohort_student_to_classroom() to authenticated, service_role;
revoke execute on function public.sync_enrollment_first_due_date() from public, anon;
grant execute on function public.sync_enrollment_first_due_date() to authenticated, service_role;
revoke execute on function public.upsert_enrollment_target(date,integer,text) from public, anon;
grant execute on function public.upsert_enrollment_target(date,integer,text) to authenticated, service_role;
