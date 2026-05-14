-- =====================================================================
-- MIGRATION: Classroom Foundation
-- Tables: classrooms, classroom_staff, classroom_permissions,
--         staff_invitations, classroom_students, cohort extensions
-- =====================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- Extend app_role enum to include 'staff'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- =====================================================================
-- 1. Classrooms
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  location text,
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  attendance_radius_metres int NOT NULL DEFAULT 100,
  geofencing_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_classrooms_updated_at BEFORE UPDATE ON public.classrooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 2. Classroom Staff (assignment + type)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.classroom_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id),           -- linked auth user (set on invitation acceptance)
  staff_type text NOT NULL DEFAULT 'non_teaching'
    CHECK (staff_type IN ('teaching','non_teaching')),
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  UNIQUE(classroom_id, staff_id)
);
ALTER TABLE public.classroom_staff ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 3. Classroom Students
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.classroom_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(classroom_id, student_id)
);
ALTER TABLE public.classroom_students ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 4. Classroom Policies (NOW that tables exist)
-- =====================================================================
CREATE POLICY "Admins manage classrooms" ON public.classrooms FOR ALL USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff view assigned classrooms" ON public.classrooms FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.classroom_staff cs
    WHERE cs.classroom_id = classrooms.id
      AND cs.user_id = auth.uid()
      AND cs.status = 'active'
  )
);
CREATE POLICY "Students view enrolled classrooms" ON public.classrooms FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.classroom_students cs
    WHERE cs.classroom_id = classrooms.id
      AND cs.student_id = auth.uid()
  )
);

CREATE POLICY "Admins manage classroom_staff" ON public.classroom_staff FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff view own assignments" ON public.classroom_staff FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage classroom_students" ON public.classroom_students FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff view classroom students" ON public.classroom_students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      WHERE cs.classroom_id = classroom_students.classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );
CREATE POLICY "Students view own record" ON public.classroom_students FOR SELECT
  USING (student_id = auth.uid());

-- =====================================================================
-- 5. Classroom Permissions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.classroom_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_staff_id uuid REFERENCES public.classroom_staff(id) ON DELETE CASCADE NOT NULL UNIQUE,
  can_create_lessons boolean NOT NULL DEFAULT false,
  can_edit_cohorts   boolean NOT NULL DEFAULT false,
  can_schedule       boolean NOT NULL DEFAULT false,
  can_create_assignments boolean NOT NULL DEFAULT false,
  can_start_attendance   boolean NOT NULL DEFAULT false,
  can_view_students      boolean NOT NULL DEFAULT true
);
ALTER TABLE public.classroom_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage permissions" ON public.classroom_permissions FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff view own permissions" ON public.classroom_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      WHERE cs.id = classroom_permissions.classroom_staff_id
        AND cs.user_id = auth.uid()
    )
  );

-- =====================================================================
-- 6. Staff Invitations
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE NOT NULL,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE NOT NULL,
  staff_type text NOT NULL CHECK (staff_type IN ('teaching','non_teaching')),
  invited_by uuid REFERENCES auth.users(id),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage invitations" ON public.staff_invitations FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Anyone can read invitation by token" ON public.staff_invitations FOR SELECT
  USING (true);   -- token is secret; read needed for acceptance flow

-- =====================================================================
-- 7. Extend cohorts: add classroom_id, status
-- =====================================================================
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS classroom_id uuid REFERENCES public.classrooms(id),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','active','completed','archived'));

-- =====================================================================
-- 8. Cohort Students
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.cohort_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','dropped')),
  UNIQUE(cohort_id, student_id)
);
ALTER TABLE public.cohort_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage cohort_students" ON public.cohort_students FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Staff view cohort students" ON public.cohort_students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cohorts c
      JOIN public.classroom_staff cs ON cs.classroom_id = c.classroom_id
      WHERE c.id = cohort_students.cohort_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
    )
  );
CREATE POLICY "Students view own cohort record" ON public.cohort_students FOR SELECT
  USING (student_id = auth.uid());

