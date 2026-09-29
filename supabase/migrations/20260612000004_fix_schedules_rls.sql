-- Schedules admin policy joined classrooms directly, triggering RLS recursion (500).
-- Align with assignments: use SECURITY DEFINER hub helper and simpler staff/student checks.

DROP POLICY IF EXISTS "Admins manage schedules in their hub" ON public.schedules;
CREATE POLICY "Admins manage schedules in their hub"
  ON public.schedules FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );

DROP POLICY IF EXISTS "Staff manage schedules in their classroom" ON public.schedules;
CREATE POLICY "Staff manage schedules in their classroom"
  ON public.schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_staff cs
      WHERE cs.classroom_id = schedules.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.classroom_staff cs
      WHERE cs.classroom_id = schedules.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Students read their schedules" ON public.schedules;
CREATE POLICY "Students read their schedules"
  ON public.schedules FOR SELECT
  USING (
    (
      schedules.cohort_id IS NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.classroom_students cs
          WHERE cs.classroom_id = schedules.classroom_id
            AND cs.student_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.cohort_students cst
          JOIN public.cohorts co ON co.id = cst.cohort_id
          WHERE co.classroom_id = schedules.classroom_id
            AND cst.student_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.enrollments e
          JOIN public.classrooms cl ON cl.program_id = e.program_id
          WHERE cl.id = schedules.classroom_id
            AND e.user_id = auth.uid()
            AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
        )
      )
    )
    OR (
      schedules.cohort_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.cohort_students cst
          WHERE cst.cohort_id = schedules.cohort_id
            AND cst.student_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.enrollments e
          JOIN public.classrooms cl ON cl.program_id = e.program_id
          WHERE cl.id = schedules.classroom_id
            AND e.user_id = auth.uid()
            AND e.cohort_id = schedules.cohort_id
            AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
        )
      )
    )
  );
