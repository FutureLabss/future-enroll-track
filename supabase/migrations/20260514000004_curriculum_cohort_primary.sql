-- Curriculum is now tied to cohort as the primary unit.
-- classroom_id becomes nullable so a curriculum can exist without a direct classroom link
-- (the classroom is reachable via cohort.classroom_id).
ALTER TABLE public.curriculums ALTER COLUMN classroom_id DROP NOT NULL;

-- Update staff RLS to resolve classroom via cohort when classroom_id is null
DROP POLICY IF EXISTS "Teaching staff manage own classroom curriculums" ON public.curriculums;
CREATE POLICY "Teaching staff manage own classroom curriculums" ON public.curriculums FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      JOIN public.cohorts coh ON coh.id = curriculums.cohort_id
      WHERE cs.classroom_id = COALESCE(curriculums.classroom_id, coh.classroom_id)
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_lessons = true
    )
  );

DROP POLICY IF EXISTS "Staff & students view curriculums" ON public.curriculums;
CREATE POLICY "Staff & students view curriculums" ON public.curriculums FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cohorts coh
      JOIN public.classroom_staff cs ON cs.classroom_id = coh.classroom_id
      WHERE coh.id = curriculums.cohort_id AND cs.user_id = auth.uid() AND cs.status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.cohorts coh
      JOIN public.classroom_students cst ON cst.classroom_id = coh.classroom_id
      WHERE coh.id = curriculums.cohort_id AND cst.student_id = auth.uid()
    )
  );

-- Update curriculum_weeks RLS to also route via cohort
DROP POLICY IF EXISTS "Teaching staff manage curriculum_weeks" ON public.curriculum_weeks;
CREATE POLICY "Teaching staff manage curriculum_weeks" ON public.curriculum_weeks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.curriculums cur
      JOIN public.cohorts coh ON coh.id = cur.cohort_id
      JOIN public.classroom_staff cs ON cs.classroom_id = COALESCE(cur.classroom_id, coh.classroom_id)
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cur.id = curriculum_weeks.curriculum_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_lessons = true
    )
  );
