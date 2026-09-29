-- Presentations: ad hoc cohort events (scheduled by teaching staff after a
-- major project) that get graded per student, same as assignments.
-- Each presentation owns exactly one `schedules` row so it shows up in the
-- existing classroom/cohort schedule views and notification pipeline for free.

CREATE TABLE IF NOT EXISTS public.presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE CASCADE NOT NULL,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE CASCADE NOT NULL UNIQUE,
  title text NOT NULL,
  instructions text,
  max_score int NOT NULL DEFAULT 100,
  pass_score int NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','completed')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_presentations_updated_at BEFORE UPDATE ON public.presentations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Hub-scoped admin management (superadmin bypass kept as its own OR branch,
-- per the fix in 20260701000002 — hub check must not AND against superadmin).
CREATE POLICY "Admins manage presentations"
  ON public.presentations FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.get_classroom_hub_id(classroom_id) = public.get_my_hub_id()
  );

-- Teaching staff (same permission flag assignments already use) can create,
-- edit, publish and delete presentations in their own classroom.
CREATE POLICY "Teaching staff manage classroom presentations"
  ON public.presentations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = presentations.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_assignments = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = presentations.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_assignments = true
    )
  );

-- Any active classroom staff (regardless of permission flags) can view
-- presentations in their own classroom — mirrors the assignments fix in
-- 20260617000001 so grading-roster lookups don't get blocked.
CREATE POLICY "Classroom staff view presentations"
  ON public.presentations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      WHERE cs.classroom_id = presentations.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );

-- Students see published/completed presentations for cohorts they belong to.
CREATE POLICY "Students view published presentations in their cohort"
  ON public.presentations FOR SELECT
  USING (
    status IN ('published','completed')
    AND EXISTS (
      SELECT 1 FROM public.cohort_students cst
      WHERE cst.cohort_id = presentations.cohort_id AND cst.student_id = auth.uid()
    )
  );
