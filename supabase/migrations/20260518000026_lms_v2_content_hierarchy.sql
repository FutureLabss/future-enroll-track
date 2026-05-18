-- LMS v2.0 Content Hierarchy
-- Renames old lessons (schedule-style) to old_lessons.
-- Adds: curricula → tracks → modules → units → lessons (content) → schedules (time slots).

-- ── Step 1: Rename old lessons table ──────────────────────────────────────────
-- All FK constraints on lessons.id automatically point to old_lessons after rename.
ALTER TABLE public.lessons RENAME TO old_lessons;

-- ── Step 2: curricula ─────────────────────────────────────────────────────────
CREATE TABLE public.curricula (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.curricula ENABLE ROW LEVEL SECURITY;

-- ── Step 3: tracks ────────────────────────────────────────────────────────────
CREATE TABLE public.tracks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id uuid NOT NULL REFERENCES public.curricula(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  order_index  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

-- ── Step 4: modules ───────────────────────────────────────────────────────────
CREATE TABLE public.modules (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id  uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  title     text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

-- ── Step 5: units ─────────────────────────────────────────────────────────────
CREATE TABLE public.units (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  title     text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- ── Step 6: lessons (content plan, not schedule) ──────────────────────────────
CREATE TABLE public.lessons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text,
  objectives  text,
  resources   jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- ── Step 7: schedules (time slot that delivers a lesson to a cohort) ──────────
CREATE TABLE public.schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id      uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  cohort_id      uuid REFERENCES public.cohorts(id) ON DELETE CASCADE,
  classroom_id   uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  instructor_id  uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  start_time     time NOT NULL,
  end_time       time NOT NULL,
  location       text,
  meeting_link   text,
  status         text NOT NULL DEFAULT 'scheduled',
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedules_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- ── RLS helper: is user a staff member of this classroom? ─────────────────────
-- curricula.classroom_id is the anchor for all content RLS below.

-- curricula policies
CREATE POLICY "Superadmin full access on curricula"
  ON public.curricula FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Admins manage curricula in their hub"
  ON public.curricula FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = curricula.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = curricula.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

CREATE POLICY "Staff manage curricula in their classroom"
  ON public.curricula FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE cs.classroom_id = curricula.classroom_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE cs.classroom_id = curricula.classroom_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Students read curricula for their programs"
  ON public.curricula FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classrooms c
      JOIN public.enrollments e ON e.program_id = c.program_id
      WHERE c.id = curricula.classroom_id AND e.user_id = auth.uid()
        AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
    )
  );

-- tracks policies (join up through curricula → classroom)
CREATE POLICY "Superadmin full access on tracks"
  ON public.tracks FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Admins manage tracks in their hub"
  ON public.tracks FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.curricula cu
      JOIN public.classrooms c ON c.id = cu.classroom_id
      WHERE cu.id = tracks.curriculum_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.curricula cu
      JOIN public.classrooms c ON c.id = cu.classroom_id
      WHERE cu.id = tracks.curriculum_id AND c.hub_id = public.get_my_hub_id()
    )
  );

CREATE POLICY "Staff manage tracks in their classroom"
  ON public.tracks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.curricula cu
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE cu.id = tracks.curriculum_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.curricula cu
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE cu.id = tracks.curriculum_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Students read tracks for their programs"
  ON public.tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.curricula cu
      JOIN public.classrooms cl ON cl.id = cu.classroom_id
      JOIN public.enrollments e ON e.program_id = cl.program_id
      WHERE cu.id = tracks.curriculum_id AND e.user_id = auth.uid()
        AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
    )
  );

-- modules policies
CREATE POLICY "Superadmin full access on modules"
  ON public.modules FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Admins manage modules in their hub"
  ON public.modules FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.tracks t
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms c ON c.id = cu.classroom_id
      WHERE t.id = modules.track_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.tracks t
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms c ON c.id = cu.classroom_id
      WHERE t.id = modules.track_id AND c.hub_id = public.get_my_hub_id()
    )
  );

CREATE POLICY "Staff manage modules in their classroom"
  ON public.modules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tracks t
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE t.id = modules.track_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tracks t
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE t.id = modules.track_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Students read modules for their programs"
  ON public.modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracks t
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms cl ON cl.id = cu.classroom_id
      JOIN public.enrollments e ON e.program_id = cl.program_id
      WHERE t.id = modules.track_id AND e.user_id = auth.uid()
        AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
    )
  );

-- units policies
CREATE POLICY "Superadmin full access on units"
  ON public.units FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Admins manage units in their hub"
  ON public.units FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms c ON c.id = cu.classroom_id
      WHERE m.id = units.module_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms c ON c.id = cu.classroom_id
      WHERE m.id = units.module_id AND c.hub_id = public.get_my_hub_id()
    )
  );

CREATE POLICY "Staff manage units in their classroom"
  ON public.units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE m.id = units.module_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE m.id = units.module_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Students read units for their programs"
  ON public.units FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms cl ON cl.id = cu.classroom_id
      JOIN public.enrollments e ON e.program_id = cl.program_id
      WHERE m.id = units.module_id AND e.user_id = auth.uid()
        AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
    )
  );

-- lessons policies
CREATE POLICY "Superadmin full access on lessons"
  ON public.lessons FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Admins manage lessons in their hub"
  ON public.lessons FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.modules m ON m.id = u.module_id
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms c ON c.id = cu.classroom_id
      WHERE u.id = lessons.unit_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.modules m ON m.id = u.module_id
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms c ON c.id = cu.classroom_id
      WHERE u.id = lessons.unit_id AND c.hub_id = public.get_my_hub_id()
    )
  );

CREATE POLICY "Staff manage lessons in their classroom"
  ON public.lessons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.modules m ON m.id = u.module_id
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE u.id = lessons.unit_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.modules m ON m.id = u.module_id
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classroom_staff cs ON cs.classroom_id = cu.classroom_id
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE u.id = lessons.unit_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Students read lessons for their programs"
  ON public.lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      JOIN public.modules m ON m.id = u.module_id
      JOIN public.tracks t ON t.id = m.track_id
      JOIN public.curricula cu ON cu.id = t.curriculum_id
      JOIN public.classrooms cl ON cl.id = cu.classroom_id
      JOIN public.enrollments e ON e.program_id = cl.program_id
      WHERE u.id = lessons.unit_id AND e.user_id = auth.uid()
        AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
    )
  );

-- schedules policies
CREATE POLICY "Superadmin full access on schedules"
  ON public.schedules FOR ALL
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Admins manage schedules in their hub"
  ON public.schedules FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = schedules.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = schedules.classroom_id AND c.hub_id = public.get_my_hub_id()
    )
  );

CREATE POLICY "Staff manage schedules in their classroom"
  ON public.schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE cs.classroom_id = schedules.classroom_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.staff s ON s.id = cs.staff_id
      WHERE cs.classroom_id = schedules.classroom_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Students read their schedules"
  ON public.schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cohort_students cst
      WHERE cst.cohort_id = schedules.cohort_id AND cst.student_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.classrooms cl
      JOIN public.enrollments e ON e.program_id = cl.program_id
      WHERE cl.id = schedules.classroom_id AND e.user_id = auth.uid()
        AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
    )
  );
