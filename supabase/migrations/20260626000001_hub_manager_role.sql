-- Add 'manager' hub_role for users like CEO and training manager who need
-- to see all classrooms and invite teachers without full admin access.

-- 1. Extend the hub_role constraint
ALTER TABLE public.hub_members
  DROP CONSTRAINT IF EXISTS hub_members_hub_role_check;
ALTER TABLE public.hub_members
  ADD CONSTRAINT hub_members_hub_role_check
  CHECK (hub_role IN ('owner', 'admin', 'member', 'manager'));

ALTER TABLE public.hub_invitations
  DROP CONSTRAINT IF EXISTS hub_invitations_hub_role_check;
ALTER TABLE public.hub_invitations
  ADD CONSTRAINT hub_invitations_hub_role_check
  CHECK (hub_role IN ('owner', 'admin', 'member', 'manager'));

-- 2. Managers can SELECT all classrooms in their hub
CREATE POLICY "Hub managers view all hub classrooms"
  ON public.classrooms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.user_id = auth.uid()
        AND hm.hub_id = classrooms.hub_id
        AND hm.hub_role = 'manager'
    )
  );

-- 3. Managers can SELECT classroom_staff records in their hub
CREATE POLICY "Hub managers view classroom staff"
  ON public.classroom_staff FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.classrooms cl
      JOIN public.hub_members hm ON hm.hub_id = cl.hub_id
      WHERE cl.id = classroom_staff.classroom_id
        AND hm.user_id = auth.uid()
        AND hm.hub_role = 'manager'
    )
  );

-- 4. Managers can SELECT classroom_permissions (needed to render staff list)
CREATE POLICY "Hub managers view classroom permissions"
  ON public.classroom_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.classroom_staff cs
      JOIN public.classrooms cl ON cl.id = cs.classroom_id
      JOIN public.hub_members hm ON hm.hub_id = cl.hub_id
      WHERE cs.id = classroom_permissions.classroom_staff_id
        AND hm.user_id = auth.uid()
        AND hm.hub_role = 'manager'
    )
  );

-- 5. Managers can SELECT cohorts in their hub (for classroom detail tabs)
CREATE POLICY "Hub managers view hub cohorts"
  ON public.cohorts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hub_members hm
      WHERE hm.user_id = auth.uid()
        AND hm.hub_id = cohorts.hub_id
        AND hm.hub_role = 'manager'
    )
  );

-- 6. Allow hub managers to call assign_staff_to_classroom
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
  IF NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.hub_members hm
       WHERE hm.user_id = auth.uid() AND hm.hub_role = 'manager'
     ) THEN
    RAISE EXCEPTION 'Only admins or hub managers can assign staff to classrooms';
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
      can_create_lessons     = _is_teaching,
      can_edit_cohorts       = _is_teaching,
      can_schedule           = _is_teaching,
      can_create_assignments = _is_teaching,
      can_start_attendance   = _is_teaching;

  INSERT INTO public.staff_invitations(staff_id, classroom_id, staff_type, invited_by)
  VALUES (p_staff_id, p_classroom_id, p_staff_type, auth.uid())
  RETURNING id INTO _inv_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'assign_staff', 'classroom', p_classroom_id,
          jsonb_build_object('staff_id', p_staff_id, 'staff_type', p_staff_type, 'invitation_id', _inv_id));

  RETURN _inv_id;
END;
$$;
