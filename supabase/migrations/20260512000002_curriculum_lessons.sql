-- =====================================================================
-- MIGRATION: Curriculum, Lessons & Scheduling
-- =====================================================================

-- =====================================================================
-- 1. Curriculums
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.curriculums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE CASCADE NOT NULL,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.curriculums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage curriculums" ON public.curriculums FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Teaching staff manage own classroom curriculums" ON public.curriculums FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = curriculums.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_lessons = true
    )
  );
CREATE POLICY "Staff & students view curriculums" ON public.curriculums FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.classroom_staff cs WHERE cs.classroom_id = curriculums.classroom_id AND cs.user_id = auth.uid() AND cs.status = 'active')
    OR
    EXISTS (SELECT 1 FROM public.classroom_students cs WHERE cs.classroom_id = curriculums.classroom_id AND cs.student_id = auth.uid())
  );
CREATE TRIGGER update_curriculums_updated_at BEFORE UPDATE ON public.curriculums
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 2. Curriculum Weeks
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.curriculum_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id uuid REFERENCES public.curriculums(id) ON DELETE CASCADE NOT NULL,
  week_number int NOT NULL,
  title text NOT NULL,
  objectives text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(curriculum_id, week_number)
);
ALTER TABLE public.curriculum_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage curriculum_weeks" ON public.curriculum_weeks FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Teaching staff manage curriculum_weeks" ON public.curriculum_weeks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.curriculums cur
      JOIN public.classroom_staff cs ON cs.classroom_id = cur.classroom_id
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cur.id = curriculum_weeks.curriculum_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_lessons = true
    )
  );
CREATE POLICY "Others view curriculum_weeks" ON public.curriculum_weeks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.curriculums cur
      JOIN public.classroom_staff cs ON cs.classroom_id = cur.classroom_id
      WHERE cur.id = curriculum_weeks.curriculum_id AND cs.user_id = auth.uid() AND cs.status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.curriculums cur
      JOIN public.classroom_students cst ON cst.classroom_id = cur.classroom_id
      WHERE cur.id = curriculum_weeks.curriculum_id AND cst.student_id = auth.uid()
    )
  );

-- =====================================================================
-- 3. Curriculum Lessons (entries within a week)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.curriculum_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_week_id uuid REFERENCES public.curriculum_weeks(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  objectives text,
  lesson_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.curriculum_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage curriculum_lessons" ON public.curriculum_lessons FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Teaching staff manage curriculum_lessons" ON public.curriculum_lessons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.curriculum_weeks cw
      JOIN public.curriculums cur ON cur.id = cw.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cur.classroom_id
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cw.id = curriculum_lessons.curriculum_week_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_create_lessons = true
    )
  );
CREATE POLICY "Others view curriculum_lessons" ON public.curriculum_lessons FOR SELECT USING (true);
CREATE TRIGGER update_curriculum_lessons_updated_at BEFORE UPDATE ON public.curriculum_lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 4. Lessons (scheduled class events)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  cohort_id uuid REFERENCES public.cohorts(id),
  curriculum_lesson_id uuid REFERENCES public.curriculum_lessons(id),
  title text NOT NULL,
  week_number int,
  tutor_id uuid REFERENCES public.staff(id),
  lesson_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text,
  description text,
  attendance_session_status text NOT NULL DEFAULT 'not_started'
    CHECK (attendance_session_status IN ('not_started','open','closed')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage lessons" ON public.lessons FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Teaching staff manage classroom lessons" ON public.lessons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = lessons.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_schedule = true
    )
  );
CREATE POLICY "Staff view assigned classroom lessons" ON public.lessons FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.classroom_staff cs WHERE cs.classroom_id = lessons.classroom_id AND cs.user_id = auth.uid() AND cs.status = 'active')
  );
CREATE POLICY "Students view classroom lessons" ON public.lessons FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.classroom_students cs WHERE cs.classroom_id = lessons.classroom_id AND cs.student_id = auth.uid())
  );
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 5. Lesson Materials
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.lesson_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  curriculum_lesson_id uuid REFERENCES public.curriculum_lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text,
  material_type text NOT NULL DEFAULT 'file'
    CHECK (material_type IN ('pdf','video','link','image','file')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lesson_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage lesson_materials" ON public.lesson_materials FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Authenticated view lesson_materials" ON public.lesson_materials FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Teaching staff manage lesson_materials" ON public.lesson_materials FOR INSERT
  TO authenticated WITH CHECK (true);
