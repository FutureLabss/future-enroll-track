-- Comprehensive sweep: every "Admins manage X" policy that previously let
-- is_superadmin() bypass hub filtering now requires hub scope for ALL callers.
-- Superadmins use the hub switcher (switch_hub_context RPC) to set context,
-- so get_my_hub_id() correctly returns their active hub.
--
-- Pattern changed from:
--   USING (is_superadmin() OR (has_role(...,'admin') AND hub_scoped))
-- To:
--   USING ((is_superadmin() OR has_role(...,'admin')) AND hub_scoped)

-- ── classrooms ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage classrooms" ON public.classrooms;
CREATE POLICY "Admins manage classrooms"
  ON public.classrooms FOR ALL
  USING  ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id())
  WITH CHECK ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id());

-- ── classroom_staff ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage classroom_staff" ON public.classroom_staff;
CREATE POLICY "Admins manage classroom_staff"
  ON public.classroom_staff FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_staff.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── classroom_students ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage classroom_students" ON public.classroom_students;
CREATE POLICY "Admins manage classroom_students"
  ON public.classroom_students FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_students.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── classroom_permissions ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage permissions" ON public.classroom_permissions;
CREATE POLICY "Admins manage permissions"
  ON public.classroom_permissions FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classrooms c ON c.id = cs.classroom_id
      WHERE cs.id = classroom_permissions.classroom_staff_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classrooms c ON c.id = cs.classroom_id
      WHERE cs.id = classroom_staff_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── cohort_students ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage cohort_students" ON public.cohort_students;
CREATE POLICY "Admins manage cohort_students"
  ON public.cohort_students FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.cohorts co
      JOIN public.classrooms c ON c.id = co.classroom_id
      WHERE co.id = cohort_students.cohort_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.cohorts co
      JOIN public.classrooms c ON c.id = co.classroom_id
      WHERE co.id = cohort_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── cohorts ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage cohorts" ON public.cohorts;
CREATE POLICY "Admins manage cohorts"
  ON public.cohorts FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = cohorts.program_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.programs p
      WHERE p.id = program_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- ── staff_invitations ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage invitations" ON public.staff_invitations;
CREATE POLICY "Admins manage invitations"
  ON public.staff_invitations FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = staff_invitations.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── assignments ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage assignments" ON public.assignments;
CREATE POLICY "Admins manage assignments"
  ON public.assignments FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = assignments.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── assignment_resources ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage assignment_resources" ON public.assignment_resources;
CREATE POLICY "Admins manage assignment_resources"
  ON public.assignment_resources FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.classrooms c ON c.id = a.classroom_id
      WHERE a.id = assignment_resources.assignment_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.classrooms c ON c.id = a.classroom_id
      WHERE a.id = assignment_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── assignment_submissions ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage submissions" ON public.assignment_submissions;
CREATE POLICY "Admins manage submissions"
  ON public.assignment_submissions FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.classrooms c ON c.id = a.classroom_id
      WHERE a.id = assignment_submissions.assignment_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      JOIN public.classrooms c ON c.id = a.classroom_id
      WHERE a.id = assignment_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── attendance_sessions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Admins manage attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = attendance_sessions.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── attendance_records ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage attendance_records" ON public.attendance_records;
CREATE POLICY "Admins manage attendance_records"
  ON public.attendance_records FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = attendance_records.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── lessons ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage lessons" ON public.lessons;
CREATE POLICY "Admins manage lessons"
  ON public.lessons FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = lessons.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── lesson_materials ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage lesson_materials" ON public.lesson_materials;
CREATE POLICY "Admins manage lesson_materials"
  ON public.lesson_materials FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.classrooms c ON c.id = l.classroom_id
      WHERE l.id = lesson_materials.lesson_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.classrooms c ON c.id = l.classroom_id
      WHERE l.id = lesson_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── curriculums ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage curriculums" ON public.curriculums;
