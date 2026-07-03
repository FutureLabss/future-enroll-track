-- Per-student grades for a presentation. There is no student "submission"
-- step (the presentation happens live in the session) — staff grade
-- directly, upserting one row per (presentation, student).

CREATE TABLE IF NOT EXISTS public.presentation_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid REFERENCES public.presentations(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score int,
  feedback text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','graded')),
  graded_by uuid REFERENCES auth.users(id),
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(presentation_id, student_id)
);

ALTER TABLE public.presentation_grades ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_presentation_grades_updated_at BEFORE UPDATE ON public.presentation_grades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins manage presentation_grades"
  ON public.presentation_grades FOR ALL
  USING (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.presentations p
      WHERE p.id = presentation_grades.presentation_id
        AND public.get_classroom_hub_id(p.classroom_id) = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.presentations p
      WHERE p.id = presentation_id
        AND public.get_classroom_hub_id(p.classroom_id) = public.get_my_hub_id()
    )
  );

CREATE POLICY "Teaching staff grade presentations"
  ON public.presentation_grades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.presentations p
      JOIN public.classroom_staff cs ON cs.classroom_id = p.classroom_id
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE p.id = presentation_grades.presentation_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_assignments = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.presentations p
      JOIN public.classroom_staff cs ON cs.classroom_id = p.classroom_id
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE p.id = presentation_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_assignments = true
    )
  );

CREATE POLICY "Students view own presentation grade"
  ON public.presentation_grades FOR SELECT
  USING (student_id = auth.uid());
