-- Performance audit findings B3/B6/B8/B9/B10: hub_id (the multitenancy anchor)
-- and hot FK columns were unindexed on most tables, forcing sequential scans
-- that grow with total platform size, not per-hub size.

-- hub_id on hub-scoped tables (programs/classrooms already indexed)
CREATE INDEX IF NOT EXISTS idx_cohorts_hub_id       ON public.cohorts(hub_id);
CREATE INDEX IF NOT EXISTS idx_staff_hub_id         ON public.staff(hub_id);
CREATE INDEX IF NOT EXISTS idx_notifications_hub_id ON public.notifications(hub_id);
CREATE INDEX IF NOT EXISTS idx_expenses_hub_id      ON public.expenses(hub_id);
CREATE INDEX IF NOT EXISTS idx_other_income_hub_id  ON public.other_income(hub_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_hub_id ON public.custom_fields(hub_id);
CREATE INDEX IF NOT EXISTS idx_hub_members_hub_id   ON public.hub_members(hub_id);

-- FK columns queried standalone (send-bulk-email, send-account-reminders, cohort pages)
CREATE INDEX IF NOT EXISTS idx_enrollments_cohort_id ON public.enrollments(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_program_id    ON public.cohorts(program_id);

-- notifications: written by six functions, read by check-due-reminders' dedup
-- check (enrollment_id, type, created_at) and by the student notifications page (user_id)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_enrollment_type_created
  ON public.notifications(enrollment_id, type, created_at);

-- audit_logs: list_audit_logs filters by user_id and sorts by created_at DESC
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);

-- pending_payments: looked up by invoice/enrollment when admins verify transfers
CREATE INDEX IF NOT EXISTS idx_pending_payments_invoice_id    ON public.pending_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_enrollment_id ON public.pending_payments(enrollment_id);
