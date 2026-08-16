-- notifications.enrollment_id had no ON DELETE action, so deleting an enrollment
-- (e.g. a duplicate/erroneous signup) failed with a foreign key violation until
-- its notification rows were removed by hand first (see 2026-08-11 cleanup of
-- two cancelled duplicate enrollments whose invoices were still counting as revenue).
-- Notifications are disposable — there's no reason they should ever block deleting
-- the enrollment they're about. invoices.enrollment_id and field_values.enrollment_id
-- already cascade; this brings notifications in line with that existing pattern.
--
-- Deliberately NOT touching attendance_records/assignment_submissions, which have
-- the same gap: those represent real academic history, and failing loudly if
-- someone tries to delete an enrollment that has any is safer than silently
-- erasing it.

ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_enrollment_id_fkey,
  ADD CONSTRAINT notifications_enrollment_id_fkey
    FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;