-- =====================================================================
-- 9. RPC: assign_staff_to_classroom
-- =====================================================================
CREATE OR REPLACE FUNCTION public.assign_staff_to_classroom(
  p_classroom_id uuid,
  p_staff_id uuid,
  p_staff_type text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _cs_id uuid;
  _inv_id uuid;
  _is_teaching boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can assign staff to classrooms';
  END IF;

  _is_teaching := (p_staff_type = 'teaching');

  INSERT INTO public.classroom_staff(classroom_id, staff_id, staff_type, assigned_by)
  VALUES (p_classroom_id, p_staff_id, p_staff_type, auth.uid())
  ON CONFLICT (classroom_id, staff_id)
    DO UPDATE SET staff_type = p_staff_type, status = 'active', assigned_by = auth.uid()
  RETURNING id INTO _cs_id;

  INSERT INTO public.classroom_permissions(
    classroom_staff_id,
    can_create_lessons, can_edit_cohorts, can_schedule,
    can_create_assignments, can_start_attendance, can_view_students
  ) VALUES (
    _cs_id,
    _is_teaching, _is_teaching, _is_teaching,
    _is_teaching, _is_teaching, true
  )
  ON CONFLICT (classroom_staff_id)
    DO UPDATE SET
      can_create_lessons    = _is_teaching,
      can_edit_cohorts      = _is_teaching,
      can_schedule          = _is_teaching,
      can_create_assignments = _is_teaching,
      can_start_attendance  = _is_teaching;

  INSERT INTO public.staff_invitations(staff_id, classroom_id, staff_type, invited_by)
  VALUES (p_staff_id, p_classroom_id, p_staff_type, auth.uid())
  RETURNING id INTO _inv_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'assign_staff', 'classroom', p_classroom_id,
          jsonb_build_object('staff_id', p_staff_id, 'staff_type', p_staff_type, 'invitation_id', _inv_id));

  RETURN _inv_id;
END;
$$;

-- =====================================================================
-- 10. RPC: accept_staff_invitation
-- =====================================================================
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(
  p_token text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _inv public.staff_invitations%ROWTYPE;
  _cs  public.classroom_staff%ROWTYPE;
BEGIN
  SELECT * INTO _inv FROM public.staff_invitations WHERE token = p_token;

  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invalid invitation token'; END IF;
  IF _inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation already %', _inv.status; END IF;
  IF _inv.expires_at < now() THEN
    UPDATE public.staff_invitations SET status = 'expired' WHERE id = _inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Link user to classroom_staff row
  UPDATE public.classroom_staff
     SET user_id = p_user_id, status = 'active'
   WHERE classroom_id = _inv.classroom_id AND staff_id = _inv.staff_id
  RETURNING * INTO _cs;

  -- Ensure staff role
  INSERT INTO public.user_roles(user_id, role)
  VALUES (p_user_id, 'staff'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Mark accepted
  UPDATE public.staff_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE id = _inv.id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (p_user_id, 'accept_invitation', 'staff_invitation', _inv.id,
          jsonb_build_object('classroom_id', _inv.classroom_id));

  RETURN jsonb_build_object(
    'classroom_id', _inv.classroom_id,
    'staff_type', _inv.staff_type,
    'classroom_staff_id', _cs.id
  );
END;
$$;

-- =====================================================================
-- 11. RPC: auto_enroll_student_classroom
-- =====================================================================
CREATE OR REPLACE FUNCTION public.auto_enroll_student_classroom(p_enrollment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _e   public.enrollments%ROWTYPE;
  _cls public.classrooms%ROWTYPE;
  _coh public.cohorts%ROWTYPE;
BEGIN
  SELECT * INTO _e FROM public.enrollments WHERE id = p_enrollment_id;
  IF _e.id IS NULL OR _e.user_id IS NULL THEN RETURN; END IF;

  -- Find classroom linked to program
  SELECT * INTO _cls FROM public.classrooms
   WHERE program_id = _e.program_id AND status = 'active'
   LIMIT 1;
  IF _cls.id IS NULL THEN RETURN; END IF;

  -- Add to classroom
  INSERT INTO public.classroom_students(classroom_id, student_id, enrollment_id)
  VALUES (_cls.id, _e.user_id, p_enrollment_id)
  ON CONFLICT DO NOTHING;

  -- Find current active cohort
  SELECT * INTO _coh FROM public.cohorts
   WHERE classroom_id = _cls.id AND status = 'active'
   ORDER BY start_date DESC LIMIT 1;
  IF _coh.id IS NULL THEN RETURN; END IF;

  INSERT INTO public.cohort_students(cohort_id, student_id, enrollment_id)
  VALUES (_coh.id, _e.user_id, p_enrollment_id)
  ON CONFLICT DO NOTHING;
END;
$$;