CREATE POLICY "Admins manage curriculums"
  ON public.curriculums FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND (
      EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = curriculums.classroom_id AND c.hub_id = public.get_my_hub_id())
      OR EXISTS (
        SELECT 1 FROM public.cohorts co
        JOIN public.classrooms c ON c.id = co.classroom_id
        WHERE co.id = curriculums.cohort_id AND c.hub_id = public.get_my_hub_id()
      )
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND (
      EXISTS (SELECT 1 FROM public.classrooms c WHERE c.id = classroom_id AND c.hub_id = public.get_my_hub_id())
      OR EXISTS (
        SELECT 1 FROM public.cohorts co
        JOIN public.classrooms c ON c.id = co.classroom_id
        WHERE co.id = cohort_id AND c.hub_id = public.get_my_hub_id()
      )
    )
  );

-- ── curriculum_weeks ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage curriculum_weeks" ON public.curriculum_weeks;
CREATE POLICY "Admins manage curriculum_weeks"
  ON public.curriculum_weeks FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.curriculums cur
      JOIN public.classrooms c ON c.id = COALESCE(cur.classroom_id, (
        SELECT co.classroom_id FROM public.cohorts co WHERE co.id = cur.cohort_id
      ))
      WHERE cur.id = curriculum_weeks.curriculum_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.curriculums cur
      JOIN public.classrooms c ON c.id = COALESCE(cur.classroom_id, (
        SELECT co.classroom_id FROM public.cohorts co WHERE co.id = cur.cohort_id
      ))
      WHERE cur.id = curriculum_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── curriculum_lessons ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage curriculum_lessons" ON public.curriculum_lessons;
CREATE POLICY "Admins manage curriculum_lessons"
  ON public.curriculum_lessons FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.curriculum_weeks cw
      JOIN public.curriculums cur ON cur.id = cw.curriculum_id
      JOIN public.classrooms c ON c.id = COALESCE(cur.classroom_id, (
        SELECT co.classroom_id FROM public.cohorts co WHERE co.id = cur.cohort_id
      ))
      WHERE cw.id = curriculum_lessons.curriculum_week_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.curriculum_weeks cw
      JOIN public.curriculums cur ON cur.id = cw.curriculum_id
      JOIN public.classrooms c ON c.id = COALESCE(cur.classroom_id, (
        SELECT co.classroom_id FROM public.cohorts co WHERE co.id = cur.cohort_id
      ))
      WHERE cw.id = curriculum_week_id AND c.hub_id = public.get_my_hub_id()
    )
  );

-- ── pending_payments ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage pending payments" ON public.pending_payments;
CREATE POLICY "Admins manage pending payments"
  ON public.pending_payments FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE e.id = pending_payments.enrollment_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE e.id = enrollment_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- ── field_values ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage field values" ON public.field_values;
CREATE POLICY "Admins manage field values"
  ON public.field_values FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE e.id = field_values.enrollment_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE e.id = enrollment_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- ── invoice_change_requests ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage invoice change requests" ON public.invoice_change_requests;
CREATE POLICY "Admins manage invoice change requests"
  ON public.invoice_change_requests FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = invoice_change_requests.invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE i.id = invoice_id AND p.hub_id = public.get_my_hub_id()
    )
  );

-- ── enrollment_targets (fix is_superadmin bypass) ─────────────────────────────
DROP POLICY IF EXISTS "Admins manage enrollment targets" ON public.enrollment_targets;
CREATE POLICY "Admins manage enrollment targets"
  ON public.enrollment_targets FOR ALL
  USING  ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id())
  WITH CHECK ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id());

-- ── expenses (fix is_superadmin bypass) ──────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage expenses" ON public.expenses;
CREATE POLICY "Admins manage expenses"
  ON public.expenses FOR ALL
  USING  ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id())
  WITH CHECK ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id());

-- ── notifications (fix is_superadmin bypass) ──────────────────────────────────
DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;
CREATE POLICY "Admins manage notifications"
  ON public.notifications FOR ALL
  USING  ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id())
  WITH CHECK ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id());

-- ── organizations (fix is_superadmin bypass) ──────────────────────────────────
DROP POLICY IF EXISTS "Admins manage organizations" ON public.organizations;
CREATE POLICY "Admins manage organizations"
  ON public.organizations FOR ALL
  USING  ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id())
  WITH CHECK ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id());
