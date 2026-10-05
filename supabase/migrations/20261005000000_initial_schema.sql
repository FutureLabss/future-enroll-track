


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'student',
    'organization',
    'staff',
    'marketing'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_get_classroom_hub_id"("p_classroom_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT hub_id FROM public.classrooms WHERE id = p_classroom_id;
$$;


ALTER FUNCTION "public"."_get_classroom_hub_id"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_get_hub_id_for_cs"("p_cs_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT cl.hub_id
  FROM public.classroom_staff cs
  JOIN public.classrooms cl ON cl.id = cs.classroom_id
  WHERE cs.id = p_cs_id;
$$;


ALTER FUNCTION "public"."_get_hub_id_for_cs"("p_cs_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_hub_invitation"("p_token" "text", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_inv public.hub_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM public.hub_invitations
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is invalid or has expired';
  END IF;

  INSERT INTO public.hub_members (hub_id, user_id, hub_role, demo_expires_at)
  VALUES (
    v_inv.hub_id,
    p_user_id,
    v_inv.hub_role,
    CASE WHEN v_inv.is_demo THEN now() + interval '1 hour' ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE
    SET hub_id          = v_inv.hub_id,
        hub_role        = v_inv.hub_role,
        demo_expires_at = CASE WHEN v_inv.is_demo THEN now() + interval '1 hour' ELSE NULL END;

  -- Grant the admin app_role so RLS policies using has_role() work correctly.
  -- Only grant for non-demo invitations (demo users get student-level access via has_role check).
  IF NOT v_inv.is_demo THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.hub_invitations SET accepted_at = now() WHERE id = v_inv.id;
END;
$$;


ALTER FUNCTION "public"."accept_hub_invitation"("p_token" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_staff_invitation"("p_token" "text", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."accept_staff_invitation"("p_token" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_marketing_campaign"("p_campaign_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_lead record; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  UPDATE public.marketing_campaigns SET status='active',updated_at=now() WHERE id=p_campaign_id AND hub_id=public.get_my_hub_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  FOR v_lead IN SELECT id FROM public.crm_leads WHERE hub_id=public.get_my_hub_id() LOOP PERFORM public.evaluate_lead_campaigns(v_lead.id); END LOOP;
END $$;


ALTER FUNCTION "public"."activate_marketing_campaign"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_enrollment"("p_enrollment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _full_name text;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can delete enrollments';
  END IF;

  SELECT full_name, email INTO _full_name, _email
  FROM public.enrollments WHERE id = p_enrollment_id;

  IF _full_name IS NULL THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  DELETE FROM public.payments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE enrollment_id = p_enrollment_id);
  DELETE FROM public.installments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE enrollment_id = p_enrollment_id);
  DELETE FROM public.invoices WHERE enrollment_id = p_enrollment_id;
  DELETE FROM public.field_values WHERE enrollment_id = p_enrollment_id;
  DELETE FROM public.notifications WHERE enrollment_id = p_enrollment_id;
  DELETE FROM public.enrollments WHERE id = p_enrollment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'delete', 'enrollment', p_enrollment_id,
          jsonb_build_object('full_name', _full_name, 'email', _email));
END;
$$;


ALTER FUNCTION "public"."admin_delete_enrollment"("p_enrollment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_invoice"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _enrollment_id uuid;
  _invoice_number text;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can delete invoices directly. Use request_invoice_change for approval workflow.';
  END IF;

  SELECT enrollment_id, invoice_number INTO _enrollment_id, _invoice_number
  FROM public.invoices WHERE id = p_invoice_id;
  IF _enrollment_id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.installments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.notifications
    WHERE enrollment_id = _enrollment_id AND message ILIKE '%' || _invoice_number || '%';
  DELETE FROM public.invoices WHERE id = p_invoice_id;
  DELETE FROM public.payments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE enrollment_id = _enrollment_id);
  DELETE FROM public.installments
    WHERE invoice_id IN (SELECT id FROM public.invoices WHERE enrollment_id = _enrollment_id);
  DELETE FROM public.invoices WHERE enrollment_id = _enrollment_id;
  DELETE FROM public.field_values WHERE enrollment_id = _enrollment_id;
  DELETE FROM public.notifications WHERE enrollment_id = _enrollment_id;
  DELETE FROM public.enrollments WHERE id = _enrollment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'delete', 'invoice', p_invoice_id,
          jsonb_build_object('invoice_number', _invoice_number, 'enrollment_id', _enrollment_id, 'cascaded_enrollment', true));
END;
$$;


ALTER FUNCTION "public"."admin_delete_invoice"("p_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_invoice"("p_invoice_id" "uuid", "p_total_amount" numeric, "p_installments" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _enrollment_id uuid;
  _inst jsonb;
  _new_paid numeric := 0;
  _new_total numeric := 0;
  _all_paid boolean;
  _has_any boolean := false;
  _first_paid_at timestamptz;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can edit invoices directly. Use request_invoice_change for approval workflow.';
  END IF;

  SELECT enrollment_id INTO _enrollment_id FROM public.invoices WHERE id = p_invoice_id;
  IF _enrollment_id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  UPDATE public.invoices SET total_amount = p_total_amount, updated_at = now() WHERE id = p_invoice_id;

  -- Snapshot bank evidence before the rows carrying it are deleted.
  CREATE TEMP TABLE _recon_snapshot ON COMMIT DROP AS
  SELECT i.amount,
         i.due_date,
         i.paid_at_actual,
         i.paid_at_source,
         i.bank_transaction_id,
         row_number() OVER (PARTITION BY i.amount, i.due_date ORDER BY i.id) AS dup_rank
  FROM public.installments i
  WHERE i.invoice_id = p_invoice_id
    AND i.status = 'paid'
    AND i.bank_transaction_id IS NOT NULL;

  DELETE FROM public.installments WHERE invoice_id = p_invoice_id;

  IF p_installments IS NOT NULL AND jsonb_typeof(p_installments) = 'array' THEN
    FOR _inst IN SELECT * FROM jsonb_array_elements(p_installments) LOOP
      _has_any := true;
      INSERT INTO public.installments (invoice_id, amount, due_date, status, paid_at)
      VALUES (
        p_invoice_id,
        (_inst->>'amount')::numeric,
        (_inst->>'due_date')::date,
        COALESCE(_inst->>'status','pending'),
        CASE WHEN COALESCE(_inst->>'status','pending') = 'paid'
             THEN COALESCE((_inst->>'paid_at')::timestamptz, now())
             ELSE NULL END
      );
    END LOOP;
  END IF;

  -- Re-attach the snapshot to the rebuilt rows, pairing duplicates off in order.
  WITH rebuilt AS (
    SELECT i.id, i.amount, i.due_date,
           row_number() OVER (PARTITION BY i.amount, i.due_date ORDER BY i.id) AS dup_rank
    FROM public.installments i
    WHERE i.invoice_id = p_invoice_id AND i.status = 'paid'
  )
  UPDATE public.installments tgt
     SET paid_at_actual      = s.paid_at_actual,
         paid_at_source      = s.paid_at_source,
         bank_transaction_id = s.bank_transaction_id,
         -- The bank timestamp is the better answer to "when did this land" than
         -- whatever the form re-submitted, so keep them consistent.
         paid_at             = COALESCE(s.paid_at_actual, tgt.paid_at)
    FROM rebuilt r
    JOIN _recon_snapshot s
      ON s.amount = r.amount AND s.due_date = r.due_date AND s.dup_rank = r.dup_rank
   WHERE tgt.id = r.id;

  DROP TABLE _recon_snapshot;

  SELECT COALESCE(SUM(i.amount), 0) INTO _new_paid
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id AND i.status = 'paid';

  -- Sum across ALL of this enrollment's non-cancelled invoices, same scope
  -- as the amount_paid calc above — an enrollment can have more than one.
  SELECT COALESCE(SUM(inv.total_amount), 0) INTO _new_total
  FROM public.invoices inv
  WHERE inv.enrollment_id = _enrollment_id AND inv.status != 'cancelled';

  -- first_payment_date = earliest paid_at of paid installments.
  SELECT MIN(i.paid_at) INTO _first_paid_at
  FROM public.installments i
  JOIN public.invoices inv ON inv.id = i.invoice_id
  WHERE inv.enrollment_id = _enrollment_id AND i.status = 'paid';

  UPDATE public.enrollments
     SET amount_paid = _new_paid,
         total_amount = _new_total,
         first_payment_date = _first_paid_at,
         updated_at = now()
   WHERE id = _enrollment_id;

  SELECT bool_and(i.status = 'paid') INTO _all_paid FROM public.installments i WHERE i.invoice_id = p_invoice_id;
  IF _has_any AND _all_paid THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = p_invoice_id;
  ELSE
    UPDATE public.invoices SET status = 'active' WHERE id = p_invoice_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'update', 'invoice', p_invoice_id,
          jsonb_build_object('total_amount', p_total_amount,
                             'installment_count', COALESCE(jsonb_array_length(p_installments), 0)));
END;
$$;


ALTER FUNCTION "public"."admin_update_invoice"("p_invoice_id" "uuid", "p_total_amount" numeric, "p_installments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_invoice_change"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r public.invoice_change_requests%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can approve invoice changes';
  END IF;
  SELECT * INTO r FROM public.invoice_change_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request already %', r.status; END IF;

  IF r.action = 'edit' THEN
    PERFORM public.admin_update_invoice(
      r.invoice_id,
      (r.payload->>'total_amount')::numeric,
      r.payload->'installments'
    );
  ELSIF r.action = 'delete' THEN
    PERFORM public.admin_delete_invoice(r.invoice_id);
  END IF;

  UPDATE public.invoice_change_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approve_invoice_change', 'invoice', r.invoice_id,
          jsonb_build_object('request_id', p_request_id, 'change_action', r.action));
END;
$$;


ALTER FUNCTION "public"."approve_invoice_change"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_staff_invoice"("p_id" "uuid", "p_payment_date" "date" DEFAULT NULL::"date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r           public.staff_invoices%ROWTYPE;
  _expense_id uuid;
  _hub_id     uuid;
BEGIN
  -- Correct no-arg form; the (uid) overload is deprecated and inconsistent
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only the superadmin can approve staff invoices';
  END IF;

  SELECT * INTO r FROM public.staff_invoices WHERE id = p_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Staff invoice not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Staff invoice already %', r.status; END IF;

  -- Derive hub from the linked staff record so the expense is always hub-scoped,
  -- even when the superadmin has not switched hub context.
  SELECT hub_id INTO _hub_id FROM public.staff WHERE id = r.staff_id;

  INSERT INTO public.expenses (category, vendor_name, amount, payment_date, payment_method, notes, recorded_by, hub_id)
  VALUES (
    'Staff Reimbursement',
    r.staff_name,
    r.amount,
    COALESCE(p_payment_date, CURRENT_DATE),
    'bank_transfer',
    COALESCE(r.title, '') || COALESCE(' - ' || NULLIF(r.description, ''), '') || ' [staff invoice]',
    auth.uid(),
    _hub_id
  )
  RETURNING id INTO _expense_id;

  UPDATE public.staff_invoices
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), expense_id = _expense_id
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approve_staff_invoice', 'staff_invoice', p_id,
          jsonb_build_object('expense_id', _expense_id, 'amount', r.amount, 'hub_id', _hub_id));

  RETURN _expense_id;
END;
$$;


ALTER FUNCTION "public"."approve_staff_invoice"("p_id" "uuid", "p_payment_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_staff_to_classroom"("p_classroom_id" "uuid", "p_staff_id" "uuid", "p_staff_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."assign_staff_to_classroom"("p_classroom_id" "uuid", "p_staff_id" "uuid", "p_staff_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assignment_classroom_id"("_assignment_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return (select a.classroom_id from public.assignments a where a.id = _assignment_id);
end; $$;


ALTER FUNCTION "public"."assignment_classroom_id"("_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_enroll_on_classroom_program"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only run when program_id is set and has changed (or it's a new row)
  IF NEW.program_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.program_id IS NOT DISTINCT FROM NEW.program_id THEN
    RETURN NEW;
  END IF;

  -- Enroll all active/pending enrolled students in this program
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT NEW.id, e.user_id, e.id
  FROM public.enrollments e
  WHERE e.program_id = NEW.program_id
    AND e.user_id IS NOT NULL
    AND e.enrollment_status IN ('active', 'pending')
  ON CONFLICT DO NOTHING;

  -- Also add them to the active cohort in this classroom (if one exists)
  INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
  SELECT c.id, e.user_id, e.id
  FROM public.cohorts c
  CROSS JOIN public.enrollments e
  WHERE c.classroom_id = NEW.id
    AND c.status = 'active'
    AND e.program_id = NEW.program_id
    AND e.user_id IS NOT NULL
    AND e.enrollment_status IN ('active', 'pending')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_enroll_on_classroom_program"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_enroll_student_classroom"("p_enrollment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."auto_enroll_student_classroom"("p_enrollment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_enroll_student_in_classrooms"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Need both user_id and program_id
  IF NEW.user_id IS NULL OR NEW.program_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if nothing relevant changed
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.enrollment_status IS NOT DISTINCT FROM NEW.enrollment_status THEN
    RETURN NEW;
  END IF;

  -- Only active / pending enrollments get classroom access
  IF NEW.enrollment_status NOT IN ('active', 'pending') THEN
    RETURN NEW;
  END IF;

  -- Add to the classroom for this program (one classroom per program enforced by constraint)
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT cl.id, NEW.user_id, NEW.id
  FROM public.classrooms cl
  WHERE cl.program_id = NEW.program_id
    AND cl.status = 'active'
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_enroll_student_in_classrooms"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_classroom_students_on_classroom_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.program_id IS NULL OR NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT NEW.id, e.user_id, e.id
  FROM public.enrollments e
  WHERE e.program_id = NEW.program_id
    AND e.user_id IS NOT NULL
    AND e.enrollment_status IN ('active', 'pending')
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."backfill_classroom_students_on_classroom_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_crm"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_superadmin()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'marketing'
    );
$$;


ALTER FUNCTION "public"."can_manage_crm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_admin_invite"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can cancel invites';
  END IF;
  DELETE FROM public.pending_admin_invites WHERE LOWER(email) = LOWER(p_email) AND accepted_at IS NULL;
END;
$$;


ALTER FUNCTION "public"."cancel_admin_invite"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_admin_access"("_classroom_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return is_superadmin()
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;


ALTER FUNCTION "public"."classroom_admin_access"("_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_attendance_access"("_classroom_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return is_superadmin()
    or exists (
      select 1 from public.classroom_staff st
      join public.classroom_permissions cp on cp.classroom_staff_id = st.id
      where st.classroom_id = _classroom_id and st.user_id = auth.uid()
        and st.status = 'active' and cp.can_start_attendance = true)
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;


ALTER FUNCTION "public"."classroom_attendance_access"("_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_manage_access"("_classroom_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return is_superadmin()
    or exists (
      select 1 from public.classroom_staff st
      join public.classroom_permissions cp on cp.classroom_staff_id = st.id
      where st.classroom_id = _classroom_id and st.user_id = auth.uid()
        and st.status = 'active' and cp.can_create_assignments = true)
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;


ALTER FUNCTION "public"."classroom_manage_access"("_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_read_access"("_classroom_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return is_superadmin()
    or exists (
      select 1 from public.classroom_students cs
      where cs.classroom_id = _classroom_id and cs.student_id = auth.uid())
    or exists (
      select 1 from public.classroom_staff st
      where st.classroom_id = _classroom_id and st.user_id = auth.uid()
        and st.status = 'active')
    or exists (
      select 1 from public.cohort_students cst
      join public.cohorts co on co.id = cst.cohort_id
      where co.classroom_id = _classroom_id and cst.student_id = auth.uid())
    or exists (
      select 1 from public.classrooms cl
      join public.enrollments e on e.program_id = cl.program_id
      where cl.id = _classroom_id and e.user_id = auth.uid()
        and e.enrollment_status not in ('cancelled', 'withdrawn'))
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;


ALTER FUNCTION "public"."classroom_read_access"("_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classroom_staff_access"("_classroom_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return is_superadmin()
    or exists (
      select 1 from public.classroom_staff st
      where st.classroom_id = _classroom_id and st.user_id = auth.uid()
        and st.status = 'active')
    or (has_role(auth.uid(), 'admin'::app_role) and exists (
      select 1 from public.classrooms c
      where c.id = _classroom_id and c.hub_id = get_my_hub_id()));
end; $$;


ALTER FUNCTION "public"."classroom_staff_access"("_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_curriculum_to_cohort"("p_source_curriculum_id" "uuid", "p_target_cohort_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_src              public.curriculums%ROWTYPE;
  v_new_cur_id       uuid;
  v_target_cls_id    uuid;
  v_week             public.curriculum_weeks%ROWTYPE;
  v_lesson           public.curriculum_lessons%ROWTYPE;
  v_new_week_id      uuid;
  v_new_lesson_id    uuid;
BEGIN
  -- Fetch source curriculum
  SELECT * INTO v_src FROM public.curriculums WHERE id = p_source_curriculum_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source curriculum not found';
  END IF;

  -- Derive target classroom from target cohort
  SELECT classroom_id INTO v_target_cls_id
  FROM public.cohorts WHERE id = p_target_cohort_id;

  -- Replace any existing curriculum for the target cohort
  DELETE FROM public.curriculums WHERE cohort_id = p_target_cohort_id;

  -- Create new curriculum
  INSERT INTO public.curriculums (cohort_id, classroom_id, title)
  VALUES (p_target_cohort_id, v_target_cls_id, v_src.title)
  RETURNING id INTO v_new_cur_id;

  -- Copy weeks
  FOR v_week IN
    SELECT * FROM public.curriculum_weeks
    WHERE curriculum_id = p_source_curriculum_id
    ORDER BY week_number
  LOOP
    INSERT INTO public.curriculum_weeks (curriculum_id, week_number, title, objectives)
    VALUES (v_new_cur_id, v_week.week_number, v_week.title, v_week.objectives)
    RETURNING id INTO v_new_week_id;

    -- Copy lessons in that week
    FOR v_lesson IN
      SELECT * FROM public.curriculum_lessons
      WHERE curriculum_week_id = v_week.id
      ORDER BY lesson_order
    LOOP
      INSERT INTO public.curriculum_lessons (curriculum_week_id, title, objectives, lesson_order)
      VALUES (v_new_week_id, v_lesson.title, v_lesson.objectives, v_lesson.lesson_order)
      RETURNING id INTO v_new_lesson_id;

      -- Copy material metadata (file URLs are shared; files themselves are not duplicated)
      INSERT INTO public.lesson_materials (curriculum_lesson_id, title, material_type, file_url)
      SELECT v_new_lesson_id, title, material_type, file_url
      FROM public.lesson_materials
      WHERE curriculum_lesson_id = v_lesson.id;
    END LOOP;
  END LOOP;

  RETURN v_new_cur_id;
END;
$$;


ALTER FUNCTION "public"."clone_curriculum_to_cohort"("p_source_curriculum_id" "uuid", "p_target_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_curriculum_v2"("p_source_curriculum_id" "uuid", "p_target_classroom_id" "uuid", "p_title" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_source public.curricula%ROWTYPE;
  v_new_curriculum_id uuid;
  v_track public.tracks%ROWTYPE;
  v_module public.modules%ROWTYPE;
  v_unit public.units%ROWTYPE;
  v_lesson public.lessons%ROWTYPE;
  v_new_track_id uuid;
  v_new_module_id uuid;
  v_new_unit_id uuid;
BEGIN
  SELECT * INTO v_source
  FROM public.curricula
  WHERE id = p_source_curriculum_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source curriculum not found';
  END IF;

  INSERT INTO public.curricula (classroom_id, title, description, created_by)
  VALUES (
    p_target_classroom_id,
    COALESCE(NULLIF(trim(p_title), ''), v_source.title || ' Copy'),
    v_source.description,
    auth.uid()
  )
  RETURNING id INTO v_new_curriculum_id;

  FOR v_track IN
    SELECT * FROM public.tracks
    WHERE curriculum_id = p_source_curriculum_id
    ORDER BY order_index, created_at
  LOOP
    INSERT INTO public.tracks (curriculum_id, title, description, order_index)
    VALUES (v_new_curriculum_id, v_track.title, v_track.description, v_track.order_index)
    RETURNING id INTO v_new_track_id;

    FOR v_module IN
      SELECT * FROM public.modules
      WHERE track_id = v_track.id
      ORDER BY order_index, created_at
    LOOP
      INSERT INTO public.modules (track_id, title, description, order_index)
      VALUES (v_new_track_id, v_module.title, v_module.description, v_module.order_index)
      RETURNING id INTO v_new_module_id;

      FOR v_unit IN
        SELECT * FROM public.units
        WHERE module_id = v_module.id
        ORDER BY order_index, created_at
      LOOP
        INSERT INTO public.units (module_id, title, description, order_index)
        VALUES (v_new_module_id, v_unit.title, v_unit.description, v_unit.order_index)
        RETURNING id INTO v_new_unit_id;

        FOR v_lesson IN
          SELECT * FROM public.lessons
          WHERE unit_id = v_unit.id
          ORDER BY order_index, created_at
        LOOP
          INSERT INTO public.lessons (
            unit_id,
            title,
            content,
            objectives,
            resources,
            video_url,
            external_link,
            order_index,
            created_by
          )
          VALUES (
            v_new_unit_id,
            v_lesson.title,
            v_lesson.content,
            v_lesson.objectives,
            v_lesson.resources,
            v_lesson.video_url,
            v_lesson.external_link,
            v_lesson.order_index,
            auth.uid()
          );
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_new_curriculum_id;
END;
$$;


ALTER FUNCTION "public"."clone_curriculum_v2"("p_source_curriculum_id" "uuid", "p_target_classroom_id" "uuid", "p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cohort_is_mine"("_cohort_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return exists (
      select 1 from public.cohort_students cst
      where cst.cohort_id = _cohort_id and cst.student_id = auth.uid())
    or exists (
      select 1 from public.enrollments e
      where e.cohort_id = _cohort_id and e.user_id = auth.uid()
        and e.enrollment_status not in ('cancelled', 'withdrawn'));
end; $$;


ALTER FUNCTION "public"."cohort_is_mine"("_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_lead_follow_up"("p_follow_up_id" "uuid", "p_outcome" "text" DEFAULT NULL::"text", "p_next_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_task public.lead_follow_ups; v_next uuid; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT * INTO v_task FROM public.lead_follow_ups WHERE id=p_follow_up_id AND hub_id=public.get_my_hub_id() FOR UPDATE;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'Follow-up not found'; END IF;
  IF v_task.status <> 'pending' THEN RAISE EXCEPTION 'Follow-up is already closed'; END IF;
  UPDATE public.lead_follow_ups SET status='completed',completed_at=now(),notes=COALESCE(NULLIF(trim(p_outcome),''),notes),updated_at=now() WHERE id=v_task.id;
  INSERT INTO public.lead_activities(hub_id,lead_id,activity_type,title,details,created_by)
  VALUES(v_task.hub_id,v_task.lead_id,'follow_up_completed','Follow-up completed',jsonb_build_object('follow_up_id',v_task.id,'outcome',p_outcome),auth.uid());
  PERFORM public.record_lead_score_event(v_task.lead_id,'follow_up_completed',v_task.id::text);
  IF p_next_due_at IS NOT NULL THEN
    INSERT INTO public.lead_follow_ups(hub_id,lead_id,owner_id,title,due_at) VALUES(v_task.hub_id,v_task.lead_id,v_task.owner_id,'Lead follow-up',p_next_due_at) RETURNING id INTO v_next;
    INSERT INTO public.lead_activities(hub_id,lead_id,activity_type,title,details,created_by) VALUES(v_task.hub_id,v_task.lead_id,'follow_up_scheduled','Next follow-up scheduled',jsonb_build_object('follow_up_id',v_next,'due_at',p_next_due_at),auth.uid());
  END IF;
  UPDATE public.crm_leads SET next_follow_up_at=(SELECT min(due_at) FROM public.lead_follow_ups WHERE lead_id=v_task.lead_id AND status='pending'),updated_at=now() WHERE id=v_task.lead_id;
END $$;


ALTER FUNCTION "public"."complete_lead_follow_up"("p_follow_up_id" "uuid", "p_outcome" "text", "p_next_due_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_cohort_graduation"("p_cohort_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _cohort public.cohorts%ROWTYPE;
BEGIN
  SELECT * INTO _cohort FROM public.cohorts WHERE id = p_cohort_id;
  IF _cohort.id IS NULL THEN
    RAISE EXCEPTION 'Cohort not found';
  END IF;
  IF _cohort.end_date IS NULL OR _cohort.end_date > now() THEN
    RAISE EXCEPTION 'Cohort has not ended yet';
  END IF;

  -- auth.uid() IS NULL covers the pg_cron sweep (no JWT context); interactive
  -- callers must be a hub admin or superadmin.
  IF auth.uid() IS NOT NULL
     AND NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role))
  THEN
    RAISE EXCEPTION 'You do not have permission to compute graduation for this cohort';
  END IF;

  WITH req_assignments AS (
    SELECT id, pass_score FROM public.assignments
    WHERE cohort_id = p_cohort_id AND status = 'published' AND pass_score IS NOT NULL
  ),
  req_presentations AS (
    SELECT id, pass_score FROM public.presentations
    WHERE cohort_id = p_cohort_id AND status IN ('published','completed')
  ),
  student_status AS (
    SELECT
      cs.id AS cohort_student_id,
      NOT EXISTS (
        SELECT 1 FROM req_assignments ra
        LEFT JOIN public.assignment_submissions asub
          ON asub.assignment_id = ra.id AND asub.student_id = cs.student_id AND asub.status = 'graded'
        WHERE asub.id IS NULL
      ) AS assignments_complete,
      NOT EXISTS (
        SELECT 1 FROM req_assignments ra
        JOIN public.assignment_submissions asub
          ON asub.assignment_id = ra.id AND asub.student_id = cs.student_id AND asub.status = 'graded'
        WHERE asub.score IS NULL OR asub.score < ra.pass_score
      ) AS assignments_passed,
      NOT EXISTS (
        SELECT 1 FROM req_presentations rp
        LEFT JOIN public.presentation_grades pg
          ON pg.presentation_id = rp.id AND pg.student_id = cs.student_id AND pg.status = 'graded'
        WHERE pg.id IS NULL
      ) AS presentations_complete,
      NOT EXISTS (
        SELECT 1 FROM req_presentations rp
        JOIN public.presentation_grades pg
          ON pg.presentation_id = rp.id AND pg.student_id = cs.student_id AND pg.status = 'graded'
        WHERE pg.score IS NULL OR pg.score < rp.pass_score
      ) AS presentations_passed
    FROM public.cohort_students cs
    WHERE cs.cohort_id = p_cohort_id
  )
  UPDATE public.cohort_students target
  SET auto_graduation_status = CASE
    WHEN NOT s.assignments_complete OR NOT s.presentations_complete THEN 'pending'
    WHEN s.assignments_passed AND s.presentations_passed THEN 'graduated'
    ELSE 'not_graduated'
  END
  FROM student_status s
  WHERE target.id = s.cohort_student_id;
END;
$$;


ALTER FUNCTION "public"."compute_cohort_graduation"("p_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_next_recurrence"("_d" "date", "_freq" "text") RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE _freq
    WHEN 'weekly' THEN _d + INTERVAL '1 week'
    WHEN 'yearly' THEN _d + INTERVAL '1 year'
    ELSE _d + INTERVAL '1 month'
  END::date
$$;


ALTER FUNCTION "public"."compute_next_recurrence"("_d" "date", "_freq" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_bank_match"("p_installment_id" "uuid", "p_bank_transaction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE _occurred timestamptz; _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can reconcile payments';
  END IF;

  SELECT b.occurred_at, b.hub_id INTO _occurred, _hub
  FROM public.bank_transactions b WHERE b.id = p_bank_transaction_id;
  IF _occurred IS NULL THEN RAISE EXCEPTION 'Bank transaction not found'; END IF;
  IF _hub <> public.get_my_hub_id() AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Bank transaction belongs to another hub';
  END IF;

  UPDATE public.installments
     SET paid_at_actual      = _occurred,
         paid_at_source      = 'bank_statement',
         bank_transaction_id = p_bank_transaction_id
   WHERE id = p_installment_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'reconcile', 'installment', p_installment_id,
          jsonb_build_object('bank_transaction_id', p_bank_transaction_id,
                             'paid_at_actual', _occurred));
END;
$$;


ALTER FUNCTION "public"."confirm_bank_match"("p_installment_id" "uuid", "p_bank_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_crm_lead"("p_lead_id" "uuid", "p_program_id" "uuid", "p_total_amount" numeric DEFAULT 0) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_lead public.crm_leads; v_enrollment uuid; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT * INTO v_lead FROM public.crm_leads WHERE id = p_lead_id AND hub_id = public.get_my_hub_id() FOR UPDATE;
  IF v_lead.id IS NULL OR v_lead.email IS NULL THEN RAISE EXCEPTION 'Lead with email not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs WHERE id = p_program_id AND hub_id = v_lead.hub_id) THEN RAISE EXCEPTION 'Program not found'; END IF;
  SELECT id INTO v_enrollment FROM public.enrollments WHERE lower(email) = v_lead.normalized_email AND program_id = p_program_id LIMIT 1;
  IF v_enrollment IS NULL THEN
    INSERT INTO public.enrollments(full_name,email,phone,program_id,total_amount,enrollment_status)
    VALUES(v_lead.full_name,v_lead.email,v_lead.phone,p_program_id,p_total_amount,'pending') RETURNING id INTO v_enrollment;
  END IF;
  UPDATE public.crm_leads SET lifecycle_status='registered', enrollment_id=v_enrollment, converted_at=now(), updated_at=now() WHERE id=p_lead_id;
  UPDATE public.marketing_campaign_enrollments SET status='stopped',stop_reason='converted',updated_at=now() WHERE lead_id=p_lead_id AND status IN ('active','paused');
  INSERT INTO public.lead_activities(hub_id,lead_id,activity_type,title,details,created_by) VALUES(v_lead.hub_id,p_lead_id,'conversion','Converted to enrollment',jsonb_build_object('enrollment_id',v_enrollment),auth.uid());
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details,hub_id) VALUES(auth.uid(),'lead_converted','crm_lead',p_lead_id,jsonb_build_object('enrollment_id',v_enrollment),v_lead.hub_id);
  RETURN v_enrollment;
END $$;


ALTER FUNCTION "public"."convert_crm_lead"("p_lead_id" "uuid", "p_program_id" "uuid", "p_total_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_admin_invite"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _existing_user_id uuid;
  _inviter_hub_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can invite admins';
  END IF;

  SELECT id INTO _existing_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);

  IF _existing_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_existing_user_id, 'admin')
    ON CONFLICT DO NOTHING;

    -- Also add to hub_members so RLS data-scoping works
    SELECT hub_id INTO _inviter_hub_id FROM public.hub_members WHERE user_id = auth.uid();
    IF _inviter_hub_id IS NOT NULL THEN
      INSERT INTO public.hub_members (hub_id, user_id, hub_role)
      VALUES (_inviter_hub_id, _existing_user_id, 'admin')
      ON CONFLICT (user_id) DO UPDATE SET hub_id = _inviter_hub_id, hub_role = 'admin';
    END IF;
  ELSE
    INSERT INTO public.pending_admin_invites (email, invited_by)
    VALUES (LOWER(p_email), auth.uid())
    ON CONFLICT (email) DO UPDATE SET invited_at = now(), accepted_at = NULL;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'admin_invite', 'user', _existing_user_id,
          jsonb_build_object('email', p_email, 'pre_existing', _existing_user_id IS NOT NULL));
END;
$$;


ALTER FUNCTION "public"."create_admin_invite"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."curriculum_add_lesson"("p_unit_id" "uuid", "p_title" "text", "p_content" "text" DEFAULT NULL::"text", "p_objectives" "text" DEFAULT NULL::"text", "p_video_url" "text" DEFAULT NULL::"text", "p_external_link" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_order int; v_id uuid;
BEGIN
  SELECT COALESCE(MAX(order_index) + 1, 0) INTO v_order FROM lessons WHERE unit_id = p_unit_id;
  INSERT INTO lessons (unit_id, title, content, objectives, video_url, external_link, order_index)
  VALUES (p_unit_id, p_title, p_content, p_objectives, p_video_url, p_external_link, v_order)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;


ALTER FUNCTION "public"."curriculum_add_lesson"("p_unit_id" "uuid", "p_title" "text", "p_content" "text", "p_objectives" "text", "p_video_url" "text", "p_external_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."curriculum_classroom_id"("_curriculum_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return (select cu.classroom_id from public.curricula cu where cu.id = _curriculum_id);
end; $$;


ALTER FUNCTION "public"."curriculum_classroom_id"("_curriculum_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."curriculum_update_lesson"("p_id" "uuid", "p_title" "text" DEFAULT NULL::"text", "p_content" "text" DEFAULT NULL::"text", "p_objectives" "text" DEFAULT NULL::"text", "p_order_index" integer DEFAULT NULL::integer, "p_video_url" "text" DEFAULT NULL::"text", "p_external_link" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE lessons SET
    title         = COALESCE(p_title, title),
    content       = COALESCE(p_content, content),
    objectives    = COALESCE(p_objectives, objectives),
    video_url     = COALESCE(p_video_url, video_url),
    external_link = COALESCE(p_external_link, external_link),
    order_index   = COALESCE(p_order_index, order_index),
    updated_at    = NOW()
  WHERE id = p_id;
END; $$;


ALTER FUNCTION "public"."curriculum_update_lesson"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_objectives" "text", "p_order_index" integer, "p_video_url" "text", "p_external_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_admin_role_grant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _email text;
BEGIN
  IF NEW.role = 'admin'::app_role THEN
    IF auth.uid() IS NOT NULL AND public.is_superadmin(auth.uid()) THEN
      RETURN NEW;
    END IF;
    IF public.is_superadmin(NEW.user_id) THEN
      RETURN NEW;
    END IF;
    SELECT email INTO _email FROM auth.users WHERE id = NEW.user_id;
    IF _email IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pending_admin_invites WHERE LOWER(email) = LOWER(_email)
    ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only the superadmin can grant the admin role';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_admin_role_grant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enrollment_in_my_hub"("_enrollment_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.programs p ON p.id = e.program_id
    WHERE e.id = _enrollment_id AND p.hub_id = public.get_my_hub_id());
END; $$;


ALTER FUNCTION "public"."enrollment_in_my_hub"("_enrollment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enrollment_is_mine"("_enrollment_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.id = _enrollment_id AND e.user_id = auth.uid());
END; $$;


ALTER FUNCTION "public"."enrollment_is_mine"("_enrollment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_lead_campaigns"("p_lead_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_lead public.crm_leads; v_campaign record; v_first record; v_source_slug text; BEGIN
  SELECT * INTO v_lead FROM public.crm_leads WHERE id=p_lead_id;
  IF v_lead.id IS NULL OR NOT v_lead.marketing_consent OR v_lead.suppressed_at IS NOT NULL OR v_lead.lifecycle_status IN ('registered','not_interested') THEN RETURN; END IF;
  SELECT slug INTO v_source_slug FROM public.lead_sources WHERE id=v_lead.source_id;
  FOR v_campaign IN SELECT * FROM public.marketing_campaigns WHERE hub_id=v_lead.hub_id AND status='active' LOOP
    IF (NOT (v_campaign.entry_rules ? 'qualification') OR v_campaign.entry_rules->'qualification' ? v_lead.qualification)
      AND (NOT (v_campaign.entry_rules ? 'status') OR v_campaign.entry_rules->'status' ? v_lead.lifecycle_status)
      AND (NOT (v_campaign.entry_rules ? 'source') OR v_campaign.entry_rules->'source' ? COALESCE(v_source_slug,''))
      AND (NOT (v_campaign.entry_rules ? 'tag_ids') OR EXISTS (SELECT 1 FROM public.lead_tag_assignments a WHERE a.lead_id=v_lead.id AND v_campaign.entry_rules->'tag_ids' ? a.tag_id::text)) THEN
      SELECT step_order,delay_hours INTO v_first FROM public.marketing_campaign_steps WHERE campaign_id=v_campaign.id ORDER BY step_order LIMIT 1;
      IF v_first.step_order IS NOT NULL THEN
        INSERT INTO public.marketing_campaign_enrollments(hub_id,campaign_id,lead_id,next_step_order,next_send_at)
        VALUES(v_lead.hub_id,v_campaign.id,v_lead.id,v_first.step_order,now() + make_interval(hours=>v_first.delay_hours)) ON CONFLICT(campaign_id,lead_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END $$;


ALTER FUNCTION "public"."evaluate_lead_campaigns"("p_lead_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."attendance_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "cohort_id" "uuid",
    "lesson_id" "uuid",
    "code" "text" NOT NULL,
    "code_expires_at" timestamp with time zone NOT NULL,
    "duration_mins" integer DEFAULT 30 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "generated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "schedule_id" "uuid",
    "late_after_mins" integer DEFAULT 10 NOT NULL,
    CONSTRAINT "attendance_sessions_late_after_mins_check" CHECK (("late_after_mins" >= 0)),
    CONSTRAINT "attendance_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."attendance_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid" DEFAULT NULL::"uuid", "p_cohort_id" "uuid" DEFAULT NULL::"uuid", "p_duration_mins" integer DEFAULT 30) RETURNS "public"."attendance_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _code text;
  _session public.attendance_sessions%ROWTYPE;
BEGIN
  -- Permission check
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = p_classroom_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'active'
        AND cp.can_start_attendance = true
    ) THEN
      RAISE EXCEPTION 'You do not have permission to start attendance sessions for this classroom';
    END IF;
  END IF;

  -- Close any existing open sessions for this classroom/lesson
  UPDATE public.attendance_sessions
     SET status = 'closed', closed_at = now()
   WHERE classroom_id = p_classroom_id AND status = 'open';

  -- Update lesson status
  IF p_lesson_id IS NOT NULL THEN
    UPDATE public.lessons SET attendance_session_status = 'open' WHERE id = p_lesson_id;
  END IF;

  -- Generate unique 6-char alphanumeric code
  LOOP
    _code := upper(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.attendance_sessions
      WHERE code = _code AND status = 'open'
    );
  END LOOP;

  INSERT INTO public.attendance_sessions(
    classroom_id, lesson_id, cohort_id, code,
    code_expires_at, duration_mins, generated_by
  )
  VALUES (
    p_classroom_id, p_lesson_id, p_cohort_id, _code,
    now() + (p_duration_mins || ' minutes')::interval,
    p_duration_mins, auth.uid()
  )
  RETURNING * INTO _session;

  RETURN _session;
END;
$$;


ALTER FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid", "p_cohort_id" "uuid", "p_duration_mins" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid" DEFAULT NULL::"uuid", "p_cohort_id" "uuid" DEFAULT NULL::"uuid", "p_duration_mins" integer DEFAULT 30, "p_schedule_id" "uuid" DEFAULT NULL::"uuid", "p_late_after_mins" integer DEFAULT 10) RETURNS "public"."attendance_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _code             text;
  _session          public.attendance_sessions%ROWTYPE;
  _schedule         public.schedules%ROWTYPE;
  _legacy_lesson_id uuid := p_lesson_id;
  _cohort_id        uuid := p_cohort_id;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.classroom_staff cs
      JOIN public.classroom_permissions cp ON cp.classroom_staff_id = cs.id
      WHERE cs.classroom_id = p_classroom_id
        AND cs.user_id      = auth.uid()
        AND cs.status       = 'active'
        AND cp.can_start_attendance = true
    ) THEN
      RAISE EXCEPTION 'You do not have permission to start attendance sessions for this classroom';
    END IF;
  END IF;

  IF p_schedule_id IS NOT NULL THEN
    SELECT * INTO _schedule
    FROM public.schedules
    WHERE id = p_schedule_id AND classroom_id = p_classroom_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Schedule not found for this classroom';
    END IF;

    _cohort_id := COALESCE(_cohort_id, _schedule.cohort_id);
  END IF;

  UPDATE public.attendance_sessions
     SET status = 'closed', closed_at = now()
   WHERE classroom_id = p_classroom_id AND status = 'open';

  IF _legacy_lesson_id IS NOT NULL THEN
    UPDATE public.old_lessons SET attendance_session_status = 'open' WHERE id = _legacy_lesson_id;
  END IF;

  LOOP
    _code := upper(substring(encode(extensions.gen_random_bytes(4), 'hex') FROM 1 FOR 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.attendance_sessions
      WHERE code = _code AND status = 'open'
    );
  END LOOP;

  INSERT INTO public.attendance_sessions(
    classroom_id, lesson_id, cohort_id, schedule_id, code,
    code_expires_at, duration_mins, late_after_mins, generated_by
  )
  VALUES (
    p_classroom_id, _legacy_lesson_id, _cohort_id, p_schedule_id, _code,
    now() + (p_duration_mins || ' minutes')::interval,
    p_duration_mins, LEAST(p_late_after_mins, p_duration_mins), auth.uid()
  )
  RETURNING * INTO _session;

  RETURN _session;
END;
$$;


ALTER FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid", "p_cohort_id" "uuid", "p_duration_mins" integer, "p_schedule_id" "uuid", "p_late_after_mins" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_class_schedule"("p_classroom_id" "uuid", "p_module_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_days_of_week" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_cohort_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "scheduled_date" "date", "start_time" time without time zone, "end_time" time without time zone, "title" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _unit record;
  _d    date;
  _i    int := 0;
  _row  public.schedules%ROWTYPE;
BEGIN
  FOR _unit IN
    SELECT u.id AS unit_id, u.title AS unit_title
    FROM public.units u
    JOIN public.modules m ON m.id = u.module_id
    WHERE m.id = p_module_id
    ORDER BY u.order_index
  LOOP
    _d := p_start_date;
    <<day_loop>>
    LOOP
      IF _d > p_end_date THEN
        EXIT;
      END IF;
      IF array_position(p_days_of_week, extract(dow FROM _d)::int) IS NOT NULL THEN
        _i := _i + 1;
        INSERT INTO public.schedules
          (classroom_id, cohort_id, title, scheduled_date, start_time, end_time, status)
        VALUES
          (p_classroom_id, p_cohort_id, _unit.unit_title, _d, p_start_time, p_end_time, 'scheduled')
        RETURNING * INTO _row;

        id := _row.id;
        scheduled_date := _row.scheduled_date;
        start_time := _row.start_time;
        end_time := _row.end_time;
        title := _row.title;
        RETURN NEXT;
        EXIT day_loop;
      END IF;
      _d := _d + 1;
    END LOOP;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_class_schedule"("p_classroom_id" "uuid", "p_module_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_days_of_week" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_cohort_schedule"("p_cohort_id" "uuid", "p_days" "text"[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_instructor_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _cohort    record;
  _day_name  text;
  _dow       int;
  _d         date;
  _count     int := 0;
BEGIN
  SELECT * INTO _cohort FROM public.cohorts WHERE id = p_cohort_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cohort not found';
  END IF;

  FOREACH _day_name IN ARRAY p_days
  LOOP
    _dow := CASE lower(_day_name)
      WHEN 'sunday'    THEN 0
      WHEN 'monday'    THEN 1
      WHEN 'tuesday'   THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday'  THEN 4
      WHEN 'friday'    THEN 5
      WHEN 'saturday'  THEN 6
      ELSE -1
    END;
    IF _dow = -1 THEN
      RAISE WARNING 'Unknown day: %', _day_name;
      CONTINUE;
    END IF;

    _d := _cohort.start_date;
    WHILE _d <= _cohort.end_date LOOP
      IF extract(dow FROM _d)::int = _dow THEN
        INSERT INTO public.schedules
          (classroom_id, cohort_id, instructor_id, scheduled_date, start_time, end_time, status)
        VALUES
          (_cohort.classroom_id, p_cohort_id, p_instructor_id, _d, p_start_time, p_end_time, 'scheduled');
        _count := _count + 1;
      END IF;
      _d := _d + 1;
    END LOOP;
  END LOOP;

  RETURN _count;
END;
$$;


ALTER FUNCTION "public"."generate_cohort_schedule"("p_cohort_id" "uuid", "p_days" "text"[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_instructor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR TRIM(NEW.invoice_number) = '' THEN
    NEW.invoice_number := 'INV-' || LPAD(nextval('public.invoice_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_invoice_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_assignment_hub_id"("p_assignment_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT c.hub_id FROM assignments a JOIN classrooms c ON c.id = a.classroom_id WHERE a.id = p_assignment_id;
$$;


ALTER FUNCTION "public"."get_assignment_hub_id"("p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classroom_curricula"("p_classroom_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'classroom_id', c.classroom_id,
      'title', c.title,
      'description', c.description,
      'created_at', c.created_at
    )
    ORDER BY c.created_at
  )
  FROM public.curricula c
  WHERE c.classroom_id = p_classroom_id;
$$;


ALTER FUNCTION "public"."get_classroom_curricula"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classroom_curricula_trees"("p_classroom_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id',           c.id,
        'classroom_id', c.classroom_id,
        'title',        c.title,
        'description',  c.description,
        'created_at',   c.created_at,
        'tracks', COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id',           t.id,
              'curriculum_id', t.curriculum_id,
              'title',        t.title,
              'description',  t.description,
              'order_index',  t.order_index,
              'modules', COALESCE(
                (SELECT jsonb_agg(
                  jsonb_build_object(
                    'id',          m.id,
                    'track_id',    m.track_id,
                    'title',       m.title,
                    'description', m.description,
                    'order_index', m.order_index,
                    'units', COALESCE(
                      (SELECT jsonb_agg(
                        jsonb_build_object(
                          'id',          u.id,
                          'module_id',   u.module_id,
                          'title',       u.title,
                          'description', u.description,
                          'order_index', u.order_index,
                          'lessons',     '[]'::jsonb
                        )
                        ORDER BY u.order_index
                      )
                      FROM public.units u
                      WHERE u.module_id = m.id),
                      '[]'::jsonb
                    )
                  )
                  ORDER BY m.order_index
                )
                FROM public.modules m
                WHERE m.track_id = t.id),
                '[]'::jsonb
              )
            )
            ORDER BY t.order_index
          )
          FROM public.tracks t
          WHERE t.curriculum_id = c.id),
          '[]'::jsonb
        )
      )
      ORDER BY c.created_at
    )
    FROM public.curricula c
    WHERE c.classroom_id = p_classroom_id),
    '[]'::jsonb
  );
$$;


ALTER FUNCTION "public"."get_classroom_curricula_trees"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classroom_hub_id"("p_classroom_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT hub_id FROM classrooms WHERE id = p_classroom_id;
$$;


ALTER FUNCTION "public"."get_classroom_hub_id"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classroom_lesson_options"("p_classroom_id" "uuid") RETURNS TABLE("lesson_id" "uuid", "lesson_title" "text", "unit_id" "uuid", "unit_title" "text", "module_id" "uuid", "module_title" "text", "track_id" "uuid", "track_title" "text", "curriculum_id" "uuid", "curriculum_title" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    l.id,
    l.title,
    u.id,
    u.title,
    m.id,
    m.title,
    t.id,
    t.title,
    c.id,
    c.title
  FROM public.lessons l
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.modules m ON m.id = u.module_id
  JOIN public.tracks t ON t.id = m.track_id
  JOIN public.curricula c ON c.id = t.curriculum_id
  WHERE c.classroom_id = p_classroom_id
    AND (
      public.is_superadmin()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.classroom_staff cs
        WHERE cs.classroom_id = p_classroom_id
          AND cs.status = 'active'
          AND cs.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.classroom_students cst
        WHERE cst.classroom_id = p_classroom_id
          AND cst.student_id = auth.uid()
      )
    )
  ORDER BY c.created_at, t.order_index, m.order_index, u.order_index, l.order_index;
$$;


ALTER FUNCTION "public"."get_classroom_lesson_options"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classroom_schedules"("p_classroom_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',             s.id,
        'classroom_id',   s.classroom_id,
        'cohort_id',      s.cohort_id,
        'lesson_id',      s.lesson_id,
        'module_id',      COALESCE(s.module_id, u.module_id),
        'unit_id',        l.unit_id,
        'instructor_id',  s.instructor_id,
        'title',          s.title,
        'scheduled_date', s.scheduled_date,
        'start_time',     s.start_time,
        'end_time',       s.end_time,
        'location',       s.location,
        'meeting_link',   s.meeting_link,
        'status',         s.status,
        'created_at',     s.created_at,
        'lessons',
          CASE WHEN l.id IS NOT NULL THEN
            jsonb_build_object(
              'title', l.title,
              'units', CASE WHEN u.id IS NOT NULL
                THEN jsonb_build_object('title', u.title)
                ELSE NULL END
            )
          ELSE NULL END,
        'modules',
          CASE WHEN m.id IS NOT NULL
            THEN jsonb_build_object('title', m.title)
            ELSE NULL END,
        'cohorts',
          CASE WHEN c.id IS NOT NULL
            THEN jsonb_build_object('cohort_label', c.cohort_label)
            ELSE NULL END,
        'staff',
          CASE WHEN instructor.id IS NOT NULL
            THEN jsonb_build_object('full_name', instructor.full_name)
            ELSE NULL END
      )
      ORDER BY s.scheduled_date ASC, s.start_time ASC
    ),
    '[]'::jsonb
  )
  FROM   public.schedules  s
  LEFT JOIN public.lessons  l    ON l.id        = s.lesson_id
  LEFT JOIN public.units    u    ON u.id         = l.unit_id
  LEFT JOIN public.modules  m    ON m.id         = COALESCE(s.module_id, u.module_id)
  LEFT JOIN public.cohorts  c    ON c.id         = s.cohort_id
  LEFT JOIN public.staff instructor ON instructor.id = s.instructor_id
  WHERE  s.classroom_id = p_classroom_id
    AND (
      public.is_superadmin()
      OR (
        public.has_role(auth.uid(), 'admin'::app_role)
        AND public.get_classroom_hub_id(p_classroom_id) = public.get_my_hub_id()
      )
      OR EXISTS (
        SELECT 1
        FROM public.classroom_staff cs
        WHERE cs.classroom_id = p_classroom_id
          AND cs.user_id = auth.uid()
          AND cs.status = 'active'
      )
      OR EXISTS (
        SELECT 1
        FROM public.classroom_students cst
        WHERE cst.classroom_id = p_classroom_id
          AND cst.student_id = auth.uid()
      )
    );
$$;


ALTER FUNCTION "public"."get_classroom_schedules"("p_classroom_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_classroom_staff_hub_id"("p_cs_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT c.hub_id FROM classroom_staff cs JOIN classrooms c ON c.id = cs.classroom_id WHERE cs.id = p_cs_id;
$$;


ALTER FUNCTION "public"."get_classroom_staff_hub_id"("p_cs_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cohort_analytics"("p_cohort_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
WITH
  enroll_agg AS (
    SELECT
      COUNT(*)                                                              AS total_students,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'active')               AS active_count,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'pending')              AS pending_count,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'overdue')              AS overdue_count,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'completed')            AS completed_count,
      COUNT(*) FILTER (WHERE e.enrollment_status = 'cancelled')            AS cancelled_count,
      COALESCE(SUM(e.total_amount),        0)                              AS total_invoiced,
      COALESCE(SUM(e.amount_paid),         0)                              AS total_paid,
      COALESCE(SUM(e.outstanding_balance), 0)                              AS total_outstanding
    FROM public.cohort_students cs
    LEFT JOIN public.enrollments e ON e.id = cs.enrollment_id
    WHERE cs.cohort_id = p_cohort_id
  ),
  session_agg AS (
    SELECT
      COUNT(*)                                             AS total_sessions,
      COUNT(*) FILTER (WHERE status = 'closed')           AS closed_sessions,
      COUNT(*) FILTER (WHERE status = 'open')             AS open_sessions
    FROM public.attendance_sessions
    WHERE cohort_id = p_cohort_id
  ),
  record_agg AS (
    SELECT
      COUNT(ar.id)                                                          AS total_marks,
      COUNT(ar.id) FILTER (WHERE ar.attendance_status = 'present')         AS present_count,
      COUNT(ar.id) FILTER (WHERE ar.attendance_status = 'late')            AS late_count
    FROM public.attendance_sessions s
    JOIN public.attendance_records ar ON ar.session_id = s.id
    WHERE s.cohort_id = p_cohort_id
      AND s.status    = 'closed'
  ),
  trend_agg AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'code',    t.code,
        'date',    t.session_date,
        'present', t.present_count,
        'late',    t.late_count,
        'absent',  GREATEST(0, t.enrolled_count - t.present_count - t.late_count)
      ) ORDER BY t.session_date
    ) AS trend
    FROM (
      SELECT
        s.code,
        s.created_at::date                                                 AS session_date,
        COUNT(ar.id) FILTER (WHERE ar.attendance_status = 'present')      AS present_count,
        COUNT(ar.id) FILTER (WHERE ar.attendance_status = 'late')         AS late_count,
        (SELECT COUNT(*) FROM public.cohort_students WHERE cohort_id = p_cohort_id) AS enrolled_count
      FROM (
        SELECT id, code, created_at
        FROM public.attendance_sessions
        WHERE cohort_id = p_cohort_id AND status = 'closed'
        ORDER BY created_at DESC
        LIMIT 20
      ) s
      LEFT JOIN public.attendance_records ar ON ar.session_id = s.id
      GROUP BY s.id, s.code, s.created_at
    ) t
  ),
  student_agg AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'student_id',        t.student_id,
        'full_name',         t.full_name,
        'sessions_attended', t.sessions_attended,
        'total_sessions',    t.total_closed
      ) ORDER BY t.sessions_attended DESC
    ) AS students
    FROM (
      SELECT
        cs.student_id,
        p.full_name,
        COUNT(ar.id)                                                       AS sessions_attended,
        (SELECT COUNT(*) FROM public.attendance_sessions
         WHERE cohort_id = p_cohort_id AND status = 'closed')             AS total_closed
      FROM public.cohort_students cs
      LEFT JOIN public.profiles p ON p.user_id = cs.student_id
      LEFT JOIN public.attendance_sessions s
             ON s.cohort_id = p_cohort_id AND s.status = 'closed'
      LEFT JOIN public.attendance_records ar
             ON ar.session_id   = s.id
            AND ar.student_id   = cs.student_id
            AND ar.attendance_status IN ('present', 'late')
      WHERE cs.cohort_id = p_cohort_id
      GROUP BY cs.student_id, p.full_name
    ) t
  )
SELECT jsonb_build_object(
  'enrollment', jsonb_build_object(
    'total_students',    e.total_students,
    'active_count',      e.active_count,
    'pending_count',     e.pending_count,
    'overdue_count',     e.overdue_count,
    'completed_count',   e.completed_count,
    'cancelled_count',   e.cancelled_count,
    'total_invoiced',    e.total_invoiced,
    'total_paid',        e.total_paid,
    'total_outstanding', e.total_outstanding
  ),
  'sessions', jsonb_build_object(
    'total_sessions',  ss.total_sessions,
    'closed_sessions', ss.closed_sessions,
    'open_sessions',   ss.open_sessions
  ),
  'attendance', jsonb_build_object(
    'total_marks',     ra.total_marks,
    'present_count',   ra.present_count,
    'late_count',      ra.late_count,
    'attendance_rate', CASE
      WHEN ss.closed_sessions = 0 OR e.total_students = 0 THEN 0
      ELSE ROUND(
        (ra.present_count + ra.late_count)::numeric
        / NULLIF(ss.closed_sessions * e.total_students, 0) * 100
      , 1)
    END
  ),
  'trend',    COALESCE((SELECT trend    FROM trend_agg),   '[]'::jsonb),
  'students', COALESCE((SELECT students FROM student_agg), '[]'::jsonb)
)
FROM enroll_agg e, session_agg ss, record_agg ra
$$;


ALTER FUNCTION "public"."get_cohort_analytics"("p_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cohort_classroom_hub_id"("p_cohort_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT c.hub_id FROM cohorts co JOIN classrooms c ON c.id = co.classroom_id WHERE co.id = p_cohort_id;
$$;


ALTER FUNCTION "public"."get_cohort_classroom_hub_id"("p_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_crm_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_hub uuid := public.get_my_hub_id(); v_previous_from timestamptz := p_from - (p_to-p_from); v_result jsonb; BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT jsonb_build_object(
    'new_leads',count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to),
    'cohort_conversions',count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to AND converted_at IS NOT NULL),
    'conversions_completed',count(*) FILTER(WHERE converted_at>=p_from AND converted_at<p_to),
    'conversion_rate',CASE WHEN count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to)=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to AND converted_at IS NOT NULL)/count(*) FILTER(WHERE created_at>=p_from AND created_at<p_to),1) END,
    'previous_new_leads',count(*) FILTER(WHERE created_at>=v_previous_from AND created_at<p_from),
    'previous_conversions',count(*) FILTER(WHERE converted_at>=v_previous_from AND converted_at<p_from),
    'cold',count(*) FILTER(WHERE qualification='cold'),'warm',count(*) FILTER(WHERE qualification='warm'),'hot',count(*) FILTER(WHERE qualification='hot'),
    'outstanding_follow_ups',(SELECT count(*) FROM public.lead_follow_ups f WHERE f.hub_id=v_hub AND f.status='pending' AND f.due_at<now()),
    'trend',(SELECT COALESCE(jsonb_agg(jsonb_build_object('date',dates.series_day,'leads',COALESCE(l.total,0),'conversions',COALESCE(c.total,0)) ORDER BY dates.series_day),'[]'::jsonb) FROM generate_series(p_from::date,(p_to-interval '1 day')::date,interval '1 day') AS dates(series_day) LEFT JOIN (SELECT created_at::date AS series_day,count(*) total FROM public.crm_leads WHERE hub_id=v_hub AND created_at>=p_from AND created_at<p_to GROUP BY 1) l ON l.series_day=dates.series_day LEFT JOIN (SELECT converted_at::date AS series_day,count(*) total FROM public.crm_leads WHERE hub_id=v_hub AND converted_at>=p_from AND converted_at<p_to GROUP BY 1) c ON c.series_day=dates.series_day),
    'sources',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'value',total) ORDER BY total DESC),'[]'::jsonb) FROM (SELECT COALESCE(s.name,'Unknown') name,count(*) total FROM public.crm_leads l LEFT JOIN public.lead_sources s ON s.id=l.source_id WHERE l.hub_id=v_hub AND l.created_at>=p_from AND l.created_at<p_to GROUP BY 1) q),
    'funnel',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',replace(initcap(lifecycle_status),'_',' '),'key',lifecycle_status,'value',total) ORDER BY array_position(ARRAY['new_lead','contacted','interested','follow_up','registered','not_interested'],lifecycle_status)),'[]'::jsonb) FROM (SELECT lifecycle_status,count(*) total FROM public.crm_leads WHERE hub_id=v_hub AND created_at>=p_from AND created_at<p_to GROUP BY 1) q),
    'qualification',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',initcap(qualification),'key',qualification,'value',total)),'[]'::jsonb) FROM (SELECT qualification,count(*) total FROM public.crm_leads WHERE hub_id=v_hub GROUP BY 1) q),
    'follow_ups',(SELECT jsonb_build_object('completed',count(*) FILTER(WHERE status='completed'),'cancelled',count(*) FILTER(WHERE status='cancelled'),'overdue',count(*) FILTER(WHERE status='pending' AND due_at<now()),'completion_rate',CASE WHEN count(*) FILTER(WHERE status IN('completed','cancelled'))=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE status='completed')/count(*) FILTER(WHERE status IN('completed','cancelled')),1) END,'average_hours',COALESCE(round(avg(extract(epoch FROM(completed_at-created_at))/3600) FILTER(WHERE status='completed'),1),0)) FROM public.lead_follow_ups WHERE hub_id=v_hub AND due_at>=p_from AND due_at<p_to),
    'campaigns',(SELECT jsonb_build_object('sent',count(*) FILTER(WHERE sent_at IS NOT NULL),'delivered',count(*) FILTER(WHERE delivered_at IS NOT NULL),'opened',count(*) FILTER(WHERE opened_at IS NOT NULL),'clicked',count(*) FILTER(WHERE clicked_at IS NOT NULL),'bounced',count(*) FILTER(WHERE bounced_at IS NOT NULL),'open_rate',CASE WHEN count(*) FILTER(WHERE delivered_at IS NOT NULL)=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE opened_at IS NOT NULL)/count(*) FILTER(WHERE delivered_at IS NOT NULL),1) END,'click_rate',CASE WHEN count(*) FILTER(WHERE delivered_at IS NOT NULL)=0 THEN 0 ELSE round(100.0*count(*) FILTER(WHERE clicked_at IS NOT NULL)/count(*) FILTER(WHERE delivered_at IS NOT NULL),1) END) FROM public.marketing_email_deliveries WHERE hub_id=v_hub AND created_at>=p_from AND created_at<p_to),
    'owners',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'leads',leads,'conversions',conversions,'rate',CASE WHEN leads=0 THEN 0 ELSE round(100.0*conversions/leads,1) END) ORDER BY leads DESC),'[]'::jsonb) FROM (SELECT COALESCE(p.full_name,p.email,'Unassigned') name,count(*) leads,count(*) FILTER(WHERE l.converted_at IS NOT NULL) conversions FROM public.crm_leads l LEFT JOIN public.profiles p ON p.user_id=l.owner_id WHERE l.hub_id=v_hub AND l.created_at>=p_from AND l.created_at<p_to GROUP BY 1) q),
    'programs',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'leads',leads,'conversions',conversions) ORDER BY leads DESC),'[]'::jsonb) FROM (SELECT COALESCE(p.program_name,'Not specified') name,count(*) leads,count(*) FILTER(WHERE l.converted_at IS NOT NULL) conversions FROM public.crm_leads l LEFT JOIN public.programs p ON p.id=l.program_interest_id WHERE l.hub_id=v_hub AND l.created_at>=p_from AND l.created_at<p_to GROUP BY 1) q)
  ) INTO v_result FROM public.crm_leads WHERE hub_id=v_hub;
  RETURN v_result;
END $$;


ALTER FUNCTION "public"."get_crm_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_curriculum_hub_id"("p_curriculum_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    c.hub_id,
    (SELECT c2.hub_id FROM cohorts co JOIN classrooms c2 ON c2.id = co.classroom_id WHERE co.id = cur.cohort_id)
  )
  FROM curriculums cur LEFT JOIN classrooms c ON c.id = cur.classroom_id
  WHERE cur.id = p_curriculum_id;
$$;


ALTER FUNCTION "public"."get_curriculum_hub_id"("p_curriculum_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_curriculum_tree"("p_curriculum_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'tracks', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'curriculum_id', t.curriculum_id,
          'title', t.title,
          'description', t.description,
          'order_index', t.order_index
        )
        ORDER BY t.order_index
      )
      FROM public.tracks t
      WHERE t.curriculum_id = p_curriculum_id),
      '[]'::jsonb
    ),
    'modules', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'track_id', m.track_id,
          'title', m.title,
          'description', m.description,
          'order_index', m.order_index
        )
        ORDER BY m.order_index
      )
      FROM public.modules m
      JOIN public.tracks t ON t.id = m.track_id
      WHERE t.curriculum_id = p_curriculum_id),
      '[]'::jsonb
    ),
    'units', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'module_id', u.module_id,
          'title', u.title,
          'description', u.description,
          'order_index', u.order_index
        )
        ORDER BY u.order_index
      )
      FROM public.units u
      JOIN public.modules m ON m.id = u.module_id
      JOIN public.tracks t ON t.id = m.track_id
      WHERE t.curriculum_id = p_curriculum_id),
      '[]'::jsonb
    )
  );
$$;


ALTER FUNCTION "public"."get_curriculum_tree"("p_curriculum_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_curriculum_week_hub_id"("p_cw_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.get_curriculum_hub_id(cw.curriculum_id)
  FROM curriculum_weeks cw WHERE cw.id = p_cw_id;
$$;


ALTER FUNCTION "public"."get_curriculum_week_hub_id"("p_cw_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN (
    WITH e AS (
      SELECT e.total_amount, e.amount_paid, e.enrollment_status
      FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE p.hub_id = _hub
    ),
    inv AS (
      SELECT i.total_amount
      FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      JOIN public.programs p    ON p.id = e.program_id
      WHERE p.hub_id = _hub
    ),
    oi AS (
      SELECT amount
      FROM public.other_income
      WHERE hub_id = _hub
    )
    SELECT jsonb_build_object(
      'total_invoiced',    COALESCE((SELECT SUM(total_amount) FROM inv), 0),
      'total_collected',   COALESCE((SELECT SUM(amount_paid) FROM e), 0)
                         + COALESCE((SELECT SUM(amount) FROM oi), 0),
      'outstanding',       COALESCE((SELECT SUM(total_amount - amount_paid) FROM e), 0),
      'overdue_count',     COALESCE((SELECT COUNT(*) FROM e WHERE enrollment_status = 'overdue'), 0),
      'total_enrollments', COALESCE((SELECT COUNT(*) FROM e), 0)
    )
  );
END;
$$;


ALTER FUNCTION "public"."get_dashboard_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_enrollment_field_values"("p_enrollment_id" "uuid") RETURNS TABLE("field_key" "text", "value" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT cf.key, fv.value
  FROM public.field_values fv
  JOIN public.custom_fields cf ON cf.id = fv.field_id
  WHERE fv.enrollment_id = p_enrollment_id
    AND cf.active = true
    AND cf.visible_to_student = true;
END;
$$;


ALTER FUNCTION "public"."get_enrollment_field_values"("p_enrollment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_enrollment_for_completion"("p_enrollment_id" "uuid") RETURNS TABLE("id" "uuid", "full_name" "text", "email" "text", "phone" "text", "user_id" "uuid", "program_name" "text", "hub_id" "uuid", "profile_requirements_version" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT e.id, e.full_name, e.email, e.phone, e.user_id, p.program_name,
         p.hub_id, e.profile_requirements_version
  FROM public.enrollments e
  JOIN public.programs p ON p.id = e.program_id
  WHERE e.id = p_enrollment_id;
$$;


ALTER FUNCTION "public"."get_enrollment_for_completion"("p_enrollment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_enrollment_performance"("p_months" integer DEFAULT 12, "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date") RETURNS TABLE("month" "date", "target_count" integer, "actual_count" integer, "variance" integer, "achievement_pct" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _start date;
  _end   date;
  _cut   date;
  _hub   uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view enrollment performance';
  END IF;

  _hub := public.get_my_hub_id();

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end   := date_trunc('month', p_end_date)::date;
  ELSE
    _end   := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months, 1) - 1) || ' months')::interval)::date;
  END IF;
  _cut := (_end + interval '1 month')::date;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  first_payments AS (
    -- Upper bound only: dropping rows after the window can't change which
    -- in-window month a MIN lands in. A lower bound here could shift an
    -- earlier first payment into the window, so it stays outside.
    SELECT i.enrollment_id, MIN(inst.due_date)::date AS first_due
    FROM public.invoices i
    JOIN public.installments inst ON inst.invoice_id = i.id AND inst.status = 'paid'
    WHERE inst.due_date < _cut
    GROUP BY i.enrollment_id
  ),
  actual AS (
    SELECT date_trunc('month', fp.first_due)::date AS m,
           COUNT(*)::int AS cnt
    FROM public.enrollments e
    JOIN public.programs pr ON pr.id = e.program_id
    JOIN first_payments fp  ON fp.enrollment_id = e.id
    WHERE pr.hub_id = _hub
      AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
      AND fp.first_due >= _start
    GROUP BY 1
  ),
  tgt AS (
    SELECT t.target_month AS m, t.target_count AS cnt
    FROM public.enrollment_targets t
    WHERE t.hub_id = _hub
      AND t.target_month >= _start AND t.target_month <= _end
  )
  SELECT months.m,
         COALESCE(tgt.cnt, 0)::int,
         COALESCE(actual.cnt, 0)::int,
         (COALESCE(actual.cnt, 0) - COALESCE(tgt.cnt, 0))::int,
         CASE WHEN COALESCE(tgt.cnt, 0) > 0
              THEN ROUND((COALESCE(actual.cnt, 0)::numeric / tgt.cnt::numeric) * 100, 1)
              ELSE NULL END
  FROM months
  LEFT JOIN actual ON actual.m = months.m
  LEFT JOIN tgt    ON tgt.m   = months.m
  ORDER BY months.m DESC;
END;
$$;


ALTER FUNCTION "public"."get_enrollment_performance"("p_months" integer, "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_finance_summary"("p_months" integer DEFAULT 12, "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date") RETURNS TABLE("month" "date", "revenue" numeric, "revenue_cash" numeric, "other_income_total" numeric, "payroll_total" numeric, "expenses_total" numeric, "profit" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _start date;
  _end   date;
  _cut   date; -- exclusive upper bound (first day after the window)
  _hub   uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view finance summary';
  END IF;

  _hub := public.get_my_hub_id();

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    _start := date_trunc('month', p_start_date)::date;
    _end   := date_trunc('month', p_end_date)::date;
  ELSE
    _end   := date_trunc('month', CURRENT_DATE)::date;
    _start := (date_trunc('month', CURRENT_DATE) - ((GREATEST(p_months, 1) - 1) || ' months')::interval)::date;
  END IF;
  _cut := (_end + interval '1 month')::date;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  rev AS (
    -- Due-date basis (unchanged) - the documented accrual view. See CLAUDE.md.
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT p.payment_date::timestamptz AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND i.status != 'cancelled'
        AND p.payment_date >= _start AND p.payment_date < _cut
      UNION ALL
      SELECT inst.due_date::timestamptz AS paid_at, inst.amount
      FROM public.installments inst
      JOIN public.invoices      i  ON i.id  = inst.invoice_id
      JOIN public.enrollments   e  ON e.id  = i.enrollment_id
      JOIN public.programs      pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND inst.status = 'paid'
        AND i.status != 'cancelled'
        AND inst.due_date >= _start AND inst.due_date < _cut
    ) src
    GROUP BY 1
  ),
  rev_cash AS (
    -- Payment-date basis (the dashboard default). Prefers the bank's timestamp
    -- where one has been matched; falls back to the staff-entered date, which is
    -- all that exists for historical rows.
    SELECT date_trunc('month', paid_at)::date AS m,
           SUM(amount)                        AS total
    FROM (
      SELECT COALESCE(p.paid_at_actual, p.payment_date::timestamptz) AS paid_at, p.amount
      FROM public.payments   p
      JOIN public.invoices   i  ON i.id  = p.invoice_id
      JOIN public.enrollments e ON e.id  = i.enrollment_id
      JOIN public.programs   pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND i.status != 'cancelled'
        AND COALESCE(p.paid_at_actual, p.payment_date::timestamptz) >= _start
        AND COALESCE(p.paid_at_actual, p.payment_date::timestamptz) <  _cut
      UNION ALL
      SELECT COALESCE(inst.paid_at_actual, inst.paid_at) AS paid_at, inst.amount
      FROM public.installments inst
      JOIN public.invoices      i  ON i.id  = inst.invoice_id
      JOIN public.enrollments   e  ON e.id  = i.enrollment_id
      JOIN public.programs      pr ON pr.id = e.program_id
      WHERE pr.hub_id = _hub
        AND inst.status = 'paid'
        AND i.status != 'cancelled'
        AND COALESCE(inst.paid_at_actual, inst.paid_at) >= _start
        AND COALESCE(inst.paid_at_actual, inst.paid_at) <  _cut
    ) src
    GROUP BY 1
  ),
  oi AS (
    SELECT date_trunc('month', o.payment_date)::date AS m,
           COALESCE(SUM(o.amount), 0)               AS total
    FROM public.other_income o
    WHERE o.hub_id = _hub
      AND o.payment_date >= _start AND o.payment_date < _cut
    GROUP BY 1
  ),
  pr AS (
    SELECT p.pay_month                       AS m,
           COALESCE(SUM(p.amount), 0)        AS total
    FROM public.payroll_runs p
    JOIN public.staff        s ON s.id = p.staff_id
    WHERE s.hub_id = _hub
      AND p.status = 'paid'
      AND p.pay_month >= _start AND p.pay_month <= _end
    GROUP BY 1
  ),
  ex AS (
    SELECT date_trunc('month', e.payment_date)::date AS m,
           COALESCE(SUM(e.amount), 0)               AS total
    FROM public.expenses e
    WHERE e.hub_id = _hub
      AND e.payment_date >= _start AND e.payment_date < _cut
    GROUP BY 1
  )
  SELECT months.m,
         COALESCE(rev.total, 0),
         COALESCE(rev_cash.total, 0),
         COALESCE(oi.total,  0),
         COALESCE(pr.total,  0),
         COALESCE(ex.total,  0),
         (COALESCE(rev.total, 0) + COALESCE(oi.total, 0))
           - COALESCE(pr.total, 0)
           - COALESCE(ex.total, 0)
  FROM months
  LEFT JOIN rev      ON rev.m      = months.m
  LEFT JOIN rev_cash ON rev_cash.m = months.m
  LEFT JOIN oi       ON oi.m       = months.m
  LEFT JOIN pr       ON pr.m       = months.m
  LEFT JOIN ex       ON ex.m       = months.m
  ORDER BY months.m DESC;
END;
$$;


ALTER FUNCTION "public"."get_finance_summary"("p_months" integer, "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_lesson_hub_id"("p_lesson_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT c.hub_id FROM lessons l JOIN classrooms c ON c.id = l.classroom_id WHERE l.id = p_lesson_id;
$$;


ALTER FUNCTION "public"."get_lesson_hub_id"("p_lesson_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_hub_context"() RETURNS TABLE("hub_id" "uuid", "hub_name" "text", "hub_slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT h.id, h.name, h.slug
  FROM public.hub_members hm
  JOIN public.hubs h ON h.id = hm.hub_id
  WHERE hm.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_hub_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_hub_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT hub_id FROM public.hub_members WHERE user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_hub_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_staff_names"("p_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "full_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id, full_name FROM public.staff WHERE id = ANY(p_ids);
$$;


ALTER FUNCTION "public"."get_staff_names"("p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_progress"("p_student_id" "uuid", "p_cohort_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _total_lessons int;
  _attended int;
  _total_assignments int;
  _submitted int;
  _req_assignments int;
  _passed_assignments int;
  _req_presentations int;
  _passed_presentations int;
  _graduation_status text;
BEGIN
  SELECT COUNT(*) INTO _total_lessons FROM public.lessons
  WHERE cohort_id = p_cohort_id AND status <> 'cancelled';

  SELECT COUNT(DISTINCT ar.lesson_id) INTO _attended
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE ar.student_id = p_student_id
    AND s.cohort_id = p_cohort_id
    AND ar.attendance_status IN ('present','late');

  SELECT COUNT(*) INTO _total_assignments FROM public.assignments
  WHERE cohort_id = p_cohort_id AND status = 'published';

  SELECT COUNT(*) INTO _submitted
  FROM public.assignment_submissions asub
  JOIN public.assignments a ON a.id = asub.assignment_id
  WHERE asub.student_id = p_student_id
    AND a.cohort_id = p_cohort_id;

  SELECT COUNT(*) INTO _req_assignments FROM public.assignments
  WHERE cohort_id = p_cohort_id AND status = 'published' AND pass_score IS NOT NULL;

  SELECT COUNT(*) INTO _passed_assignments
  FROM public.assignments a
  JOIN public.assignment_submissions asub
    ON asub.assignment_id = a.id AND asub.student_id = p_student_id AND asub.status = 'graded'
  WHERE a.cohort_id = p_cohort_id AND a.status = 'published' AND a.pass_score IS NOT NULL
    AND asub.score IS NOT NULL AND asub.score >= a.pass_score;

  SELECT COUNT(*) INTO _req_presentations FROM public.presentations
  WHERE cohort_id = p_cohort_id AND status IN ('published','completed');

  SELECT COUNT(*) INTO _passed_presentations
  FROM public.presentations pr
  JOIN public.presentation_grades pg
    ON pg.presentation_id = pr.id AND pg.student_id = p_student_id AND pg.status = 'graded'
  WHERE pr.cohort_id = p_cohort_id AND pr.status IN ('published','completed')
    AND pg.score IS NOT NULL AND pg.score >= pr.pass_score;

  SELECT auto_graduation_status INTO _graduation_status
  FROM public.cohort_students WHERE cohort_id = p_cohort_id AND student_id = p_student_id;

  RETURN jsonb_build_object(
    'total_lessons', _total_lessons,
    'lessons_attended', _attended,
    'attendance_pct', CASE WHEN _total_lessons > 0 THEN ROUND((_attended::numeric / _total_lessons) * 100, 1) ELSE 0 END,
    'total_assignments', _total_assignments,
    'assignments_submitted', _submitted,
    'assignment_pct', CASE WHEN _total_assignments > 0 THEN ROUND((_submitted::numeric / _total_assignments) * 100, 1) ELSE 0 END,
    'assignments_required', _req_assignments,
    'assignments_passed', _passed_assignments,
    'presentations_required', _req_presentations,
    'presentations_passed', _passed_presentations,
    'graduation_status', COALESCE(_graduation_status, 'pending')
  );
END;
$$;


ALTER FUNCTION "public"."get_student_progress"("p_student_id" "uuid", "p_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _is_invited_admin boolean;
  _inviter_hub_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');

  UPDATE public.enrollments
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL;

  SELECT EXISTS (
    SELECT 1 FROM public.pending_admin_invites
    WHERE LOWER(email) = LOWER(NEW.email) AND accepted_at IS NULL
  ) INTO _is_invited_admin;

  IF _is_invited_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;

    UPDATE public.pending_admin_invites
    SET accepted_at = now()
    WHERE LOWER(email) = LOWER(NEW.email);

    -- Add new admin to the same hub as their inviter
    SELECT hm.hub_id INTO _inviter_hub_id
    FROM public.pending_admin_invites pai
    JOIN public.hub_members hm ON hm.user_id = pai.invited_by
    WHERE LOWER(pai.email) = LOWER(NEW.email)
    LIMIT 1;

    IF _inviter_hub_id IS NOT NULL THEN
      INSERT INTO public.hub_members (hub_id, user_id, hub_role)
      VALUES (_inviter_hub_id, NEW.id, 'admin')
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.hub_members hm
    WHERE hm.user_id = _user_id
      AND hm.demo_expires_at IS NOT NULL
      AND hm.demo_expires_at <= now()
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_admin"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _target_user_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can invite admins';
  END IF;

  SELECT id INTO _target_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %. They must sign up first.', p_email;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, 'admin'::app_role)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'invite_admin', 'user', _target_user_id,
          jsonb_build_object('email', p_email));
END;
$$;


ALTER FUNCTION "public"."invite_admin"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoice_in_my_hub"("_invoice_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.enrollments e ON e.id = i.enrollment_id
    JOIN public.programs p ON p.id = e.program_id
    WHERE i.id = _invoice_id AND p.hub_id = public.get_my_hub_id());
END; $$;


ALTER FUNCTION "public"."invoice_in_my_hub"("_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoice_is_mine"("_invoice_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.enrollments e ON e.id = i.enrollment_id
    WHERE i.id = _invoice_id AND e.user_id = auth.uid());
END; $$;


ALTER FUNCTION "public"."invoice_is_mine"("_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_cohort_member"("_user_id" "uuid", "_cohort_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE cohort_id = _cohort_id AND user_id = _user_id
  );
$$;


ALTER FUNCTION "public"."is_cohort_member"("_user_id" "uuid", "_cohort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = auth.uid());
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = _user_id);
$$;


ALTER FUNCTION "public"."is_superadmin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_enrollment_to_user"("p_enrollment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.enrollments
  SET user_id = auth.uid()
  WHERE id = p_enrollment_id
    AND user_id IS NULL
    AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()));
END;
$$;


ALTER FUNCTION "public"."link_enrollment_to_user"("p_enrollment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_admins"() RETURNS TABLE("user_id" "uuid", "email" "text", "is_super" boolean, "pending" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can list admins';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT u.id AS user_id, u.email::text AS email, public.is_superadmin(u.id) AS is_super, false AS pending
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role = 'admin'::app_role
    UNION ALL
    SELECT NULL::uuid, pi.email, false, true
    FROM public.pending_admin_invites pi
    WHERE pi.accepted_at IS NULL
  ) t
  ORDER BY t.pending, t.email;
END;
$$;


ALTER FUNCTION "public"."list_admins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_audit_logs"("p_limit" integer DEFAULT 200) RETURNS TABLE("id" "uuid", "user_id" "uuid", "user_email" "text", "action" "text", "entity_type" "text", "entity_id" "uuid", "details" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view audit logs';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN QUERY
  SELECT al.id, al.user_id, u.email::text,
         al.action, al.entity_type, al.entity_id, al.details, al.created_at
  FROM public.audit_logs al
  LEFT JOIN auth.users u ON u.id = al.user_id
  WHERE al.user_id IN (
    SELECT hm.user_id FROM public.hub_members hm WHERE hm.hub_id = _hub
  )
  ORDER BY al.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;


ALTER FUNCTION "public"."list_audit_logs"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_crm_owners"() RETURNS TABLE("user_id" "uuid", "full_name" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.user_id, p.full_name, p.email FROM public.hub_members hm JOIN public.profiles p ON p.user_id=hm.user_id
  WHERE public.can_manage_crm() AND hm.hub_id=public.get_my_hub_id()
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=hm.user_id AND ur.role::text IN ('admin','marketing'))
  ORDER BY p.full_name NULLS LAST, p.email;
$$;


ALTER FUNCTION "public"."list_crm_owners"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_hubs"() RETURNS TABLE("id" "uuid", "name" "text", "slug" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmins can list all hubs';
  END IF;
  RETURN QUERY SELECT h.id, h.name::text, h.slug::text FROM public.hubs h ORDER BY h.name;
END;
$$;


ALTER FUNCTION "public"."list_hubs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_outstanding_invoices"("p_only_overdue" boolean DEFAULT false) RETURNS TABLE("invoice_id" "uuid", "invoice_number" "text", "enrollment_id" "uuid", "full_name" "text", "email" "text", "phone" "text", "program_name" "text", "cohort_label" "text", "total_amount" numeric, "amount_paid" numeric, "outstanding" numeric, "next_due_date" "date", "earliest_overdue_date" "date", "days_overdue" integer, "is_overdue" boolean, "invoice_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view outstanding invoices';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN QUERY
  WITH hub_invoices AS (
    SELECT inv.id            AS inv_id,
           inv.invoice_number AS inv_number,
           inv.total_amount  AS inv_total,
           inv.status        AS inv_status,
           e.id              AS enr_id,
           e.full_name       AS enr_name,
           e.email           AS enr_email,
           e.phone           AS enr_phone,
           pr.program_name   AS prog_name,
           c.cohort_label    AS coh_label
    FROM public.invoices inv
    JOIN public.enrollments e  ON e.id  = inv.enrollment_id
    JOIN public.programs    pr ON pr.id = e.program_id
    LEFT JOIN public.cohorts c ON c.id  = e.cohort_id
    WHERE pr.hub_id = _hub
      AND inv.status NOT IN ('paid', 'cancelled', 'draft')
  ),
  pay_agg AS (
    SELECT ap.inv_id, SUM(ap.paid_amt) AS paid_amt
    FROM (
      SELECT p.invoice_id AS inv_id, p.amount AS paid_amt
      FROM public.payments p
      WHERE p.invoice_id IN (SELECT hi.inv_id FROM hub_invoices hi)
      UNION ALL
      SELECT inst.invoice_id, inst.amount
      FROM public.installments inst
      WHERE inst.status = 'paid'
        AND inst.invoice_id IN (SELECT hi.inv_id FROM hub_invoices hi)
    ) ap
    GROUP BY ap.inv_id
  ),
  inst_agg AS (
    SELECT i.invoice_id AS inv_id,
           MIN(CASE WHEN i.status = 'pending' THEN i.due_date END)                               AS next_due,
           MIN(CASE WHEN i.status = 'pending' AND i.due_date < CURRENT_DATE THEN i.due_date END) AS earliest_overdue
    FROM public.installments i
    WHERE i.invoice_id IN (SELECT hi.inv_id FROM hub_invoices hi)
    GROUP BY i.invoice_id
  )
  SELECT
    hi.inv_id,
    hi.inv_number,
    hi.enr_id,
    hi.enr_name,
    hi.enr_email,
    hi.enr_phone,
    hi.prog_name,
    hi.coh_label,
    hi.inv_total,
    COALESCE(pa.paid_amt, 0)::numeric,
    GREATEST(hi.inv_total - COALESCE(pa.paid_amt, 0), 0)::numeric,
    ia.next_due,
    ia.earliest_overdue,
    CASE WHEN ia.earliest_overdue IS NOT NULL
         THEN (CURRENT_DATE - ia.earliest_overdue)::integer
         ELSE 0 END,
    (ia.earliest_overdue IS NOT NULL OR hi.inv_status = 'overdue'),
    hi.inv_status::text
  FROM hub_invoices hi
  LEFT JOIN pay_agg  pa ON pa.inv_id = hi.inv_id
  LEFT JOIN inst_agg ia ON ia.inv_id = hi.inv_id
  WHERE (hi.inv_total - COALESCE(pa.paid_amt, 0)) > 0
    AND (NOT p_only_overdue OR ia.earliest_overdue IS NOT NULL OR hi.inv_status = 'overdue')
  ORDER BY ia.earliest_overdue NULLS LAST, ia.next_due NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."list_outstanding_invoices"("p_only_overdue" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_staff_users"() RETURNS TABLE("user_id" "uuid", "email" "text", "full_name" "text", "classrooms" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can list staff';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN QUERY
  SELECT DISTINCT
    ur.user_id,
    au.email::text,
    COALESCE(p.full_name, au.email)::text AS full_name,
    ARRAY_AGG(DISTINCT cl.name) FILTER (WHERE cl.name IS NOT NULL) AS classrooms
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN public.classroom_staff cs ON cs.user_id = ur.user_id AND cs.status = 'active'
  LEFT JOIN public.classrooms cl ON cl.id = cs.classroom_id AND cl.hub_id = _hub
  WHERE ur.role = 'staff'
    AND ur.user_id IN (
      SELECT cs2.user_id
      FROM public.classroom_staff cs2
      JOIN public.classrooms c ON c.id = cs2.classroom_id
      WHERE c.hub_id = _hub AND cs2.user_id IS NOT NULL
    )
  GROUP BY ur.user_id, au.email, p.full_name;
END;
$$;


ALTER FUNCTION "public"."list_staff_users"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "lesson_id" "uuid",
    "classroom_id" "uuid" NOT NULL,
    "cohort_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "enrollment_id" "uuid",
    "attendance_status" "text" DEFAULT 'present'::"text" NOT NULL,
    "method" "text" DEFAULT 'code'::"text" NOT NULL,
    "student_lat" numeric(10,7),
    "student_lng" numeric(10,7),
    "distance_metres" numeric(10,2),
    "geofence_passed" boolean,
    "marked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "schedule_id" "uuid",
    CONSTRAINT "attendance_records_attendance_status_check" CHECK (("attendance_status" = ANY (ARRAY['present'::"text", 'late'::"text", 'absent'::"text", 'excused'::"text"]))),
    CONSTRAINT "attendance_records_method_check" CHECK (("method" = ANY (ARRAY['code'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_attendance"("p_code" "text", "p_student_lat" numeric DEFAULT NULL::numeric, "p_student_lng" numeric DEFAULT NULL::numeric) RETURNS "public"."attendance_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _session public.attendance_sessions%ROWTYPE;
  _cls     public.classrooms%ROWTYPE;
  _enroll  public.enrollments%ROWTYPE;
  _dist    numeric;
  _geo_ok  boolean := true;
  _status  text := 'present';
  _record  public.attendance_records%ROWTYPE;
BEGIN
  -- Fetch session
  SELECT * INTO _session FROM public.attendance_sessions WHERE code = p_code;
  IF _session.id IS NULL THEN RAISE EXCEPTION 'Invalid attendance code'; END IF;
  IF _session.status <> 'open' THEN RAISE EXCEPTION 'Attendance session is closed'; END IF;
  IF _session.code_expires_at < now() THEN
    UPDATE public.attendance_sessions SET status = 'closed', closed_at = now() WHERE id = _session.id;
    RAISE EXCEPTION 'Attendance code has expired';
  END IF;

  -- Check student in classroom
  IF NOT EXISTS (
    SELECT 1 FROM public.classroom_students
    WHERE classroom_id = _session.classroom_id AND student_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not enrolled in this classroom';
  END IF;

  -- Check cohort if session is cohort-specific
  IF _session.cohort_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cohort_students
      WHERE cohort_id = _session.cohort_id AND student_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You are not in the cohort for this session';
    END IF;
  END IF;

  -- Fetch classroom for geofencing
  SELECT * INTO _cls FROM public.classrooms WHERE id = _session.classroom_id;

  -- Geofence check
  IF _cls.geofencing_enabled AND _cls.gps_lat IS NOT NULL THEN
    IF p_student_lat IS NULL OR p_student_lng IS NULL THEN
      RAISE EXCEPTION 'Location is required for this classroom attendance';
    END IF;
    -- Haversine distance in metres
    _dist := 6371000 * acos(
      LEAST(1.0, cos(radians(_cls.gps_lat)) * cos(radians(p_student_lat)) *
      cos(radians(p_student_lng) - radians(_cls.gps_lng)) +
      sin(radians(_cls.gps_lat)) * sin(radians(p_student_lat)))
    );
    _geo_ok := (_dist <= _cls.attendance_radius_metres);
    IF NOT _geo_ok THEN
      RAISE EXCEPTION 'You are %.0f metres from the classroom. Maximum allowed: % metres.',
        _dist, _cls.attendance_radius_metres;
    END IF;
  END IF;

  -- Late check (marked after this session's configured grace period from open)
  IF now() > (_session.created_at + (_session.late_after_mins || ' minutes')::interval) THEN
    _status := 'late';
  END IF;

  -- Enrollment lookup
  SELECT * INTO _enroll FROM public.enrollments
  WHERE user_id = auth.uid()
    AND program_id = (SELECT program_id FROM public.classrooms WHERE id = _session.classroom_id)
  LIMIT 1;

  INSERT INTO public.attendance_records(
    session_id, lesson_id, classroom_id, cohort_id,
    student_id, enrollment_id, attendance_status, method,
    student_lat, student_lng, distance_metres, geofence_passed
  ) VALUES (
    _session.id, _session.lesson_id, _session.classroom_id, _session.cohort_id,
    auth.uid(), _enroll.id, _status, 'code',
    p_student_lat, p_student_lng, _dist, _geo_ok
  )
  ON CONFLICT (session_id, student_id)
    DO UPDATE SET attendance_status = _status, marked_at = now()
  RETURNING * INTO _record;

  RETURN _record;
END;
$$;


ALTER FUNCTION "public"."mark_attendance"("p_code" "text", "p_student_lat" numeric, "p_student_lng" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."module_classroom_id"("_module_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return (
    select cu.classroom_id
    from public.modules m
    join public.tracks t on t.id = m.track_id
    join public.curricula cu on cu.id = t.curriculum_id
    where m.id = _module_id);
end; $$;


ALTER FUNCTION "public"."module_classroom_id"("_module_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."name_match_score"("p_bank_text" "text", "p_person" "text") RETURNS real
    LANGUAGE "sql" IMMUTABLE
    AS $$
  WITH words AS (
    SELECT w FROM unnest(string_to_array(upper(regexp_replace(COALESCE(p_person,''), '[^A-Za-z ]', ' ', 'g')), ' ')) AS w
    WHERE length(w) >= 3
  )
  SELECT CASE WHEN (SELECT count(*) FROM words) = 0 THEN 0::real
         ELSE (SELECT count(*) FILTER (WHERE upper(COALESCE(p_bank_text,'')) LIKE '%'||w||'%')::real
                      / count(*)::real FROM words)
         END;
$$;


ALTER FUNCTION "public"."name_match_score"("p_bank_text" "text", "p_person" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_target_month"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.target_month := date_trunc('month', NEW.target_month)::date;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."normalize_target_month"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifications_set_hub_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.hub_id IS NULL THEN
    IF NEW.enrollment_id IS NOT NULL THEN
      SELECT p.hub_id INTO NEW.hub_id
      FROM public.enrollments e
      JOIN public.programs p ON p.id = e.program_id
      WHERE e.id = NEW.enrollment_id;
    END IF;
    IF NEW.hub_id IS NULL THEN
      NEW.hub_id := public.get_my_hub_id();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notifications_set_hub_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_recurring_expense"("p_id" "uuid", "p_payment_date" "date" DEFAULT NULL::"date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r          public.recurring_expenses%ROWTYPE;
  _new_id    uuid;
  _post_date date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can post recurring expenses';
  END IF;

  SELECT * INTO r FROM public.recurring_expenses WHERE id = p_id AND active = true;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Recurring expense not found or inactive'; END IF;

  _post_date := COALESCE(p_payment_date, r.next_due_date);

  INSERT INTO public.expenses (category, vendor_name, amount, payment_date, payment_method, notes, recorded_by, hub_id)
  VALUES (r.category, r.vendor_name, r.amount, _post_date, r.payment_method,
          COALESCE(r.notes, '') || ' [recurring]', auth.uid(),
          public.get_my_hub_id())
  RETURNING id INTO _new_id;

  UPDATE public.recurring_expenses
     SET last_posted_date = _post_date,
         next_due_date    = public.compute_next_recurrence(r.next_due_date, r.frequency),
         updated_at       = now()
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'post_recurring', 'expense', _new_id,
          jsonb_build_object('recurring_id', p_id, 'amount', r.amount, 'date', _post_date));

  RETURN _new_id;
END;
$$;


ALTER FUNCTION "public"."post_recurring_expense"("p_id" "uuid", "p_payment_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_recurring_income"("p_id" "uuid", "p_payment_date" "date" DEFAULT NULL::"date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r          public.recurring_income%ROWTYPE;
  _new_id    uuid;
  _post_date date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can post recurring income';
  END IF;

  SELECT * INTO r FROM public.recurring_income WHERE id = p_id AND active = true;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Recurring income not found or inactive'; END IF;

  _post_date := COALESCE(p_payment_date, r.next_due_date);

  INSERT INTO public.other_income (category, payer_name, amount, payment_date, payment_method, notes, recorded_by, hub_id)
  VALUES (r.category, r.payer_name, r.amount, _post_date, r.payment_method,
          COALESCE(r.notes, '') || ' [recurring]', auth.uid(),
          public.get_my_hub_id())
  RETURNING id INTO _new_id;

  UPDATE public.recurring_income
     SET last_posted_date     = _post_date,
         next_due_date        = public.compute_next_recurrence(r.next_due_date, r.frequency),
         reminder_1d_sent_at  = NULL,
         reminder_3d_sent_at  = NULL,
         overdue_sent_at      = NULL,
         updated_at           = now()
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'post_recurring', 'other_income', _new_id,
          jsonb_build_object('recurring_id', p_id, 'amount', r.amount, 'date', _post_date));

  RETURN _new_id;
END;
$$;


ALTER FUNCTION "public"."post_recurring_income"("p_id" "uuid", "p_payment_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."presentation_classroom_id"("_presentation_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return (select p.classroom_id from public.presentations p where p.id = _presentation_id);
end; $$;


ALTER FUNCTION "public"."presentation_classroom_id"("_presentation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."programs_set_hub_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.hub_id IS NULL OR NEW.hub_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    NEW.hub_id := COALESCE(public.get_my_hub_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."programs_set_hub_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promote_staff_to_admin"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _hub_id uuid;
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can promote staff';
  END IF;

  SELECT c.hub_id INTO _hub_id
  FROM public.classroom_staff cs
  JOIN public.classrooms c ON c.id = cs.classroom_id
  WHERE cs.user_id = p_user_id
  LIMIT 1;

  IF _hub_id IS NULL THEN
    _hub_id := public.get_my_hub_id();
  END IF;

  INSERT INTO public.hub_members (hub_id, user_id, hub_role)
  VALUES (_hub_id, p_user_id, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET hub_id = _hub_id, hub_role = 'admin';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."promote_staff_to_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "normalized_email" "text" GENERATED ALWAYS AS ("lower"(TRIM(BOTH FROM "email"))) STORED,
    "phone" "text",
    "source_id" "uuid",
    "source_detail" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_content" "text",
    "referral_detail" "text",
    "program_interest_id" "uuid",
    "lifecycle_status" "text" DEFAULT 'new_lead'::"text" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "qualification" "text" DEFAULT 'cold'::"text" NOT NULL,
    "qualification_override" "text",
    "qualification_override_reason" "text",
    "owner_id" "uuid",
    "marketing_consent" boolean DEFAULT false NOT NULL,
    "consented_at" timestamp with time zone,
    "consent_source" "text",
    "suppressed_at" timestamp with time zone,
    "suppression_reason" "text",
    "next_follow_up_at" timestamp with time zone,
    "converted_at" timestamp with time zone,
    "enrollment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_leads_lifecycle_status_check" CHECK (("lifecycle_status" = ANY (ARRAY['new_lead'::"text", 'contacted'::"text", 'interested'::"text", 'follow_up'::"text", 'registered'::"text", 'not_interested'::"text"]))),
    CONSTRAINT "crm_leads_qualification_check" CHECK (("qualification" = ANY (ARRAY['cold'::"text", 'warm'::"text", 'hot'::"text"]))),
    CONSTRAINT "crm_leads_qualification_override_check" CHECK (("qualification_override" = ANY (ARRAY['cold'::"text", 'warm'::"text", 'hot'::"text"])))
);


ALTER TABLE "public"."crm_leads" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_lead_score"("p_lead_id" "uuid") RETURNS "public"."crm_leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_lead public.crm_leads; v_score integer; v_warm integer; v_hot integer; BEGIN
  SELECT * INTO v_lead FROM public.crm_leads WHERE id = p_lead_id FOR UPDATE;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF NOT public.can_manage_crm() AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'CRM access required'; END IF;
  SELECT COALESCE(sum(points), 0) INTO v_score FROM public.lead_score_events WHERE lead_id = p_lead_id;
  SELECT warm_threshold, hot_threshold INTO v_warm, v_hot FROM public.lead_scoring_settings WHERE hub_id = v_lead.hub_id;
  v_warm := COALESCE(v_warm, 30); v_hot := COALESCE(v_hot, 70);
  UPDATE public.crm_leads SET score = v_score,
    qualification = COALESCE(qualification_override, CASE WHEN v_score >= v_hot THEN 'hot' WHEN v_score >= v_warm THEN 'warm' ELSE 'cold' END),
    updated_at = now() WHERE id = p_lead_id RETURNING * INTO v_lead;
  RETURN v_lead;
END $$;


ALTER FUNCTION "public"."recalculate_lead_score"("p_lead_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_lead_score_event"("p_lead_id" "uuid", "p_event_type" "text", "p_external_key" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_lead public.crm_leads; v_rule public.lead_scoring_rules; v_count integer; BEGIN
  SELECT * INTO v_lead FROM public.crm_leads WHERE id = p_lead_id;
  SELECT * INTO v_rule FROM public.lead_scoring_rules WHERE hub_id = v_lead.hub_id AND event_type = p_event_type AND active;
  IF v_rule.id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_count FROM public.lead_score_events WHERE lead_id = p_lead_id AND event_type = p_event_type;
  IF v_rule.max_occurrences IS NOT NULL AND v_count >= v_rule.max_occurrences THEN RETURN; END IF;
  INSERT INTO public.lead_score_events(hub_id, lead_id, rule_id, event_type, points, external_key)
  VALUES(v_lead.hub_id, p_lead_id, v_rule.id, p_event_type, v_rule.points, p_external_key) ON CONFLICT DO NOTHING;
  PERFORM public.recalculate_lead_score(p_lead_id);
END $$;


ALTER FUNCTION "public"."record_lead_score_event"("p_lead_id" "uuid", "p_event_type" "text", "p_external_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_invoice_change"("p_request_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r public.invoice_change_requests%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can reject invoice changes';
  END IF;
  SELECT * INTO r FROM public.invoice_change_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request already %', r.status; END IF;

  UPDATE public.invoice_change_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reason = p_reason
   WHERE id = p_request_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'reject_invoice_change', 'invoice', r.invoice_id,
          jsonb_build_object('request_id', p_request_id, 'reason', p_reason));
END;
$$;


ALTER FUNCTION "public"."reject_invoice_change"("p_request_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_staff_invoice"("p_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can reject staff invoices';
  END IF;
  UPDATE public.staff_invoices
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
   WHERE id = p_id AND status = 'pending';

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'reject_staff_invoice', 'staff_invoice', p_id,
          jsonb_build_object('reason', p_reason));
END;
$$;


ALTER FUNCTION "public"."reject_staff_invoice"("p_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_invoice_change"("p_invoice_id" "uuid", "p_action" "text", "p_payload" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can request invoice changes';
  END IF;
  IF p_action NOT IN ('edit','delete') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.invoice_change_requests(invoice_id, action, payload, requested_by)
  VALUES (p_invoice_id, p_action, p_payload, auth.uid())
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'request_invoice_change', 'invoice', p_invoice_id,
          jsonb_build_object('request_id', _id, 'action', p_action));
  RETURN _id;
END;
$$;


ALTER FUNCTION "public"."request_invoice_change"("p_invoice_id" "uuid", "p_action" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_admin"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _target_user_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can revoke admins';
  END IF;

  SELECT id INTO _target_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %', p_email;
  END IF;

  IF public.is_superadmin(_target_user_id) THEN
    RAISE EXCEPTION 'Cannot revoke the superadmin';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin'::app_role;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'revoke_admin', 'user', _target_user_id,
          jsonb_build_object('email', p_email));
END;
$$;


ALTER FUNCTION "public"."revoke_admin"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_cohort_graduation_sweep"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _cohort record;
BEGIN
  FOR _cohort IN
    SELECT id FROM public.cohorts
    WHERE end_date IS NOT NULL AND end_date <= now() AND status <> 'archived'
  LOOP
    PERFORM public.compute_cohort_graduation(_cohort.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."run_cohort_graduation_sweep"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_crm_defaults"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_hub uuid := public.get_my_hub_id(); BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  INSERT INTO public.lead_scoring_settings(hub_id) VALUES(v_hub) ON CONFLICT DO NOTHING;
  INSERT INTO public.lead_sources(hub_id,name,slug) VALUES (v_hub,'Website','website'),(v_hub,'Facebook','facebook'),(v_hub,'WhatsApp','whatsapp'),(v_hub,'Referral','referral'),(v_hub,'Manual','manual') ON CONFLICT DO NOTHING;
  INSERT INTO public.lead_scoring_rules(hub_id,event_type,label,points,max_occurrences) VALUES
    (v_hub,'form_submission','Form submitted',10,2),(v_hub,'contacted','Contact recorded',10,3),(v_hub,'interested','Marked interested',25,1),
    (v_hub,'email_open','Email opened',2,5),(v_hub,'email_click','Email link clicked',8,5),(v_hub,'follow_up_completed','Follow-up completed',10,3),(v_hub,'conversion_intent','Conversion intent',30,1)
  ON CONFLICT DO NOTHING;
END $$;


ALTER FUNCTION "public"."seed_crm_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_graduation_override"("p_cohort_student_id" "uuid", "p_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _hub_id uuid;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('graduated','not_graduated') THEN
    RAISE EXCEPTION 'Invalid graduation status: %', p_status;
  END IF;

  SELECT public.get_cohort_classroom_hub_id(cs.cohort_id) INTO _hub_id
  FROM public.cohort_students cs WHERE cs.id = p_cohort_student_id;

  IF _hub_id IS NULL THEN
    RAISE EXCEPTION 'Cohort membership not found';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND _hub_id = public.get_my_hub_id())
  ) THEN
    RAISE EXCEPTION 'You do not have permission to override graduation status';
  END IF;

  UPDATE public.cohort_students
  SET graduation_override = p_status,
      graduation_override_by = auth.uid(),
      graduation_override_at = now(),
      graduation_override_reason = p_reason
  WHERE id = p_cohort_student_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), 'set_graduation_override', 'cohort_student', p_cohort_student_id,
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );
END;
$$;


ALTER FUNCTION "public"."set_graduation_override"("p_cohort_student_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_hub_id_from_context"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.hub_id IS NULL THEN
    NEW.hub_id := public.get_my_hub_id();
  END IF;
  IF NEW.hub_id IS NULL THEN
    SELECT cl.hub_id INTO NEW.hub_id
    FROM public.classroom_staff cs
    JOIN public.classrooms cl ON cl.id = cs.classroom_id
    WHERE cs.user_id = auth.uid() AND cs.status = 'active'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_hub_id_from_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_set_hub_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.hub_id IS NULL THEN
    NEW.hub_id := public.get_my_hub_id();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."staff_set_hub_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_enrollment_fields"("p_enrollment_id" "uuid", "p_fields" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_key text;
  v_value text;
  v_field_id uuid;
  v_full_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.id = p_enrollment_id AND e.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You may only update your own enrollment profile';
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_fields)
  LOOP
    SELECT cf.id INTO v_field_id
    FROM public.custom_fields cf
    JOIN public.enrollments e ON e.id = p_enrollment_id
    JOIN public.programs p ON p.id = e.program_id
    WHERE cf.key = v_key
      AND cf.active = true
      AND cf.visible_to_student = true
      AND (cf.hub_id IS NULL OR cf.hub_id = p.hub_id);

    IF v_field_id IS NOT NULL THEN
      INSERT INTO public.field_values (enrollment_id, field_id, value)
      VALUES (p_enrollment_id, v_field_id, NULLIF(btrim(v_value), ''))
      ON CONFLICT (enrollment_id, field_id) DO UPDATE SET value = EXCLUDED.value;
    END IF;
  END LOOP;

  IF p_fields ? 'first_name' AND p_fields ? 'surname' THEN
    v_full_name := concat_ws(' ', NULLIF(btrim(p_fields->>'first_name'), ''),
      NULLIF(btrim(p_fields->>'middle_name'), ''), NULLIF(btrim(p_fields->>'surname'), ''));
    UPDATE public.enrollments SET full_name = v_full_name WHERE id = p_enrollment_id;
    UPDATE public.profiles SET full_name = v_full_name WHERE user_id = auth.uid();
  END IF;
END;
$$;


ALTER FUNCTION "public"."submit_enrollment_fields"("p_enrollment_id" "uuid", "p_fields" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."suggest_bank_matches"("p_installment_id" "uuid", "p_day_window" integer DEFAULT 45) RETURNS TABLE("bank_transaction_id" "uuid", "occurred_at" timestamp with time zone, "amount" numeric, "payer" "text", "narration" "text", "name_similarity" real, "days_from_due" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT b.id, b.occurred_at, b.amount, b.payer, b.narration,
         GREATEST(
           public.name_match_score(b.payer,     e.full_name),
           public.name_match_score(b.narration, e.full_name)
         )                                                    AS name_similarity,
         (b.occurred_at::date - inst.due_date)                AS days_from_due
  FROM public.installments inst
  JOIN public.invoices    i ON i.id = inst.invoice_id
  JOIN public.enrollments e ON e.id = i.enrollment_id
  JOIN public.bank_transactions b
    ON b.hub_id = public.get_my_hub_id()
   AND b.kind = 'external'
   AND b.amount = inst.amount
   AND b.occurred_at::date BETWEEN inst.due_date - p_day_window AND inst.due_date + p_day_window
  WHERE inst.id = p_installment_id
    AND NOT EXISTS (SELECT 1 FROM public.installments x WHERE x.bank_transaction_id = b.id)
    AND NOT EXISTS (SELECT 1 FROM public.payments     y WHERE y.bank_transaction_id = b.id)
  ORDER BY name_similarity DESC, abs(b.occurred_at::date - inst.due_date)
  LIMIT 10;
$$;


ALTER FUNCTION "public"."suggest_bank_matches"("p_installment_id" "uuid", "p_day_window" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."switch_hub_context"("p_hub_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmins can switch hub context';
  END IF;

  INSERT INTO public.hub_members (user_id, hub_id, hub_role)
  VALUES (auth.uid(), p_hub_id, 'owner')
  ON CONFLICT (user_id) DO UPDATE SET hub_id = p_hub_id, hub_role = 'owner';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'switch_hub_context', 'hub', p_hub_id,
          jsonb_build_object('to_hub_id', p_hub_id, 'switched_at', now()));
END;
$$;


ALTER FUNCTION "public"."switch_hub_context"("p_hub_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."switch_student_classroom"("p_student_id" "uuid", "p_from_classroom_id" "uuid", "p_to_classroom_id" "uuid", "p_to_cohort_id" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _enrollment_id uuid;
  _from_name     text;
  _to_name       text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can switch student classrooms';
  END IF;

  IF p_from_classroom_id = p_to_classroom_id THEN
    RAISE EXCEPTION 'Source and destination classroom must differ';
  END IF;

  -- Carry the enrollment_id forward so the new row stays linked
  SELECT enrollment_id INTO _enrollment_id
  FROM public.classroom_students
  WHERE classroom_id = p_from_classroom_id AND student_id = p_student_id;

  -- Fallback: look it up from enrollments directly
  IF _enrollment_id IS NULL THEN
    SELECT id INTO _enrollment_id
    FROM public.enrollments
    WHERE user_id = p_student_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  SELECT name INTO _from_name FROM public.classrooms WHERE id = p_from_classroom_id;
  SELECT name INTO _to_name   FROM public.classrooms WHERE id = p_to_classroom_id;

  -- Remove from old classroom
  DELETE FROM public.classroom_students
  WHERE classroom_id = p_from_classroom_id AND student_id = p_student_id;

  -- Remove from every cohort that belongs to the old classroom
  DELETE FROM public.cohort_students
  WHERE student_id = p_student_id
    AND cohort_id IN (
      SELECT id FROM public.cohorts WHERE classroom_id = p_from_classroom_id
    );

  -- Add to new classroom
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  VALUES (p_to_classroom_id, p_student_id, _enrollment_id)
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  -- Optionally assign to a cohort in the new classroom
  IF p_to_cohort_id IS NOT NULL THEN
    INSERT INTO public.cohort_students (cohort_id, student_id, enrollment_id)
    VALUES (p_to_cohort_id, p_student_id, _enrollment_id)
    ON CONFLICT (cohort_id, student_id) DO NOTHING;
  END IF;

  -- Audit trail
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'switch_classroom',
    'classroom_students',
    p_student_id,
    jsonb_build_object(
      'student_id',          p_student_id,
      'from_classroom_id',   p_from_classroom_id,
      'from_classroom_name', _from_name,
      'to_classroom_id',     p_to_classroom_id,
      'to_classroom_name',   _to_name,
      'to_cohort_id',        p_to_cohort_id,
      'reason',              p_reason
    )
  );
END;
$$;


ALTER FUNCTION "public"."switch_student_classroom"("p_student_id" "uuid", "p_from_classroom_id" "uuid", "p_to_classroom_id" "uuid", "p_to_cohort_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_cohort_student_to_classroom"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.classroom_students (classroom_id, student_id, enrollment_id)
  SELECT co.classroom_id, NEW.student_id, NEW.enrollment_id
  FROM public.cohorts co
  WHERE co.id = NEW.cohort_id
    AND co.classroom_id IS NOT NULL
  ON CONFLICT (classroom_id, student_id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_cohort_student_to_classroom"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_enrollment_first_due_date"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _invoice_id uuid;
  _enrollment_id uuid;
  _first_due date;
BEGIN
  _invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT inv.enrollment_id INTO _enrollment_id
  FROM public.invoices inv
  WHERE inv.id = _invoice_id;

  IF _enrollment_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT MIN(inst.due_date)::date INTO _first_due
  FROM public.installments inst
  JOIN public.invoices inv ON inv.id = inst.invoice_id
  WHERE inv.enrollment_id = _enrollment_id;

  UPDATE public.enrollments
  SET first_payment_date = CASE WHEN _first_due IS NULL THEN NULL ELSE _first_due::timestamptz END,
      updated_at = now()
  WHERE id = _enrollment_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_enrollment_first_due_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_enrollment_to_crm_lead"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_hub uuid; v_lead uuid; BEGIN
  SELECT hub_id INTO v_hub FROM public.programs WHERE id=NEW.program_id;
  SELECT id INTO v_lead FROM public.crm_leads WHERE hub_id=v_hub AND normalized_email=lower(trim(NEW.email)) LIMIT 1;
  IF v_lead IS NOT NULL THEN
    UPDATE public.crm_leads SET lifecycle_status='registered',enrollment_id=NEW.id,converted_at=COALESCE(converted_at,now()),updated_at=now() WHERE id=v_lead;
    UPDATE public.marketing_campaign_enrollments SET status='stopped',stop_reason='converted',updated_at=now() WHERE lead_id=v_lead AND status IN ('active','paused');
    INSERT INTO public.lead_activities(hub_id,lead_id,activity_type,title,details) VALUES(v_hub,v_lead,'conversion','Enrollment linked',jsonb_build_object('enrollment_id',NEW.id));
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."sync_enrollment_to_crm_lead"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_classroom_id"("_track_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return (
    select cu.classroom_id
    from public.tracks t
    join public.curricula cu on cu.id = t.curriculum_id
    where t.id = _track_id);
end; $$;


ALTER FUNCTION "public"."track_classroom_id"("_track_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_crm_lead_campaign_eligibility"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN
  PERFORM public.evaluate_lead_campaigns(NEW.id); RETURN NEW;
END $$;


ALTER FUNCTION "public"."trg_crm_lead_campaign_eligibility"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unit_classroom_id"("_unit_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return (
    select cu.classroom_id
    from public.units u
    join public.modules m on m.id = u.module_id
    join public.tracks t on t.id = m.track_id
    join public.curricula cu on cu.id = t.curriculum_id
    where u.id = _unit_id);
end; $$;


ALTER FUNCTION "public"."unit_classroom_id"("_unit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unreconciled_bank_credits"("p_from" "date", "p_to" "date") RETURNS TABLE("id" "uuid", "occurred_at" timestamp with time zone, "amount" numeric, "payer" "text", "narration" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT b.id, b.occurred_at, b.amount, b.payer, b.narration
  FROM public.bank_transactions b
  WHERE b.hub_id = public.get_my_hub_id()
    AND b.kind = 'external'
    AND b.amount > 0
    AND b.occurred_at >= p_from AND b.occurred_at < (p_to + 1)
    AND NOT EXISTS (SELECT 1 FROM public.payments     p WHERE p.bank_transaction_id    = b.id)
    AND NOT EXISTS (SELECT 1 FROM public.installments i WHERE i.bank_transaction_id    = b.id)
  ORDER BY b.occurred_at;
$$;


ALTER FUNCTION "public"."unreconciled_bank_credits"("p_from" "date", "p_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_crm_lead"("p_full_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_source_slug" "text" DEFAULT 'manual'::"text", "p_marketing_consent" boolean DEFAULT false, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_qualification" "text" DEFAULT NULL::"text") RETURNS "public"."crm_leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_hub uuid := public.get_my_hub_id();
  v_source uuid;
  v_lead public.crm_leads;
BEGIN
  IF NOT public.can_manage_crm() THEN RAISE EXCEPTION 'CRM access required'; END IF;
  IF p_qualification IS NOT NULL AND p_qualification NOT IN ('cold', 'warm', 'hot') THEN
    RAISE EXCEPTION 'Invalid lead qualification';
  END IF;

  SELECT id INTO v_source FROM public.lead_sources WHERE hub_id = v_hub AND slug = lower(trim(p_source_slug));
  INSERT INTO public.crm_leads(
    hub_id, full_name, email, phone, source_id, marketing_consent, consented_at,
    consent_source, utm_source, utm_medium, utm_campaign, referral_detail,
    qualification_override, qualification_override_reason
  )
  VALUES(
    v_hub, trim(p_full_name), nullif(trim(p_email),''), nullif(trim(p_phone),''), v_source, p_marketing_consent,
    CASE WHEN p_marketing_consent THEN now() END, CASE WHEN p_marketing_consent THEN p_source_slug END,
    p_metadata->>'utm_source', p_metadata->>'utm_medium', p_metadata->>'utm_campaign', p_metadata->>'referral_detail',
    p_qualification, CASE WHEN p_qualification IS NOT NULL THEN 'Set during lead creation' END
  )
  ON CONFLICT (hub_id, normalized_email) WHERE normalized_email IS NOT NULL DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, crm_leads.phone),
    source_id = COALESCE(EXCLUDED.source_id, crm_leads.source_id),
    marketing_consent = crm_leads.marketing_consent OR EXCLUDED.marketing_consent,
    consented_at = CASE WHEN NOT crm_leads.marketing_consent AND EXCLUDED.marketing_consent THEN now() ELSE crm_leads.consented_at END,
    qualification_override = COALESCE(EXCLUDED.qualification_override, crm_leads.qualification_override),
    qualification_override_reason = COALESCE(EXCLUDED.qualification_override_reason, crm_leads.qualification_override_reason),
    updated_at = now()
  RETURNING * INTO v_lead;

  INSERT INTO public.lead_activities(hub_id, lead_id, activity_type, title, details, created_by)
  VALUES(v_hub, v_lead.id, CASE WHEN p_source_slug = 'manual' THEN 'created' ELSE 'form_submission' END, 'Lead captured', p_metadata, auth.uid());

  IF p_marketing_consent THEN
    INSERT INTO public.marketing_consent_history(hub_id, lead_id, consented, source)
    VALUES(v_hub, v_lead.id, true, p_source_slug);
  END IF;

  PERFORM public.record_lead_score_event(v_lead.id, 'form_submission', NULL);
  v_lead := public.recalculate_lead_score(v_lead.id);
  RETURN v_lead;
END $$;


ALTER FUNCTION "public"."upsert_crm_lead"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_source_slug" "text", "p_marketing_consent" boolean, "p_metadata" "jsonb", "p_qualification" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_rls_policy_backup_20260705" (
    "schemaname" "name",
    "tablename" "name",
    "policyname" "name",
    "cmd" "text",
    "roles" "name"[],
    "qual" "text" COLLATE "pg_catalog"."C",
    "with_check" "text" COLLATE "pg_catalog"."C",
    "backed_up_at" timestamp with time zone
);


ALTER TABLE "public"."_rls_policy_backup_20260705" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "file_url" "text",
    "resource_type" "text" DEFAULT 'file'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assignment_resources_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['file'::"text", 'link'::"text", 'pdf'::"text", 'video'::"text", 'image'::"text"])))
);


ALTER TABLE "public"."assignment_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "enrollment_id" "uuid",
    "submission_text" "text",
    "file_url" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "grade" "text",
    "feedback" "text",
    "graded_by" "uuid",
    "graded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "link_url" "text",
    "score" integer,
    CONSTRAINT "assignment_submissions_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'late'::"text", 'graded'::"text"])))
);


ALTER TABLE "public"."assignment_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "cohort_id" "uuid",
    "lesson_id" "uuid",
    "curriculum_lesson_id" "uuid",
    "title" "text" NOT NULL,
    "instructions" "text",
    "due_date" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unit_id" "uuid",
    "max_score" integer,
    "pass_score" integer,
    CONSTRAINT "assignments_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "account_number" "text" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "amount" numeric NOT NULL,
    "balance_after" numeric,
    "transaction_ref" "text" NOT NULL,
    "narration" "text",
    "payer" "text",
    "kind" "text" DEFAULT 'external'::"text" NOT NULL,
    "statement_source" "text",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bank_transactions_kind_check" CHECK (("kind" = ANY (ARRAY['external'::"text", 'internal_transfer'::"text", 'refund'::"text", 'fee'::"text"])))
);


ALTER TABLE "public"."bank_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."bank_transactions" IS 'Immutable bank statement rows. occurred_at is the only trustworthy answer to "when did this money arrive". Imported via scripts/import-bank-statement.mjs; re-import is idempotent on (account_number, transaction_ref).';



COMMENT ON COLUMN "public"."bank_transactions"."amount" IS 'Signed. Positive = credit. kind=internal_transfer marks credits from the company''s own second account for REVIEW, not exclusion: over Jan-Sep 2026 only N230,900 of the N1,019,600 received that way was money going back the other direction, so most of it is real income.';



CREATE TABLE IF NOT EXISTS "public"."classroom_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_staff_id" "uuid" NOT NULL,
    "can_create_lessons" boolean DEFAULT false NOT NULL,
    "can_edit_cohorts" boolean DEFAULT false NOT NULL,
    "can_schedule" boolean DEFAULT false NOT NULL,
    "can_create_assignments" boolean DEFAULT false NOT NULL,
    "can_start_attendance" boolean DEFAULT false NOT NULL,
    "can_view_students" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."classroom_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classroom_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_type" "text" DEFAULT 'non_teaching'::"text" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    CONSTRAINT "classroom_staff_staff_type_check" CHECK (("staff_type" = ANY (ARRAY['teaching'::"text", 'non_teaching'::"text"]))),
    CONSTRAINT "classroom_staff_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."classroom_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classroom_students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "enrollment_id" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."classroom_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classrooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "gps_lat" numeric(10,7),
    "gps_lng" numeric(10,7),
    "attendance_radius_metres" integer DEFAULT 100 NOT NULL,
    "geofencing_enabled" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid",
    CONSTRAINT "classrooms_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."classrooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cohort_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cohort_announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cohort_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cohort_messages_body_check" CHECK (("length"(TRIM(BOTH FROM "body")) > 0))
);


ALTER TABLE "public"."cohort_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cohort_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "scheduled_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "location" "text",
    "meeting_link" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cohort_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cohort_students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "enrollment_id" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "auto_graduation_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "graduation_override" "text",
    "graduation_override_by" "uuid",
    "graduation_override_at" timestamp with time zone,
    "graduation_override_reason" "text",
    "final_graduation_status" "text" GENERATED ALWAYS AS (COALESCE("graduation_override", "auto_graduation_status")) STORED,
    CONSTRAINT "cohort_students_auto_graduation_status_check" CHECK (("auto_graduation_status" = ANY (ARRAY['pending'::"text", 'graduated'::"text", 'not_graduated'::"text"]))),
    CONSTRAINT "cohort_students_graduation_override_check" CHECK (("graduation_override" = ANY (ARRAY['graduated'::"text", 'not_graduated'::"text"]))),
    CONSTRAINT "cohort_students_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'dropped'::"text"])))
);


ALTER TABLE "public"."cohort_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cohorts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "cohort_label" "text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "classroom_id" "uuid",
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "scope_type" "text",
    "scope_id" "uuid",
    "capacity" integer,
    "hub_id" "uuid" NOT NULL,
    CONSTRAINT "cohorts_capacity_check" CHECK ((("capacity" IS NULL) OR ("capacity" > 0))),
    CONSTRAINT "cohorts_scope_type_check" CHECK (("scope_type" = ANY (ARRAY['curriculum'::"text", 'track'::"text", 'module'::"text"]))),
    CONSTRAINT "cohorts_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'active'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."cohorts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curricula" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."curricula" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculum_lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "curriculum_week_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "objectives" "text",
    "lesson_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."curriculum_lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculum_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "curriculum_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "objectives" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_date" "date"
);


ALTER TABLE "public"."curriculum_weeks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."curriculums" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "uuid",
    "classroom_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."curriculums" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "key" "text" NOT NULL,
    "field_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "options" "jsonb",
    "required" boolean DEFAULT false NOT NULL,
    "visible_to_student" boolean DEFAULT true NOT NULL,
    "visible_to_organization" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid",
    CONSTRAINT "custom_fields_field_type_check" CHECK (("field_type" = ANY (ARRAY['text'::"text", 'textarea'::"text", 'select'::"text", 'date'::"text", 'number'::"text", 'checkbox'::"text", 'file'::"text"])))
);


ALTER TABLE "public"."custom_fields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrollment_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_month" "date" NOT NULL,
    "target_count" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid" NOT NULL
);


ALTER TABLE "public"."enrollment_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "program_id" "uuid" NOT NULL,
    "cohort_id" "uuid",
    "organization_id" "uuid",
    "enrollment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "amount_paid" numeric(12,2) DEFAULT 0 NOT NULL,
    "outstanding_balance" numeric(12,2) GENERATED ALWAYS AS (("total_amount" - "amount_paid")) STORED,
    "first_payment_date" timestamp with time zone,
    "last_payment_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_type" "text" DEFAULT 'offline'::"text" NOT NULL,
    "payment_evidence_url" "text",
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "address" "text",
    "guardian_name" "text",
    "guardian_phone" "text",
    "payment_status" "text" GENERATED ALWAYS AS (
CASE
    WHEN (COALESCE("amount_paid", (0)::numeric) = (0)::numeric) THEN 'unpaid'::"text"
    WHEN ((COALESCE("amount_paid", (0)::numeric) >= COALESCE("total_amount", (0)::numeric)) AND (COALESCE("total_amount", (0)::numeric) > (0)::numeric)) THEN 'paid'::"text"
    ELSE 'partial'::"text"
END) STORED,
    "phone_normalized" "text" GENERATED ALWAYS AS (NULLIF("right"("regexp_replace"(COALESCE("phone", ''::"text"), '[^0-9]'::"text", ''::"text", 'g'::"text"), 10), ''::"text")) STORED,
    "profile_requirements_version" integer DEFAULT 2 NOT NULL,
    CONSTRAINT "enrollments_enrollment_status_check" CHECK (("enrollment_status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'overdue'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."enrollments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."enrollments"."phone_normalized" IS 'Last 10 digits of phone, for duplicate detection. Nigerian numbers arrive as +234..., 0..., or with stray whitespace/tabs; the last 10 digits are the stable part. Not unique - siblings share a parent''s number.';



CREATE TABLE IF NOT EXISTS "public"."installments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at_actual" timestamp with time zone,
    "paid_at_source" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "bank_transaction_id" "uuid",
    "paid_by" "text",
    CONSTRAINT "installments_paid_at_source_check" CHECK (("paid_at_source" = ANY (ARRAY['bank_statement'::"text", 'paystack'::"text", 'staff_entered'::"text", 'inferred'::"text", 'other_account'::"text", 'unknown'::"text"]))),
    CONSTRAINT "installments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'overdue'::"text"])))
);


ALTER TABLE "public"."installments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."installments"."paid_at_source" IS 'Provenance of paid_at_actual. bank_statement/paystack are evidence; inferred is reasoned from amount+date+uniqueness; staff_entered is an assertion; other_account means it was paid into Moniepoint 8288325467, whose statement is not imported (so paid_at_actual stays NULL, but the row is explained); unknown means genuinely unexplained.';



COMMENT ON COLUMN "public"."installments"."paid_by" IS 'Name on the transfer when it is not the student''s own - parent, sibling, sponsor, employer. Leave NULL when the student paid themselves. This is the one fact reconciliation cannot recover later: the bank knows the sender, the LMS knows the student, and only the person at the desk knows they are connected.';



CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "enrollment_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "total_amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "payment_plan_type" "text" DEFAULT 'single'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_payment_plan_type_check" CHECK (("payment_plan_type" = ANY (ARRAY['single'::"text", 'installment'::"text"]))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'overdue'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_name" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid"
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."enrollments_needing_duplicate_review" WITH ("security_invoker"='true') AS
 WITH "live" AS (
         SELECT "e"."id",
            "e"."full_name",
            "e"."email",
            "e"."phone_normalized",
            "e"."program_id",
            "e"."created_at",
            "e"."amount_paid",
            ( SELECT "p"."program_name"
                   FROM "public"."programs" "p"
                  WHERE ("p"."id" = "e"."program_id")) AS "program_name",
            ( SELECT "count"(*) AS "count"
                   FROM ("public"."invoices" "i"
                     JOIN "public"."installments" "ins" ON (("ins"."invoice_id" = "i"."id")))
                  WHERE (("i"."enrollment_id" = "e"."id") AND ("i"."status" <> 'cancelled'::"text") AND ("ins"."status" = 'paid'::"text"))) AS "paid_installments",
            ( SELECT "count"(*) AS "count"
                   FROM ("public"."invoices" "i"
                     JOIN "public"."installments" "ins" ON (("ins"."invoice_id" = "i"."id")))
                  WHERE (("i"."enrollment_id" = "e"."id") AND ("i"."status" <> 'cancelled'::"text") AND ("ins"."status" = 'paid'::"text") AND ("ins"."bank_transaction_id" IS NOT NULL))) AS "bank_confirmed",
            ( SELECT "array_agg"(DISTINCT "w"."w" ORDER BY "w"."w") AS "array_agg"
                   FROM "unnest"("string_to_array"("upper"("regexp_replace"("e"."full_name", '[^A-Za-z ]'::"text", ' '::"text", 'g'::"text")), ' '::"text")) "w"("w")
                  WHERE ("length"("w"."w") >= 3)) AS "name_tokens"
           FROM "public"."enrollments" "e"
          WHERE (("e"."enrollment_status" <> 'cancelled'::"text") AND ("e"."phone_normalized" IS NOT NULL))
        ), "grp" AS (
         SELECT "live"."phone_normalized"
           FROM "live"
          GROUP BY "live"."phone_normalized"
         HAVING ("count"(*) > 1)
        )
 SELECT "l"."phone_normalized",
    "l"."id" AS "enrollment_id",
    "l"."full_name",
    "l"."email",
    "l"."program_name",
    "l"."created_at",
    "l"."amount_paid",
    "l"."paid_installments",
    "l"."bank_confirmed",
    ( SELECT "count"(*) AS "count"
           FROM "live" "o"
          WHERE (("o"."phone_normalized" = "l"."phone_normalized") AND ("o"."id" <> "l"."id") AND ("o"."name_tokens" @> "l"."name_tokens"))) AS "others_containing_this_name",
    ( SELECT "count"(*) AS "count"
           FROM "live" "o"
          WHERE (("o"."phone_normalized" = "l"."phone_normalized") AND ("o"."id" <> "l"."id"))) AS "others_on_this_number"
   FROM ("live" "l"
     JOIN "grp" "g" ON (("g"."phone_normalized" = "l"."phone_normalized")))
  ORDER BY "l"."phone_normalized", "l"."created_at";


ALTER VIEW "public"."enrollments_needing_duplicate_review" OWNER TO "postgres";


COMMENT ON VIEW "public"."enrollments_needing_duplicate_review" IS 'Enrollments sharing a phone number. A shared number is NOT proof of a duplicate - siblings share a parent''s phone. The discriminator that settled all six real cases is bank_confirmed: a phantom copy carries paid installments that NO deposit backs (0), while each real sibling has their own (>0). others_containing_this_name catches the name-permutation cases on top of that.';



CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "vendor_name" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "payment_method" "text",
    "payment_reference" "text",
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid"
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "enrollment_id" "uuid" NOT NULL,
    "field_id" "uuid" NOT NULL,
    "value" "text"
);


ALTER TABLE "public"."field_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token" "text" NOT NULL,
    "hub_role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "accepted_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_demo" boolean DEFAULT false NOT NULL,
    CONSTRAINT "hub_invitations_hub_role_check" CHECK (("hub_role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'manager'::"text"])))
);


ALTER TABLE "public"."hub_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "hub_role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "demo_expires_at" timestamp with time zone,
    CONSTRAINT "hub_members_hub_role_check" CHECK (("hub_role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'manager'::"text"])))
);


ALTER TABLE "public"."hub_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "contact_email" "text",
    "logo_url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "plan" "text" DEFAULT 'starter'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hubs_plan_check" CHECK (("plan" = ANY (ARRAY['starter'::"text", 'growth'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "hubs_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'trial'::"text"])))
);


ALTER TABLE "public"."hubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "payload" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoice_change_requests_action_check" CHECK (("action" = ANY (ARRAY['edit'::"text", 'delete'::"text"]))),
    CONSTRAINT "invoice_change_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."invoice_change_requests" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_follow_ups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "due_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_follow_ups_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."lead_follow_ups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_score_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "rule_id" "uuid",
    "event_type" "text" NOT NULL,
    "points" integer NOT NULL,
    "external_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_score_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_scoring_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "points" integer NOT NULL,
    "max_occurrences" integer,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_scoring_rules_max_occurrences_check" CHECK ((("max_occurrences" IS NULL) OR ("max_occurrences" > 0)))
);


ALTER TABLE "public"."lead_scoring_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_scoring_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "warm_threshold" integer DEFAULT 30 NOT NULL,
    "hot_threshold" integer DEFAULT 70 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_scoring_settings_check" CHECK (("hot_threshold" > "warm_threshold")),
    CONSTRAINT "lead_scoring_settings_warm_threshold_check" CHECK (("warm_threshold" >= 0))
);


ALTER TABLE "public"."lead_scoring_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_tag_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_tag_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT 'slate'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid",
    "curriculum_lesson_id" "uuid",
    "title" "text" NOT NULL,
    "file_url" "text",
    "material_type" "text" DEFAULT 'file'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lesson_materials_material_type_check" CHECK (("material_type" = ANY (ARRAY['pdf'::"text", 'video'::"text", 'link'::"text", 'image'::"text", 'file'::"text"])))
);


ALTER TABLE "public"."lesson_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "objectives" "text",
    "resources" "jsonb",
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "video_url" "text",
    "external_link" "text"
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaign_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "next_step_order" integer DEFAULT 1 NOT NULL,
    "next_send_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stop_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_campaign_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'completed'::"text", 'stopped'::"text"])))
);


ALTER TABLE "public"."marketing_campaign_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaign_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "step_order" integer NOT NULL,
    "delay_hours" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_campaign_steps_delay_hours_check" CHECK (("delay_hours" >= 0)),
    CONSTRAINT "marketing_campaign_steps_step_order_check" CHECK (("step_order" > 0))
);


ALTER TABLE "public"."marketing_campaign_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "entry_rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."marketing_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_consent_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "consented" boolean NOT NULL,
    "source" "text" NOT NULL,
    "ip_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."marketing_consent_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_email_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "campaign_enrollment_id" "uuid" NOT NULL,
    "campaign_step_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "provider_message_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    "bounced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_email" "text",
    "rendered_subject" "text",
    "rendered_html" "text"
);


ALTER TABLE "public"."marketing_email_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hub_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "html_body" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."marketing_email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "enrollment_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."old_lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "cohort_id" "uuid",
    "curriculum_lesson_id" "uuid",
    "title" "text" NOT NULL,
    "week_number" integer,
    "tutor_id" "uuid",
    "lesson_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "location" "text",
    "description" "text",
    "attendance_session_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lessons_attendance_session_status_check" CHECK (("attendance_session_status" = ANY (ARRAY['not_started'::"text", 'open'::"text", 'closed'::"text"]))),
    CONSTRAINT "lessons_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."old_lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_name" "text" NOT NULL,
    "organization_type" "text" DEFAULT 'sponsor'::"text" NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid",
    CONSTRAINT "organizations_organization_type_check" CHECK (("organization_type" = ANY (ARRAY['sponsor'::"text", 'partner'::"text", 'corporate'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."other_income" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "payer_name" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "payment_method" "text",
    "payment_reference" "text",
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid"
);


ALTER TABLE "public"."other_income" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "installment_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "payment_reference" "text" NOT NULL,
    "payment_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "paid_at_actual" timestamp with time zone,
    "paid_at_source" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "bank_transaction_id" "uuid",
    "paid_by" "text",
    CONSTRAINT "payments_paid_at_source_check" CHECK (("paid_at_source" = ANY (ARRAY['bank_statement'::"text", 'paystack'::"text", 'staff_entered'::"text", 'inferred'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payments"."paid_at_actual" IS 'When the money actually reached the bank. NULL = unknown, never a guess. Set only from a matched bank_transactions row or a payment-gateway timestamp.';



COMMENT ON COLUMN "public"."payments"."paid_at_source" IS 'Provenance of paid_at_actual. bank_statement/paystack are evidence; staff_entered is a human''s recollection; inferred is a backfill; unknown means no date evidence exists.';



COMMENT ON COLUMN "public"."payments"."paid_by" IS 'Name on the transfer when it is not the student''s own. See installments.paid_by.';



CREATE TABLE IF NOT EXISTS "public"."payroll_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "pay_month" "date" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payroll_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_admin_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone
);


ALTER TABLE "public"."pending_admin_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "enrollment_id" "uuid" NOT NULL,
    "installment_id" "uuid",
    "amount" numeric NOT NULL,
    "payment_reference" "text",
    "evidence_url" "text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_by" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pending_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presentation_grades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "presentation_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "score" integer,
    "feedback" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "graded_by" "uuid",
    "graded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presentation_grades_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'graded'::"text"])))
);


ALTER TABLE "public"."presentation_grades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presentations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "cohort_id" "uuid" NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "instructions" "text",
    "max_score" integer DEFAULT 100 NOT NULL,
    "pass_score" integer DEFAULT 50 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "presentations_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."presentations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "organization_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "vendor_name" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "end_date" "date",
    "next_due_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "last_posted_date" "date",
    "payment_method" "text",
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid",
    CONSTRAINT "recurring_expenses_freq_chk" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'monthly'::"text", 'yearly'::"text"])))
);


ALTER TABLE "public"."recurring_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_income" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "payer_name" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "end_date" "date",
    "next_due_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "last_posted_date" "date",
    "payment_method" "text",
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hub_id" "uuid",
    "overdue_sent_at" timestamp with time zone,
    CONSTRAINT "recurring_income_freq_chk" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'monthly'::"text", 'yearly'::"text"])))
);


ALTER TABLE "public"."recurring_income" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid",
    "cohort_id" "uuid",
    "classroom_id" "uuid" NOT NULL,
    "instructor_id" "uuid",
    "scheduled_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "location" "text",
    "meeting_link" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "module_id" "uuid",
    CONSTRAINT "schedules_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "role_title" "text",
    "base_salary" numeric DEFAULT 0 NOT NULL,
    "email" "text",
    "phone" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bank_name" "text",
    "account_number" "text",
    "program_id" "uuid",
    "hub_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid",
    "externally_funded" boolean DEFAULT false NOT NULL,
    "funder_name" "text"
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "classroom_id" "uuid" NOT NULL,
    "staff_type" "text" NOT NULL,
    "invited_by" "uuid",
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(24), 'hex'::"text") NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_invitations_staff_type_check" CHECK (("staff_type" = ANY (ARRAY['teaching'::"text", 'non_teaching'::"text"]))),
    CONSTRAINT "staff_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."staff_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid",
    "submitted_by" "uuid",
    "staff_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "evidence_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "expense_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_invoices_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."staff_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."superadmins" (
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."superadmins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "curriculum_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."assignment_resources"
    ADD CONSTRAINT "assignment_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_assignment_id_student_id_key" UNIQUE ("assignment_id", "student_id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_session_id_student_id_key" UNIQUE ("session_id", "student_id");



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_natural_key" UNIQUE ("account_number", "transaction_ref");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_permissions"
    ADD CONSTRAINT "classroom_permissions_classroom_staff_id_key" UNIQUE ("classroom_staff_id");



ALTER TABLE ONLY "public"."classroom_permissions"
    ADD CONSTRAINT "classroom_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_staff"
    ADD CONSTRAINT "classroom_staff_classroom_id_staff_id_key" UNIQUE ("classroom_id", "staff_id");



ALTER TABLE ONLY "public"."classroom_staff"
    ADD CONSTRAINT "classroom_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classroom_students"
    ADD CONSTRAINT "classroom_students_classroom_id_student_id_key" UNIQUE ("classroom_id", "student_id");



ALTER TABLE ONLY "public"."classroom_students"
    ADD CONSTRAINT "classroom_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classrooms"
    ADD CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cohort_announcements"
    ADD CONSTRAINT "cohort_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cohort_messages"
    ADD CONSTRAINT "cohort_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cohort_schedules"
    ADD CONSTRAINT "cohort_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cohort_students"
    ADD CONSTRAINT "cohort_students_cohort_id_student_id_key" UNIQUE ("cohort_id", "student_id");



ALTER TABLE ONLY "public"."cohort_students"
    ADD CONSTRAINT "cohort_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curricula"
    ADD CONSTRAINT "curricula_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculum_lessons"
    ADD CONSTRAINT "curriculum_lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculum_weeks"
    ADD CONSTRAINT "curriculum_weeks_curriculum_id_week_number_key" UNIQUE ("curriculum_id", "week_number");



ALTER TABLE ONLY "public"."curriculum_weeks"
    ADD CONSTRAINT "curriculum_weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."curriculums"
    ADD CONSTRAINT "curriculums_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_fields"
    ADD CONSTRAINT "custom_fields_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."custom_fields"
    ADD CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrollment_targets"
    ADD CONSTRAINT "enrollment_targets_hub_month_key" UNIQUE ("hub_id", "target_month");



ALTER TABLE ONLY "public"."enrollment_targets"
    ADD CONSTRAINT "enrollment_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_values"
    ADD CONSTRAINT "field_values_enrollment_field_unique" UNIQUE ("enrollment_id", "field_id");



ALTER TABLE ONLY "public"."field_values"
    ADD CONSTRAINT "field_values_enrollment_id_field_id_key" UNIQUE ("enrollment_id", "field_id");



ALTER TABLE ONLY "public"."field_values"
    ADD CONSTRAINT "field_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_invitations"
    ADD CONSTRAINT "hub_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_invitations"
    ADD CONSTRAINT "hub_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."hubs"
    ADD CONSTRAINT "hubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hubs"
    ADD CONSTRAINT "hubs_slug_key" UNIQUE ("slug");



ALTER TABLE "public"."installments"
    ADD CONSTRAINT "installments_amount_not_placeholder" CHECK (("amount" >= (1000)::numeric)) NOT VALID;



ALTER TABLE ONLY "public"."installments"
    ADD CONSTRAINT "installments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_change_requests"
    ADD CONSTRAINT "invoice_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_follow_ups"
    ADD CONSTRAINT "lead_follow_ups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_score_events"
    ADD CONSTRAINT "lead_score_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_scoring_rules"
    ADD CONSTRAINT "lead_scoring_rules_hub_id_event_type_key" UNIQUE ("hub_id", "event_type");



ALTER TABLE ONLY "public"."lead_scoring_rules"
    ADD CONSTRAINT "lead_scoring_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_scoring_settings"
    ADD CONSTRAINT "lead_scoring_settings_hub_id_key" UNIQUE ("hub_id");



ALTER TABLE ONLY "public"."lead_scoring_settings"
    ADD CONSTRAINT "lead_scoring_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_sources"
    ADD CONSTRAINT "lead_sources_hub_id_slug_key" UNIQUE ("hub_id", "slug");



ALTER TABLE ONLY "public"."lead_sources"
    ADD CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_lead_id_tag_id_key" UNIQUE ("lead_id", "tag_id");



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_hub_id_name_key" UNIQUE ("hub_id", "name");



ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_materials"
    ADD CONSTRAINT "lesson_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."old_lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaign_enrollments"
    ADD CONSTRAINT "marketing_campaign_enrollments_campaign_id_lead_id_key" UNIQUE ("campaign_id", "lead_id");



ALTER TABLE ONLY "public"."marketing_campaign_enrollments"
    ADD CONSTRAINT "marketing_campaign_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaign_steps"
    ADD CONSTRAINT "marketing_campaign_steps_campaign_id_step_order_key" UNIQUE ("campaign_id", "step_order");



ALTER TABLE ONLY "public"."marketing_campaign_steps"
    ADD CONSTRAINT "marketing_campaign_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_consent_history"
    ADD CONSTRAINT "marketing_consent_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_email_deliveries"
    ADD CONSTRAINT "marketing_email_deliveries_campaign_enrollment_id_campaign__key" UNIQUE ("campaign_enrollment_id", "campaign_step_id");



ALTER TABLE ONLY "public"."marketing_email_deliveries"
    ADD CONSTRAINT "marketing_email_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_email_deliveries"
    ADD CONSTRAINT "marketing_email_deliveries_provider_message_id_key" UNIQUE ("provider_message_id");



ALTER TABLE ONLY "public"."marketing_email_templates"
    ADD CONSTRAINT "marketing_email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."other_income"
    ADD CONSTRAINT "other_income_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payment_reference_key" UNIQUE ("payment_reference");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_staff_id_pay_month_key" UNIQUE ("staff_id", "pay_month");



ALTER TABLE ONLY "public"."pending_admin_invites"
    ADD CONSTRAINT "pending_admin_invites_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."pending_admin_invites"
    ADD CONSTRAINT "pending_admin_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_payments"
    ADD CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presentation_grades"
    ADD CONSTRAINT "presentation_grades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presentation_grades"
    ADD CONSTRAINT "presentation_grades_presentation_id_student_id_key" UNIQUE ("presentation_id", "student_id");



ALTER TABLE ONLY "public"."presentations"
    ADD CONSTRAINT "presentations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presentations"
    ADD CONSTRAINT "presentations_schedule_id_key" UNIQUE ("schedule_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_income"
    ADD CONSTRAINT "recurring_income_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."staff_invoices"
    ADD CONSTRAINT "staff_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."tracks"
    ADD CONSTRAINT "tracks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



CREATE UNIQUE INDEX "classrooms_one_per_program" ON "public"."classrooms" USING "btree" ("program_id") WHERE ("program_id" IS NOT NULL);



CREATE INDEX "crm_leads_follow_up_idx" ON "public"."crm_leads" USING "btree" ("hub_id", "next_follow_up_at") WHERE ("next_follow_up_at" IS NOT NULL);



CREATE UNIQUE INDEX "crm_leads_hub_email_unique" ON "public"."crm_leads" USING "btree" ("hub_id", "normalized_email") WHERE ("normalized_email" IS NOT NULL);



CREATE INDEX "crm_leads_hub_status_idx" ON "public"."crm_leads" USING "btree" ("hub_id", "lifecycle_status", "qualification");



CREATE INDEX "idx_assignment_resources_assignment_id" ON "public"."assignment_resources" USING "btree" ("assignment_id");



CREATE INDEX "idx_assignment_submissions_assignment_student" ON "public"."assignment_submissions" USING "btree" ("assignment_id", "student_id");



CREATE INDEX "idx_assignment_submissions_student_id" ON "public"."assignment_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_assignments_classroom_created_at" ON "public"."assignments" USING "btree" ("classroom_id", "created_at" DESC);



CREATE INDEX "idx_assignments_classroom_status_due_date" ON "public"."assignments" USING "btree" ("classroom_id", "status", "due_date");



CREATE INDEX "idx_audit_logs_user_created" ON "public"."audit_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_bank_transactions_amount" ON "public"."bank_transactions" USING "btree" ("amount") WHERE ("kind" = 'external'::"text");



CREATE INDEX "idx_bank_transactions_hub_occurred" ON "public"."bank_transactions" USING "btree" ("hub_id", "occurred_at" DESC);



CREATE INDEX "idx_classroom_permissions_staff_assignments" ON "public"."classroom_permissions" USING "btree" ("classroom_staff_id", "can_create_assignments");



CREATE INDEX "idx_classroom_staff_classroom_user_status_type" ON "public"."classroom_staff" USING "btree" ("classroom_id", "user_id", "status", "staff_type");



CREATE INDEX "idx_classroom_staff_user_classroom_status" ON "public"."classroom_staff" USING "btree" ("user_id", "classroom_id", "status");



CREATE INDEX "idx_classroom_students_student" ON "public"."classroom_students" USING "btree" ("student_id");



CREATE INDEX "idx_cohort_announcements_cohort" ON "public"."cohort_announcements" USING "btree" ("cohort_id", "created_at" DESC);



CREATE INDEX "idx_cohort_messages_cohort" ON "public"."cohort_messages" USING "btree" ("cohort_id", "created_at");



CREATE INDEX "idx_cohort_schedules_cohort" ON "public"."cohort_schedules" USING "btree" ("cohort_id", "scheduled_date", "start_time");



CREATE INDEX "idx_cohort_students_student_cohort" ON "public"."cohort_students" USING "btree" ("student_id", "cohort_id");



CREATE INDEX "idx_cohorts_hub_id" ON "public"."cohorts" USING "btree" ("hub_id");



CREATE INDEX "idx_cohorts_program_id" ON "public"."cohorts" USING "btree" ("program_id");



CREATE INDEX "idx_custom_fields_hub_id" ON "public"."custom_fields" USING "btree" ("hub_id");



CREATE INDEX "idx_enrollments_cohort_id" ON "public"."enrollments" USING "btree" ("cohort_id");



CREATE INDEX "idx_enrollments_payment_status" ON "public"."enrollments" USING "btree" ("payment_status");



CREATE INDEX "idx_enrollments_phone_normalized" ON "public"."enrollments" USING "btree" ("phone_normalized") WHERE ("phone_normalized" IS NOT NULL);



CREATE INDEX "idx_enrollments_user_program_status" ON "public"."enrollments" USING "btree" ("user_id", "program_id", "enrollment_status");



CREATE INDEX "idx_expenses_hub_id" ON "public"."expenses" USING "btree" ("hub_id");



CREATE INDEX "idx_hub_members_hub_id" ON "public"."hub_members" USING "btree" ("hub_id");



CREATE INDEX "idx_hub_members_user_id" ON "public"."hub_members" USING "btree" ("user_id");



CREATE INDEX "idx_installments_invoice_id_status" ON "public"."installments" USING "btree" ("invoice_id", "status");



CREATE INDEX "idx_installments_paid_at_actual" ON "public"."installments" USING "btree" ("paid_at_actual") WHERE ("paid_at_actual" IS NOT NULL);



CREATE INDEX "idx_installments_paid_by" ON "public"."installments" USING "btree" ("lower"("paid_by")) WHERE ("paid_by" IS NOT NULL);



CREATE INDEX "idx_invoices_created_at" ON "public"."invoices" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_invoices_enrollment_id" ON "public"."invoices" USING "btree" ("enrollment_id");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_notifications_enrollment_type_created" ON "public"."notifications" USING "btree" ("enrollment_id", "type", "created_at");



CREATE INDEX "idx_notifications_hub_id" ON "public"."notifications" USING "btree" ("hub_id");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_other_income_date" ON "public"."other_income" USING "btree" ("payment_date");



CREATE INDEX "idx_other_income_hub_id" ON "public"."other_income" USING "btree" ("hub_id");



CREATE INDEX "idx_payments_created_at" ON "public"."payments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_payments_invoice_id" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_payments_paid_at_actual" ON "public"."payments" USING "btree" ("paid_at_actual") WHERE ("paid_at_actual" IS NOT NULL);



CREATE INDEX "idx_payroll_runs_month" ON "public"."payroll_runs" USING "btree" ("pay_month");



CREATE INDEX "idx_pending_payments_created_at" ON "public"."pending_payments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pending_payments_enrollment_id" ON "public"."pending_payments" USING "btree" ("enrollment_id");



CREATE INDEX "idx_pending_payments_invoice_id" ON "public"."pending_payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_pending_payments_status" ON "public"."pending_payments" USING "btree" ("status");



CREATE INDEX "idx_programs_hub_id" ON "public"."programs" USING "btree" ("hub_id");



CREATE INDEX "idx_schedules_classroom_date_time" ON "public"."schedules" USING "btree" ("classroom_id", "scheduled_date", "start_time");



CREATE INDEX "idx_schedules_classroom_status_date" ON "public"."schedules" USING "btree" ("classroom_id", "status", "scheduled_date");



CREATE INDEX "idx_staff_hub_id" ON "public"."staff" USING "btree" ("hub_id");



CREATE INDEX "lead_activities_timeline_idx" ON "public"."lead_activities" USING "btree" ("lead_id", "occurred_at" DESC);



CREATE INDEX "lead_follow_ups_due_idx" ON "public"."lead_follow_ups" USING "btree" ("hub_id", "status", "due_at");



CREATE UNIQUE INDEX "lead_score_event_external_unique" ON "public"."lead_score_events" USING "btree" ("lead_id", "event_type", "external_key") WHERE ("external_key" IS NOT NULL);



CREATE UNIQUE INDEX "uq_enrollments_email_program_active" ON "public"."enrollments" USING "btree" ("lower"("email"), "program_id") WHERE ("enrollment_status" <> ALL (ARRAY['cancelled'::"text", 'withdrawn'::"text"]));



CREATE OR REPLACE TRIGGER "enforce_admin_role_grant_trg" BEFORE INSERT OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_admin_role_grant"();



CREATE OR REPLACE TRIGGER "normalize_enrollment_target_month" BEFORE INSERT OR UPDATE ON "public"."enrollment_targets" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_target_month"();



CREATE OR REPLACE TRIGGER "other_income_updated_at" BEFORE UPDATE ON "public"."other_income" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "payroll_runs_updated_at" BEFORE UPDATE ON "public"."payroll_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_enrollment_targets_updated_at" BEFORE UPDATE ON "public"."enrollment_targets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_invoice_number" BEFORE INSERT ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."generate_invoice_number"();



CREATE OR REPLACE TRIGGER "staff_updated_at" BEFORE UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "sync_enrollment_first_due_date_on_installments" AFTER INSERT OR DELETE OR UPDATE OF "due_date", "invoice_id" ON "public"."installments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_enrollment_first_due_date"();



CREATE OR REPLACE TRIGGER "trg_auto_enroll_on_classroom_program" AFTER INSERT OR UPDATE OF "program_id" ON "public"."classrooms" FOR EACH ROW EXECUTE FUNCTION "public"."auto_enroll_on_classroom_program"();



CREATE OR REPLACE TRIGGER "trg_auto_enroll_student_in_classrooms" AFTER INSERT OR UPDATE OF "user_id", "enrollment_status", "cohort_id" ON "public"."enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."auto_enroll_student_in_classrooms"();



CREATE OR REPLACE TRIGGER "trg_backfill_classroom_students_on_insert" AFTER INSERT ON "public"."classrooms" FOR EACH ROW EXECUTE FUNCTION "public"."backfill_classroom_students_on_classroom_insert"();



CREATE OR REPLACE TRIGGER "trg_bank_transactions_set_hub_id" BEFORE INSERT ON "public"."bank_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_cohorts_set_hub_id" BEFORE INSERT ON "public"."cohorts" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_crm_lead_campaign_eligibility" AFTER INSERT OR UPDATE OF "qualification", "lifecycle_status", "source_id", "marketing_consent", "suppressed_at" ON "public"."crm_leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_crm_lead_campaign_eligibility"();



CREATE OR REPLACE TRIGGER "trg_crm_leads_set_hub_id" BEFORE INSERT ON "public"."crm_leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_custom_fields_set_hub_id" BEFORE INSERT ON "public"."custom_fields" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_enrollment_sync_crm" AFTER INSERT OR UPDATE OF "email", "program_id" ON "public"."enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_enrollment_to_crm_lead"();



CREATE OR REPLACE TRIGGER "trg_expenses_set_hub_id" BEFORE INSERT ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_invoice_change_requests_updated" BEFORE UPDATE ON "public"."invoice_change_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_lead_activities_set_hub_id" BEFORE INSERT ON "public"."lead_activities" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_lead_follow_ups_set_hub_id" BEFORE INSERT ON "public"."lead_follow_ups" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_lead_score_events_set_hub_id" BEFORE INSERT ON "public"."lead_score_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_lead_scoring_rules_set_hub_id" BEFORE INSERT ON "public"."lead_scoring_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_lead_scoring_settings_set_hub_id" BEFORE INSERT ON "public"."lead_scoring_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_lead_sources_set_hub_id" BEFORE INSERT ON "public"."lead_sources" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_lead_tag_assignments_set_hub_id" BEFORE INSERT ON "public"."lead_tag_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_lead_tags_set_hub_id" BEFORE INSERT ON "public"."lead_tags" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_marketing_campaign_enrollments_set_hub_id" BEFORE INSERT ON "public"."marketing_campaign_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_marketing_campaign_steps_set_hub_id" BEFORE INSERT ON "public"."marketing_campaign_steps" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_marketing_campaigns_set_hub_id" BEFORE INSERT ON "public"."marketing_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_marketing_consent_history_set_hub_id" BEFORE INSERT ON "public"."marketing_consent_history" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_marketing_email_deliveries_set_hub_id" BEFORE INSERT ON "public"."marketing_email_deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_marketing_email_templates_set_hub_id" BEFORE INSERT ON "public"."marketing_email_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_notifications_set_hub_id" BEFORE INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."notifications_set_hub_id"();



CREATE OR REPLACE TRIGGER "trg_organizations_set_hub_id" BEFORE INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_other_income_set_hub_id" BEFORE INSERT ON "public"."other_income" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_pending_payments_updated" BEFORE UPDATE ON "public"."pending_payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_programs_set_hub_id" BEFORE INSERT ON "public"."programs" FOR EACH ROW EXECUTE FUNCTION "public"."programs_set_hub_id"();



CREATE OR REPLACE TRIGGER "trg_rec_exp_updated" BEFORE UPDATE ON "public"."recurring_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_rec_inc_updated" BEFORE UPDATE ON "public"."recurring_income" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_recurring_expenses_set_hub_id" BEFORE INSERT ON "public"."recurring_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_recurring_income_set_hub_id" BEFORE INSERT ON "public"."recurring_income" FOR EACH ROW EXECUTE FUNCTION "public"."set_hub_id_from_context"();



CREATE OR REPLACE TRIGGER "trg_staff_invoices_updated" BEFORE UPDATE ON "public"."staff_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_staff_set_hub_id" BEFORE INSERT ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."staff_set_hub_id"();



CREATE OR REPLACE TRIGGER "trg_sync_cohort_student_to_classroom" AFTER INSERT ON "public"."cohort_students" FOR EACH ROW EXECUTE FUNCTION "public"."sync_cohort_student_to_classroom"();



CREATE OR REPLACE TRIGGER "update_assignments_updated_at" BEFORE UPDATE ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_classrooms_updated_at" BEFORE UPDATE ON "public"."classrooms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cohort_announcements_updated_at" BEFORE UPDATE ON "public"."cohort_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cohort_schedules_updated_at" BEFORE UPDATE ON "public"."cohort_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cohorts_updated_at" BEFORE UPDATE ON "public"."cohorts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_curriculum_lessons_updated_at" BEFORE UPDATE ON "public"."curriculum_lessons" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_curriculums_updated_at" BEFORE UPDATE ON "public"."curriculums" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_enrollments_updated_at" BEFORE UPDATE ON "public"."enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_expenses_updated_at" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lessons_updated_at" BEFORE UPDATE ON "public"."old_lessons" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_presentation_grades_updated_at" BEFORE UPDATE ON "public"."presentation_grades" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_presentations_updated_at" BEFORE UPDATE ON "public"."presentations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_programs_updated_at" BEFORE UPDATE ON "public"."programs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_schedules_updated_at" BEFORE UPDATE ON "public"."schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."assignment_resources"
    ADD CONSTRAINT "assignment_resources_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_curriculum_lesson_id_fkey" FOREIGN KEY ("curriculum_lesson_id") REFERENCES "public"."curriculum_lessons"("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."old_lessons"("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."old_lessons"("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."old_lessons"("id");



ALTER TABLE ONLY "public"."attendance_sessions"
    ADD CONSTRAINT "attendance_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classroom_permissions"
    ADD CONSTRAINT "classroom_permissions_classroom_staff_id_fkey" FOREIGN KEY ("classroom_staff_id") REFERENCES "public"."classroom_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classroom_staff"
    ADD CONSTRAINT "classroom_staff_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."classroom_staff"
    ADD CONSTRAINT "classroom_staff_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classroom_staff"
    ADD CONSTRAINT "classroom_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classroom_staff"
    ADD CONSTRAINT "classroom_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."classroom_students"
    ADD CONSTRAINT "classroom_students_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classroom_students"
    ADD CONSTRAINT "classroom_students_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."classroom_students"
    ADD CONSTRAINT "classroom_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classrooms"
    ADD CONSTRAINT "classrooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."classrooms"
    ADD CONSTRAINT "classrooms_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."classrooms"
    ADD CONSTRAINT "classrooms_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cohort_announcements"
    ADD CONSTRAINT "cohort_announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cohort_announcements"
    ADD CONSTRAINT "cohort_announcements_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_messages"
    ADD CONSTRAINT "cohort_messages_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_messages"
    ADD CONSTRAINT "cohort_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_schedules"
    ADD CONSTRAINT "cohort_schedules_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_schedules"
    ADD CONSTRAINT "cohort_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cohort_students"
    ADD CONSTRAINT "cohort_students_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_students"
    ADD CONSTRAINT "cohort_students_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cohort_students"
    ADD CONSTRAINT "cohort_students_graduation_override_by_fkey" FOREIGN KEY ("graduation_override_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cohort_students"
    ADD CONSTRAINT "cohort_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id");



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_program_interest_id_fkey" FOREIGN KEY ("program_interest_id") REFERENCES "public"."programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."curricula"
    ADD CONSTRAINT "curricula_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curricula"
    ADD CONSTRAINT "curricula_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."curriculum_lessons"
    ADD CONSTRAINT "curriculum_lessons_curriculum_week_id_fkey" FOREIGN KEY ("curriculum_week_id") REFERENCES "public"."curriculum_weeks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculum_weeks"
    ADD CONSTRAINT "curriculum_weeks_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculums"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculums"
    ADD CONSTRAINT "curriculums_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculums"
    ADD CONSTRAINT "curriculums_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."curriculums"
    ADD CONSTRAINT "curriculums_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."custom_fields"
    ADD CONSTRAINT "custom_fields_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."enrollment_targets"
    ADD CONSTRAINT "enrollment_targets_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id");



ALTER TABLE ONLY "public"."enrollments"
    ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."field_values"
    ADD CONSTRAINT "field_values_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_values"
    ADD CONSTRAINT "field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "public"."custom_fields"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_invitations"
    ADD CONSTRAINT "hub_invitations_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hub_members"
    ADD CONSTRAINT "hub_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."installments"
    ADD CONSTRAINT "installments_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."installments"
    ADD CONSTRAINT "installments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_change_requests"
    ADD CONSTRAINT "invoice_change_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_change_requests"
    ADD CONSTRAINT "invoice_change_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_follow_ups"
    ADD CONSTRAINT "lead_follow_ups_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_follow_ups"
    ADD CONSTRAINT "lead_follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_follow_ups"
    ADD CONSTRAINT "lead_follow_ups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_score_events"
    ADD CONSTRAINT "lead_score_events_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_score_events"
    ADD CONSTRAINT "lead_score_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_score_events"
    ADD CONSTRAINT "lead_score_events_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."lead_scoring_rules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_scoring_rules"
    ADD CONSTRAINT "lead_scoring_rules_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_scoring_settings"
    ADD CONSTRAINT "lead_scoring_settings_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_sources"
    ADD CONSTRAINT "lead_sources_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_tag_assignments"
    ADD CONSTRAINT "lead_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."lead_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_materials"
    ADD CONSTRAINT "lesson_materials_curriculum_lesson_id_fkey" FOREIGN KEY ("curriculum_lesson_id") REFERENCES "public"."curriculum_lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_materials"
    ADD CONSTRAINT "lesson_materials_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."old_lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."old_lessons"
    ADD CONSTRAINT "lessons_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."old_lessons"
    ADD CONSTRAINT "lessons_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id");



ALTER TABLE ONLY "public"."old_lessons"
    ADD CONSTRAINT "lessons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_created_by_fkey1" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."old_lessons"
    ADD CONSTRAINT "lessons_curriculum_lesson_id_fkey" FOREIGN KEY ("curriculum_lesson_id") REFERENCES "public"."curriculum_lessons"("id");



ALTER TABLE ONLY "public"."old_lessons"
    ADD CONSTRAINT "lessons_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."staff"("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_campaign_enrollments"
    ADD CONSTRAINT "marketing_campaign_enrollments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_campaign_enrollments"
    ADD CONSTRAINT "marketing_campaign_enrollments_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_campaign_enrollments"
    ADD CONSTRAINT "marketing_campaign_enrollments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_campaign_steps"
    ADD CONSTRAINT "marketing_campaign_steps_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_campaign_steps"
    ADD CONSTRAINT "marketing_campaign_steps_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_campaign_steps"
    ADD CONSTRAINT "marketing_campaign_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."marketing_email_templates"("id");



ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_consent_history"
    ADD CONSTRAINT "marketing_consent_history_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_consent_history"
    ADD CONSTRAINT "marketing_consent_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_email_deliveries"
    ADD CONSTRAINT "marketing_email_deliveries_campaign_enrollment_id_fkey" FOREIGN KEY ("campaign_enrollment_id") REFERENCES "public"."marketing_campaign_enrollments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_email_deliveries"
    ADD CONSTRAINT "marketing_email_deliveries_campaign_step_id_fkey" FOREIGN KEY ("campaign_step_id") REFERENCES "public"."marketing_campaign_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_email_deliveries"
    ADD CONSTRAINT "marketing_email_deliveries_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_email_deliveries"
    ADD CONSTRAINT "marketing_email_deliveries_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_email_templates"
    ADD CONSTRAINT "marketing_email_templates_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."other_income"
    ADD CONSTRAINT "other_income_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presentation_grades"
    ADD CONSTRAINT "presentation_grades_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."presentation_grades"
    ADD CONSTRAINT "presentation_grades_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presentation_grades"
    ADD CONSTRAINT "presentation_grades_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presentations"
    ADD CONSTRAINT "presentations_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presentations"
    ADD CONSTRAINT "presentations_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presentations"
    ADD CONSTRAINT "presentations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."presentations"
    ADD CONSTRAINT "presentations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."recurring_income"
    ADD CONSTRAINT "recurring_income_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracks"
    ADD CONSTRAINT "tracks_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage field values" ON "public"."field_values" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view audit logs" ON "public"."audit_logs" FOR SELECT USING (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("user_id" IN ( SELECT "hm"."user_id"
   FROM "public"."hub_members" "hm"
  WHERE ("hm"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage assignment_resources" ON "public"."assignment_resources" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_assignment_hub_id"("assignment_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_assignment_hub_id"("assignment_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage assignment_submissions" ON "public"."assignment_submissions" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_assignment_hub_id"("assignment_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_assignment_hub_id"("assignment_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage assignments" ON "public"."assignments" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage attendance_records" ON "public"."attendance_records" USING ("public"."classroom_admin_access"("classroom_id")) WITH CHECK ("public"."classroom_admin_access"("classroom_id"));



CREATE POLICY "Admins manage attendance_sessions" ON "public"."attendance_sessions" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage classroom_permissions" ON "public"."classroom_permissions" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_staff_hub_id"("classroom_staff_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_staff_hub_id"("classroom_staff_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage classroom_staff" ON "public"."classroom_staff" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage classroom_students" ON "public"."classroom_students" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage classrooms" ON "public"."classrooms" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage cohort announcements" ON "public"."cohort_announcements" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage cohort messages" ON "public"."cohort_messages" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage cohort schedules" ON "public"."cohort_schedules" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage cohort_students" ON "public"."cohort_students" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_cohort_classroom_hub_id"("cohort_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_cohort_classroom_hub_id"("cohort_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage cohorts" ON "public"."cohorts" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "cohorts"."program_id") AND ("p"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "cohorts"."program_id") AND ("p"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage curricula in their hub" ON "public"."curricula" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."classrooms" "c"
  WHERE (("c"."id" = "curricula"."classroom_id") AND ("c"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."classrooms" "c"
  WHERE (("c"."id" = "curricula"."classroom_id") AND ("c"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage curriculum_lessons" ON "public"."curriculum_lessons" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_curriculum_week_hub_id"("curriculum_week_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_curriculum_week_hub_id"("curriculum_week_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage curriculum_weeks" ON "public"."curriculum_weeks" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_curriculum_hub_id"("curriculum_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_curriculum_hub_id"("curriculum_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage curriculums" ON "public"."curriculums" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_curriculum_hub_id"("id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_curriculum_hub_id"("id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage custom fields" ON "public"."custom_fields" USING (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"())))) WITH CHECK (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"()))));



CREATE POLICY "Admins manage enrollment targets" ON "public"."enrollment_targets" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage enrollments" ON "public"."enrollments" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "enrollments"."program_id") AND ("p"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM "public"."programs" "p"
  WHERE (("p"."id" = "enrollments"."program_id") AND ("p"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage expenses" ON "public"."expenses" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage field values" ON "public"."field_values" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND "public"."enrollment_in_my_hub"("enrollment_id"))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND "public"."enrollment_in_my_hub"("enrollment_id")));



CREATE POLICY "Admins manage hub roles" ON "public"."user_roles" USING (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."user_id" = "user_roles"."user_id") AND ("hm"."hub_id" = "public"."get_my_hub_id"()))))))) WITH CHECK (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."user_id" = "user_roles"."user_id") AND ("hm"."hub_id" = "public"."get_my_hub_id"())))))));



CREATE POLICY "Admins manage installments" ON "public"."installments" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND "public"."invoice_in_my_hub"("invoice_id"))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND "public"."invoice_in_my_hub"("invoice_id")));



CREATE POLICY "Admins manage invitations" ON "public"."staff_invitations" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM "public"."classrooms" "c"
  WHERE (("c"."id" = "staff_invitations"."classroom_id") AND ("c"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM "public"."classrooms" "c"
  WHERE (("c"."id" = "staff_invitations"."classroom_id") AND ("c"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage invoice change requests" ON "public"."invoice_change_requests" USING (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM (("public"."invoices" "i"
     JOIN "public"."enrollments" "e" ON (("e"."id" = "i"."enrollment_id")))
     JOIN "public"."programs" "p" ON (("p"."id" = "e"."program_id")))
  WHERE (("i"."id" = "invoice_change_requests"."invoice_id") AND ("p"."hub_id" = "public"."get_my_hub_id"()))))))) WITH CHECK (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM (("public"."invoices" "i"
     JOIN "public"."enrollments" "e" ON (("e"."id" = "i"."enrollment_id")))
     JOIN "public"."programs" "p" ON (("p"."id" = "e"."program_id")))
  WHERE (("i"."id" = "invoice_change_requests"."invoice_id") AND ("p"."hub_id" = "public"."get_my_hub_id"())))))));



CREATE POLICY "Admins manage invoice_change_requests" ON "public"."invoice_change_requests" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM (("public"."invoices" "i"
     JOIN "public"."enrollments" "e" ON (("e"."id" = "i"."enrollment_id")))
     JOIN "public"."programs" "p" ON (("p"."id" = "e"."program_id")))
  WHERE (("i"."id" = "invoice_change_requests"."invoice_id") AND ("p"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM (("public"."invoices" "i"
     JOIN "public"."enrollments" "e" ON (("e"."id" = "i"."enrollment_id")))
     JOIN "public"."programs" "p" ON (("p"."id" = "e"."program_id")))
  WHERE (("i"."id" = "invoice_change_requests"."invoice_id") AND ("p"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage invoices" ON "public"."invoices" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND "public"."enrollment_in_my_hub"("enrollment_id"))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND "public"."enrollment_in_my_hub"("enrollment_id")));



CREATE POLICY "Admins manage lesson_materials" ON "public"."lesson_materials" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_lesson_hub_id"("lesson_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_lesson_hub_id"("lesson_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage lessons" ON "public"."old_lessons" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage lessons in their hub" ON "public"."lessons" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM (((("public"."units" "u"
     JOIN "public"."modules" "m" ON (("m"."id" = "u"."module_id")))
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cu"."classroom_id")))
  WHERE (("u"."id" = "lessons"."unit_id") AND ("c"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM (((("public"."units" "u"
     JOIN "public"."modules" "m" ON (("m"."id" = "u"."module_id")))
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cu"."classroom_id")))
  WHERE (("u"."id" = "lessons"."unit_id") AND ("c"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage modules in their hub" ON "public"."modules" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM (("public"."tracks" "t"
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cu"."classroom_id")))
  WHERE (("t"."id" = "modules"."track_id") AND ("c"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM (("public"."tracks" "t"
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cu"."classroom_id")))
  WHERE (("t"."id" = "modules"."track_id") AND ("c"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage notifications" ON "public"."notifications" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage organizations" ON "public"."organizations" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage other income" ON "public"."other_income" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage payments" ON "public"."payments" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND "public"."invoice_in_my_hub"("invoice_id"))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND "public"."invoice_in_my_hub"("invoice_id")));



CREATE POLICY "Admins manage payroll runs" ON "public"."payroll_runs" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("staff_id" IN ( SELECT "s"."id"
   FROM "public"."staff" "s"
  WHERE ("s"."hub_id" = "public"."get_my_hub_id"()))))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("staff_id" IN ( SELECT "s"."id"
   FROM "public"."staff" "s"
  WHERE ("s"."hub_id" = "public"."get_my_hub_id"())))));



CREATE POLICY "Admins manage pending payments" ON "public"."pending_payments" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM ("public"."enrollments" "e"
     JOIN "public"."programs" "p" ON (("p"."id" = "e"."program_id")))
  WHERE (("e"."id" = "pending_payments"."enrollment_id") AND ("p"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM ("public"."enrollments" "e"
     JOIN "public"."programs" "p" ON (("p"."id" = "e"."program_id")))
  WHERE (("e"."id" = "pending_payments"."enrollment_id") AND ("p"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage permissions" ON "public"."classroom_permissions" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM ("public"."classroom_staff" "cs"
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cs"."classroom_id")))
  WHERE (("cs"."id" = "classroom_permissions"."classroom_staff_id") AND ("c"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM ("public"."classroom_staff" "cs"
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cs"."classroom_id")))
  WHERE (("cs"."id" = "classroom_permissions"."classroom_staff_id") AND ("c"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage presentation_grades" ON "public"."presentation_grades" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM "public"."presentations" "p"
  WHERE (("p"."id" = "presentation_grades"."presentation_id") AND ("public"."get_classroom_hub_id"("p"."classroom_id") = "public"."get_my_hub_id"())))))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (EXISTS ( SELECT 1
   FROM "public"."presentations" "p"
  WHERE (("p"."id" = "presentation_grades"."presentation_id") AND ("public"."get_classroom_hub_id"("p"."classroom_id") = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage presentations" ON "public"."presentations" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage programs" ON "public"."programs" USING (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"()))));



CREATE POLICY "Admins manage recurring expenses" ON "public"."recurring_expenses" USING (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"())))) WITH CHECK (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"()))));



CREATE POLICY "Admins manage recurring income" ON "public"."recurring_income" USING (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"())))) WITH CHECK (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"()))));



CREATE POLICY "Admins manage schedules in their hub" ON "public"."schedules" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage staff_invitations" ON "public"."staff_invitations" USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"()))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("public"."get_classroom_hub_id"("classroom_id") = "public"."get_my_hub_id"())));



CREATE POLICY "Admins manage submissions" ON "public"."assignment_submissions" USING ("public"."classroom_admin_access"("public"."assignment_classroom_id"("assignment_id"))) WITH CHECK ("public"."classroom_admin_access"("public"."assignment_classroom_id"("assignment_id")));



CREATE POLICY "Admins manage tracks in their hub" ON "public"."tracks" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."curricula" "cu"
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cu"."classroom_id")))
  WHERE (("cu"."id" = "tracks"."curriculum_id") AND ("c"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."curricula" "cu"
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cu"."classroom_id")))
  WHERE (("cu"."id" = "tracks"."curriculum_id") AND ("c"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins manage units in their hub" ON "public"."units" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ((("public"."modules" "m"
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cu"."classroom_id")))
  WHERE (("m"."id" = "units"."module_id") AND ("c"."hub_id" = "public"."get_my_hub_id"())))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ((("public"."modules" "m"
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cu"."classroom_id")))
  WHERE (("m"."id" = "units"."module_id") AND ("c"."hub_id" = "public"."get_my_hub_id"()))))));



CREATE POLICY "Admins read staff" ON "public"."staff" FOR SELECT USING ((("public"."is_superadmin"() OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Admins view hub profiles" ON "public"."profiles" FOR SELECT USING (("public"."is_superadmin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."user_id" = "profiles"."user_id") AND ("hm"."hub_id" = "public"."get_my_hub_id"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."classroom_students" "cs"
     JOIN "public"."classrooms" "c" ON (("c"."id" = "cs"."classroom_id")))
  WHERE (("cs"."student_id" = "profiles"."user_id") AND ("c"."hub_id" = "public"."get_my_hub_id"()))))))));



CREATE POLICY "Admins view invoice change requests" ON "public"."invoice_change_requests" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Anyone can read invitation by token" ON "public"."staff_invitations" FOR SELECT USING (true);



CREATE POLICY "Authenticated can view active fields" ON "public"."custom_fields" FOR SELECT TO "authenticated" USING (("active" = true));



CREATE POLICY "Authenticated staff can submit invoices" ON "public"."staff_invoices" FOR INSERT TO "authenticated" WITH CHECK (("submitted_by" = "auth"."uid"()));



CREATE POLICY "Authenticated users can insert audit logs" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated view lesson_materials" ON "public"."lesson_materials" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated view resources" ON "public"."assignment_resources" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "CRM team manages crm_leads" ON "public"."crm_leads" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages lead_activities" ON "public"."lead_activities" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages lead_follow_ups" ON "public"."lead_follow_ups" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages lead_score_events" ON "public"."lead_score_events" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages lead_scoring_rules" ON "public"."lead_scoring_rules" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages lead_scoring_settings" ON "public"."lead_scoring_settings" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages lead_sources" ON "public"."lead_sources" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages lead_tag_assignments" ON "public"."lead_tag_assignments" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages lead_tags" ON "public"."lead_tags" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages marketing_campaign_enrollments" ON "public"."marketing_campaign_enrollments" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages marketing_campaign_steps" ON "public"."marketing_campaign_steps" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages marketing_campaigns" ON "public"."marketing_campaigns" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages marketing_consent_history" ON "public"."marketing_consent_history" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages marketing_email_deliveries" ON "public"."marketing_email_deliveries" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "CRM team manages marketing_email_templates" ON "public"."marketing_email_templates" USING (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."can_manage_crm"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Classroom staff view assignments" ON "public"."assignments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "assignments"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Classroom staff view hub staff" ON "public"."staff" FOR SELECT USING (("public"."is_superadmin"() OR (("hub_id" = "public"."get_my_hub_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))))));



CREATE POLICY "Classroom staff view presentations" ON "public"."presentations" FOR SELECT USING ("public"."classroom_staff_access"("classroom_id"));



CREATE POLICY "Cohort members post messages" ON "public"."cohort_messages" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_cohort_member"("auth"."uid"(), "cohort_id")));



CREATE POLICY "Cohort members view announcements" ON "public"."cohort_announcements" FOR SELECT USING ("public"."is_cohort_member"("auth"."uid"(), "cohort_id"));



CREATE POLICY "Cohort members view messages" ON "public"."cohort_messages" FOR SELECT USING ("public"."is_cohort_member"("auth"."uid"(), "cohort_id"));



CREATE POLICY "Cohort members view schedules" ON "public"."cohort_schedules" FOR SELECT USING ("public"."is_cohort_member"("auth"."uid"(), "cohort_id"));



CREATE POLICY "Hub admins manage staff" ON "public"."staff" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Hub managers view all hub classrooms" ON "public"."classrooms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."user_id" = "auth"."uid"()) AND ("hm"."hub_id" = "classrooms"."hub_id") AND ("hm"."hub_role" = 'manager'::"text")))));



CREATE POLICY "Hub managers view classroom permissions" ON "public"."classroom_permissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."user_id" = "auth"."uid"()) AND ("hm"."hub_role" = 'manager'::"text") AND ("hm"."hub_id" = "public"."_get_hub_id_for_cs"("classroom_permissions"."classroom_staff_id"))))));



CREATE POLICY "Hub managers view classroom staff" ON "public"."classroom_staff" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."user_id" = "auth"."uid"()) AND ("hm"."hub_role" = 'manager'::"text") AND ("hm"."hub_id" = "public"."_get_classroom_hub_id"("classroom_staff"."classroom_id"))))));



CREATE POLICY "Hub managers view hub cohorts" ON "public"."cohorts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."user_id" = "auth"."uid"()) AND ("hm"."hub_id" = "cohorts"."hub_id") AND ("hm"."hub_role" = 'manager'::"text")))));



CREATE POLICY "Hub members view own hub" ON "public"."hubs" FOR SELECT USING (("id" = "public"."get_my_hub_id"()));



CREATE POLICY "Hub owners manage invitations" ON "public"."hub_invitations" USING ((EXISTS ( SELECT 1
   FROM "public"."hub_members" "hm"
  WHERE (("hm"."user_id" = "auth"."uid"()) AND ("hm"."hub_id" = "hub_invitations"."hub_id") AND ("hm"."hub_role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Members read curricula" ON "public"."curricula" FOR SELECT USING ("public"."classroom_read_access"("classroom_id"));



CREATE POLICY "Members read lessons" ON "public"."lessons" FOR SELECT USING ("public"."classroom_read_access"("public"."unit_classroom_id"("unit_id")));



CREATE POLICY "Members read modules" ON "public"."modules" FOR SELECT USING ("public"."classroom_read_access"("public"."track_classroom_id"("track_id")));



CREATE POLICY "Members read tracks" ON "public"."tracks" FOR SELECT USING ("public"."classroom_read_access"("public"."curriculum_classroom_id"("curriculum_id")));



CREATE POLICY "Members read units" ON "public"."units" FOR SELECT USING ("public"."classroom_read_access"("public"."module_classroom_id"("module_id")));



CREATE POLICY "Members view own record" ON "public"."hub_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Non-admins view cohorts" ON "public"."cohorts" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."is_superadmin"())));



CREATE POLICY "Non-admins view programs" ON "public"."programs" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."is_superadmin"())));



CREATE POLICY "Org users can view org enrollments" ON "public"."enrollments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."organization_id" = "enrollments"."organization_id")))));



CREATE POLICY "Org users can view own org" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."organization_id" = "organizations"."id")))));



CREATE POLICY "Others view curriculum_lessons" ON "public"."curriculum_lessons" FOR SELECT USING (true);



CREATE POLICY "Others view curriculum_weeks" ON "public"."curriculum_weeks" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."curriculums" "cur"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cur"."classroom_id")))
  WHERE (("cur"."id" = "curriculum_weeks"."curriculum_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."curriculums" "cur"
     JOIN "public"."classroom_students" "cst" ON (("cst"."classroom_id" = "cur"."classroom_id")))
  WHERE (("cur"."id" = "curriculum_weeks"."curriculum_id") AND ("cst"."student_id" = "auth"."uid"()))))));



CREATE POLICY "Public can insert field values for pending enrollments" ON "public"."field_values" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."enrollments"
  WHERE (("enrollments"."id" = "field_values"."enrollment_id") AND ("enrollments"."enrollment_status" = 'pending'::"text") AND ("enrollments"."user_id" IS NULL)))));



CREATE POLICY "Public can self-enroll" ON "public"."enrollments" FOR INSERT TO "anon" WITH CHECK ((("enrollment_status" = 'pending'::"text") AND ("payment_type" = 'offline'::"text") AND ("user_id" IS NULL)));



CREATE POLICY "Public can update field values for unlinked enrollments" ON "public"."field_values" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."id" = "field_values"."enrollment_id") AND ("e"."user_id" IS NULL)))));



CREATE POLICY "Public can view active programs" ON "public"."programs" FOR SELECT TO "anon" USING (("active" = true));



CREATE POLICY "Public can view active student-visible fields" ON "public"."custom_fields" FOR SELECT TO "anon" USING ((("active" = true) AND ("visible_to_student" = true)));



CREATE POLICY "Read own hub invitation by token" ON "public"."hub_invitations" FOR SELECT USING (true);



CREATE POLICY "Staff & students view curriculums" ON "public"."curriculums" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."cohorts" "coh"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "coh"."classroom_id")))
  WHERE (("coh"."id" = "curriculums"."cohort_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."cohorts" "coh"
     JOIN "public"."classroom_students" "cst" ON (("cst"."classroom_id" = "coh"."classroom_id")))
  WHERE (("coh"."id" = "curriculums"."cohort_id") AND ("cst"."student_id" = "auth"."uid"()))))));



CREATE POLICY "Staff and admins manage assignments" ON "public"."assignments" USING ("public"."classroom_manage_access"("classroom_id")) WITH CHECK ("public"."classroom_manage_access"("classroom_id"));



CREATE POLICY "Staff and admins manage attendance sessions" ON "public"."attendance_sessions" USING ("public"."classroom_attendance_access"("classroom_id")) WITH CHECK ("public"."classroom_attendance_access"("classroom_id"));



CREATE POLICY "Staff and admins manage curricula" ON "public"."curricula" USING ("public"."classroom_staff_access"("classroom_id")) WITH CHECK ("public"."classroom_staff_access"("classroom_id"));



CREATE POLICY "Staff and admins manage lessons" ON "public"."lessons" USING ("public"."classroom_staff_access"("public"."unit_classroom_id"("unit_id"))) WITH CHECK ("public"."classroom_staff_access"("public"."unit_classroom_id"("unit_id")));



CREATE POLICY "Staff and admins manage modules" ON "public"."modules" USING ("public"."classroom_staff_access"("public"."track_classroom_id"("track_id"))) WITH CHECK ("public"."classroom_staff_access"("public"."track_classroom_id"("track_id")));



CREATE POLICY "Staff and admins manage presentation grades" ON "public"."presentation_grades" USING ("public"."classroom_manage_access"("public"."presentation_classroom_id"("presentation_id"))) WITH CHECK ("public"."classroom_manage_access"("public"."presentation_classroom_id"("presentation_id")));



CREATE POLICY "Staff and admins manage presentations" ON "public"."presentations" USING ("public"."classroom_manage_access"("classroom_id")) WITH CHECK ("public"."classroom_manage_access"("classroom_id"));



CREATE POLICY "Staff and admins manage schedules" ON "public"."schedules" USING ("public"."classroom_staff_access"("classroom_id")) WITH CHECK ("public"."classroom_staff_access"("classroom_id"));



CREATE POLICY "Staff and admins manage tracks" ON "public"."tracks" USING ("public"."classroom_staff_access"("public"."curriculum_classroom_id"("curriculum_id"))) WITH CHECK ("public"."classroom_staff_access"("public"."curriculum_classroom_id"("curriculum_id")));



CREATE POLICY "Staff and admins manage units" ON "public"."units" USING ("public"."classroom_staff_access"("public"."module_classroom_id"("module_id"))) WITH CHECK ("public"."classroom_staff_access"("public"."module_classroom_id"("module_id")));



CREATE POLICY "Staff can view own invoices" ON "public"."staff_invoices" FOR SELECT USING ((("submitted_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."is_superadmin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("lower"("s"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) AND ("s"."id" = "staff_invoices"."staff_id"))))));



CREATE POLICY "Staff manage cohort students" ON "public"."cohort_students" USING ((EXISTS ( SELECT 1
   FROM (("public"."cohorts" "c"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "c"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("c"."id" = "cohort_students"."cohort_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_edit_cohorts" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."cohorts" "c"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "c"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("c"."id" = "cohort_students"."cohort_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_edit_cohorts" = true)))));



CREATE POLICY "Staff manage curricula in their classroom" ON "public"."curricula" USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "curricula"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "curricula"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff manage lessons in their classroom" ON "public"."lessons" USING ((EXISTS ( SELECT 1
   FROM (((("public"."units" "u"
     JOIN "public"."modules" "m" ON (("m"."id" = "u"."module_id")))
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("u"."id" = "lessons"."unit_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (((("public"."units" "u"
     JOIN "public"."modules" "m" ON (("m"."id" = "u"."module_id")))
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("u"."id" = "lessons"."unit_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff manage modules in their classroom" ON "public"."modules" USING ((EXISTS ( SELECT 1
   FROM (("public"."tracks" "t"
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("t"."id" = "modules"."track_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."tracks" "t"
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("t"."id" = "modules"."track_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff manage schedules in their classroom" ON "public"."schedules" USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "schedules"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "schedules"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff manage tracks in their classroom" ON "public"."tracks" USING ((EXISTS ( SELECT 1
   FROM ("public"."curricula" "cu"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("cu"."id" = "tracks"."curriculum_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."curricula" "cu"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("cu"."id" = "tracks"."curriculum_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff manage units in their classroom" ON "public"."units" USING ((EXISTS ( SELECT 1
   FROM ((("public"."modules" "m"
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("m"."id" = "units"."module_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("public"."modules" "m"
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("m"."id" = "units"."module_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff read own record" ON "public"."staff" FOR SELECT USING ((("email" IS NOT NULL) AND ("email" = ("auth"."jwt"() ->> 'email'::"text"))));



CREATE POLICY "Staff view assigned classroom lessons" ON "public"."old_lessons" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "old_lessons"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff view assigned classrooms" ON "public"."classrooms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "classrooms"."id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff view classroom assignments" ON "public"."assignments" FOR SELECT USING ("public"."classroom_staff_access"("classroom_id"));



CREATE POLICY "Staff view classroom attendance" ON "public"."attendance_records" FOR SELECT USING ("public"."classroom_staff_access"("classroom_id"));



CREATE POLICY "Staff view classroom students" ON "public"."classroom_students" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "classroom_students"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff view cohort students" ON "public"."cohort_students" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."cohorts" "c"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "c"."classroom_id")))
  WHERE (("c"."id" = "cohort_students"."cohort_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff view curricula in their classroom" ON "public"."curricula" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "curricula"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff view lessons in their classroom" ON "public"."lessons" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (((("public"."units" "u"
     JOIN "public"."modules" "m" ON (("m"."id" = "u"."module_id")))
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("u"."id" = "lessons"."unit_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff view modules in their classroom" ON "public"."modules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."tracks" "t"
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("t"."id" = "modules"."track_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff view own assignments" ON "public"."classroom_staff" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Staff view own permissions" ON "public"."classroom_permissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."id" = "classroom_permissions"."classroom_staff_id") AND ("cs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Staff view program enrollments" ON "public"."enrollments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."classroom_staff" "cs"
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cs"."classroom_id")))
  WHERE (("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cl"."program_id" = "enrollments"."program_id")))));



CREATE POLICY "Staff view tracks in their classroom" ON "public"."tracks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."curricula" "cu"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("cu"."id" = "tracks"."curriculum_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff view units in their classroom" ON "public"."units" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((("public"."modules" "m"
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cu"."classroom_id")))
  WHERE (("m"."id" = "units"."module_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text")))));



CREATE POLICY "Staff with can_edit_cohorts can delete cohorts" ON "public"."cohorts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."classroom_staff" "cs"
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cs"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_edit_cohorts" = true) AND ("cs"."classroom_id" = "cohorts"."classroom_id") AND ("cohorts"."hub_id" = "cl"."hub_id")))));



CREATE POLICY "Staff with can_edit_cohorts can insert cohorts" ON "public"."cohorts" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."classroom_staff" "cs"
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cs"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_edit_cohorts" = true) AND ("cs"."classroom_id" = "cohorts"."classroom_id") AND ("cohorts"."hub_id" = "cl"."hub_id")))));



CREATE POLICY "Staff with can_edit_cohorts can update cohorts" ON "public"."cohorts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."classroom_staff" "cs"
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cs"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_edit_cohorts" = true) AND ("cs"."classroom_id" = "cohorts"."classroom_id") AND ("cohorts"."hub_id" = "cl"."hub_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."classroom_staff" "cs"
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cs"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_edit_cohorts" = true) AND ("cs"."classroom_id" = "cohorts"."classroom_id") AND ("cohorts"."hub_id" = "cl"."hub_id")))));



CREATE POLICY "Students can manage own field values" ON "public"."field_values" USING ("public"."enrollment_is_mine"("enrollment_id"));



CREATE POLICY "Students can view own enrollments" ON "public"."enrollments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can view own installments" ON "public"."installments" FOR SELECT USING ("public"."invoice_is_mine"("invoice_id"));



CREATE POLICY "Students can view own invoices" ON "public"."invoices" FOR SELECT USING ("public"."enrollment_is_mine"("enrollment_id"));



CREATE POLICY "Students can view own payments" ON "public"."payments" FOR SELECT USING ("public"."invoice_is_mine"("invoice_id"));



CREATE POLICY "Students insert own attendance" ON "public"."attendance_records" FOR INSERT WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "Students insert own pending payments" ON "public"."pending_payments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."id" = "pending_payments"."enrollment_id") AND ("e"."user_id" = "auth"."uid"())))));



CREATE POLICY "Students manage own submissions" ON "public"."assignment_submissions" USING (("student_id" = "auth"."uid"())) WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "Students read curricula for their programs" ON "public"."curricula" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."classrooms" "c"
     JOIN "public"."enrollments" "e" ON (("e"."program_id" = "c"."program_id")))
  WHERE (("c"."id" = "curricula"."classroom_id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."enrollment_status" <> ALL (ARRAY['cancelled'::"text", 'withdrawn'::"text"]))))));



CREATE POLICY "Students read lessons for their programs" ON "public"."lessons" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((((("public"."units" "u"
     JOIN "public"."modules" "m" ON (("m"."id" = "u"."module_id")))
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cu"."classroom_id")))
     JOIN "public"."enrollments" "e" ON (("e"."program_id" = "cl"."program_id")))
  WHERE (("u"."id" = "lessons"."unit_id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."enrollment_status" <> ALL (ARRAY['cancelled'::"text", 'withdrawn'::"text"]))))));



CREATE POLICY "Students read modules for their programs" ON "public"."modules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((("public"."tracks" "t"
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cu"."classroom_id")))
     JOIN "public"."enrollments" "e" ON (("e"."program_id" = "cl"."program_id")))
  WHERE (("t"."id" = "modules"."track_id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."enrollment_status" <> ALL (ARRAY['cancelled'::"text", 'withdrawn'::"text"]))))));



CREATE POLICY "Students read open sessions" ON "public"."attendance_sessions" FOR SELECT USING ((("status" = 'open'::"text") AND ("public"."classroom_read_access"("classroom_id") OR (("cohort_id" IS NOT NULL) AND "public"."cohort_is_mine"("cohort_id")))));



CREATE POLICY "Students read their schedules" ON "public"."schedules" FOR SELECT USING (("public"."classroom_read_access"("classroom_id") AND (("cohort_id" IS NULL) OR "public"."cohort_is_mine"("cohort_id"))));



CREATE POLICY "Students read tracks for their programs" ON "public"."tracks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."curricula" "cu"
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cu"."classroom_id")))
     JOIN "public"."enrollments" "e" ON (("e"."program_id" = "cl"."program_id")))
  WHERE (("cu"."id" = "tracks"."curriculum_id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."enrollment_status" <> ALL (ARRAY['cancelled'::"text", 'withdrawn'::"text"]))))));



CREATE POLICY "Students read units for their programs" ON "public"."units" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (((("public"."modules" "m"
     JOIN "public"."tracks" "t" ON (("t"."id" = "m"."track_id")))
     JOIN "public"."curricula" "cu" ON (("cu"."id" = "t"."curriculum_id")))
     JOIN "public"."classrooms" "cl" ON (("cl"."id" = "cu"."classroom_id")))
     JOIN "public"."enrollments" "e" ON (("e"."program_id" = "cl"."program_id")))
  WHERE (("m"."id" = "units"."module_id") AND ("e"."user_id" = "auth"."uid"()) AND ("e"."enrollment_status" <> ALL (ARRAY['cancelled'::"text", 'withdrawn'::"text"]))))));



CREATE POLICY "Students view classroom lessons" ON "public"."old_lessons" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_students" "cs"
  WHERE (("cs"."classroom_id" = "old_lessons"."classroom_id") AND ("cs"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students view enrolled classrooms" ON "public"."classrooms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_students" "cs"
  WHERE (("cs"."classroom_id" = "classrooms"."id") AND ("cs"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students view own attendance" ON "public"."attendance_records" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students view own cohort record" ON "public"."cohort_students" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students view own pending payments" ON "public"."pending_payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."enrollments" "e"
  WHERE (("e"."id" = "pending_payments"."enrollment_id") AND ("e"."user_id" = "auth"."uid"())))));



CREATE POLICY "Students view own presentation grade" ON "public"."presentation_grades" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students view own record" ON "public"."classroom_students" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students view published assignments in their classroom" ON "public"."assignments" FOR SELECT USING ((("status" = 'published'::"text") AND "public"."classroom_read_access"("classroom_id") AND (("cohort_id" IS NULL) OR "public"."cohort_is_mine"("cohort_id"))));



CREATE POLICY "Students view published presentations in their cohort" ON "public"."presentations" FOR SELECT USING ((("status" = ANY (ARRAY['published'::"text", 'completed'::"text"])) AND ("cohort_id" IS NOT NULL) AND "public"."cohort_is_mine"("cohort_id")));



CREATE POLICY "Superadmin full access on curricula" ON "public"."curricula" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Superadmin full access on lessons" ON "public"."lessons" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Superadmin full access on modules" ON "public"."modules" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Superadmin full access on schedules" ON "public"."schedules" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Superadmin full access on tracks" ON "public"."tracks" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Superadmin full access on units" ON "public"."units" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Superadmin manages admin invites" ON "public"."pending_admin_invites" USING ("public"."is_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmin manages all field values" ON "public"."field_values" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "Superadmin manages invoice change requests" ON "public"."invoice_change_requests" USING ("public"."is_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmin manages staff invoices" ON "public"."staff_invoices" USING ("public"."is_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins manage hub_invitations" ON "public"."hub_invitations" USING ("public"."is_superadmin"());



CREATE POLICY "Superadmins manage hub_members" ON "public"."hub_members" USING ("public"."is_superadmin"());



CREATE POLICY "Superadmins manage hubs" ON "public"."hubs" USING ("public"."is_superadmin"());



CREATE POLICY "Superadmins manage staff" ON "public"."staff" USING (("public"."is_superadmin"() AND ("hub_id" = "public"."get_my_hub_id"()))) WITH CHECK (("public"."is_superadmin"() AND ("hub_id" = "public"."get_my_hub_id"())));



CREATE POLICY "Superadmins read own record" ON "public"."superadmins" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Teaching staff grade presentations" ON "public"."presentation_grades" USING ((EXISTS ( SELECT 1
   FROM (("public"."presentations" "p"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "p"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("p"."id" = "presentation_grades"."presentation_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_create_assignments" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."presentations" "p"
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "p"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("p"."id" = "presentation_grades"."presentation_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_create_assignments" = true)))));



CREATE POLICY "Teaching staff grade submissions" ON "public"."assignment_submissions" FOR UPDATE USING ("public"."classroom_manage_access"("public"."assignment_classroom_id"("assignment_id")));



CREATE POLICY "Teaching staff manage classroom assignments" ON "public"."assignments" USING ((EXISTS ( SELECT 1
   FROM ("public"."classroom_staff" "cs"
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."classroom_id" = "assignments"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_create_assignments" = true)))));



CREATE POLICY "Teaching staff manage classroom lessons" ON "public"."old_lessons" USING ((EXISTS ( SELECT 1
   FROM ("public"."classroom_staff" "cs"
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."classroom_id" = "old_lessons"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_schedule" = true)))));



CREATE POLICY "Teaching staff manage classroom presentations" ON "public"."presentations" USING ((EXISTS ( SELECT 1
   FROM ("public"."classroom_staff" "cs"
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."classroom_id" = "presentations"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_create_assignments" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."classroom_staff" "cs"
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."classroom_id" = "presentations"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_create_assignments" = true)))));



CREATE POLICY "Teaching staff manage curriculum_lessons" ON "public"."curriculum_lessons" USING ((EXISTS ( SELECT 1
   FROM ((("public"."curriculum_weeks" "cw"
     JOIN "public"."curriculums" "cur" ON (("cur"."id" = "cw"."curriculum_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = "cur"."classroom_id")))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cw"."id" = "curriculum_lessons"."curriculum_week_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_create_lessons" = true)))));



CREATE POLICY "Teaching staff manage curriculum_weeks" ON "public"."curriculum_weeks" USING ((EXISTS ( SELECT 1
   FROM ((("public"."curriculums" "cur"
     JOIN "public"."cohorts" "coh" ON (("coh"."id" = "cur"."cohort_id")))
     JOIN "public"."classroom_staff" "cs" ON (("cs"."classroom_id" = COALESCE("cur"."classroom_id", "coh"."classroom_id"))))
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cur"."id" = "curriculum_weeks"."curriculum_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_create_lessons" = true)))));



CREATE POLICY "Teaching staff manage lesson_materials" ON "public"."lesson_materials" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Teaching staff manage own classroom curriculums" ON "public"."curriculums" USING ((EXISTS ( SELECT 1
   FROM (("public"."classroom_staff" "cs"
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
     JOIN "public"."cohorts" "coh" ON (("coh"."id" = "curriculums"."cohort_id")))
  WHERE (("cs"."classroom_id" = COALESCE("curriculums"."classroom_id", "coh"."classroom_id")) AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_create_lessons" = true)))));



CREATE POLICY "Teaching staff manage own classroom sessions" ON "public"."attendance_sessions" USING ((EXISTS ( SELECT 1
   FROM ("public"."classroom_staff" "cs"
     JOIN "public"."classroom_permissions" "cp" ON (("cp"."classroom_staff_id" = "cs"."id")))
  WHERE (("cs"."classroom_id" = "attendance_sessions"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cp"."can_start_attendance" = true)))));



CREATE POLICY "Teaching staff view classroom assignments" ON "public"."assignments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classroom_staff" "cs"
  WHERE (("cs"."classroom_id" = "assignments"."classroom_id") AND ("cs"."user_id" = "auth"."uid"()) AND ("cs"."status" = 'active'::"text") AND ("cs"."staff_type" = 'teaching'::"text")))));



CREATE POLICY "Teaching staff view classroom submissions" ON "public"."assignment_submissions" FOR SELECT USING ("public"."classroom_staff_access"("public"."assignment_classroom_id"("assignment_id")));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete own messages" ON "public"."cohort_messages" FOR DELETE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."_rls_policy_backup_20260705" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bank_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_transactions_admin_read" ON "public"."bank_transactions" FOR SELECT TO "authenticated" USING (((("hub_id" = "public"."get_my_hub_id"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) OR "public"."is_superadmin"()));



CREATE POLICY "bank_transactions_superadmin_write" ON "public"."bank_transactions" TO "authenticated" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



ALTER TABLE "public"."classroom_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classroom_staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classroom_students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classrooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cohort_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cohort_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cohort_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cohort_students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cohorts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curricula" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculum_lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculum_weeks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."curriculums" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrollment_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."field_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hub_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hub_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."installments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_change_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_follow_ups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_score_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_scoring_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_scoring_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_tag_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaign_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaign_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_consent_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_email_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."old_lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."other_income" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_admin_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presentation_grades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presentations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_income" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."superadmins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_classroom_hub_id"("p_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_classroom_hub_id"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_classroom_hub_id"("p_classroom_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_get_hub_id_for_cs"("p_cs_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_hub_id_for_cs"("p_cs_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_hub_id_for_cs"("p_cs_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_hub_invitation"("p_token" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_hub_invitation"("p_token" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_hub_invitation"("p_token" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_staff_invitation"("p_token" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_staff_invitation"("p_token" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_staff_invitation"("p_token" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_marketing_campaign"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_marketing_campaign"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_marketing_campaign"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_enrollment"("p_enrollment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_enrollment"("p_enrollment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_enrollment"("p_enrollment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_invoice"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_invoice"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_invoice"("p_invoice_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_invoice"("p_invoice_id" "uuid", "p_total_amount" numeric, "p_installments" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_invoice"("p_invoice_id" "uuid", "p_total_amount" numeric, "p_installments" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_invoice"("p_invoice_id" "uuid", "p_total_amount" numeric, "p_installments" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_invoice_change"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_invoice_change"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_invoice_change"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_staff_invoice"("p_id" "uuid", "p_payment_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_staff_invoice"("p_id" "uuid", "p_payment_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_staff_invoice"("p_id" "uuid", "p_payment_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_staff_to_classroom"("p_classroom_id" "uuid", "p_staff_id" "uuid", "p_staff_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_staff_to_classroom"("p_classroom_id" "uuid", "p_staff_id" "uuid", "p_staff_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_staff_to_classroom"("p_classroom_id" "uuid", "p_staff_id" "uuid", "p_staff_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assignment_classroom_id"("_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assignment_classroom_id"("_assignment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assignment_classroom_id"("_assignment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assignment_classroom_id"("_assignment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_enroll_on_classroom_program"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_enroll_on_classroom_program"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_enroll_on_classroom_program"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_enroll_student_classroom"("p_enrollment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auto_enroll_student_classroom"("p_enrollment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_enroll_student_classroom"("p_enrollment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_enroll_student_in_classrooms"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_enroll_student_in_classrooms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_enroll_student_in_classrooms"() TO "service_role";



GRANT ALL ON FUNCTION "public"."backfill_classroom_students_on_classroom_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_classroom_students_on_classroom_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_classroom_students_on_classroom_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_crm"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_crm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_crm"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_admin_invite"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_admin_invite"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_admin_invite"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."classroom_admin_access"("_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_admin_access"("_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."classroom_admin_access"("_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."classroom_admin_access"("_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."classroom_attendance_access"("_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_attendance_access"("_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."classroom_attendance_access"("_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."classroom_attendance_access"("_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."classroom_manage_access"("_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_manage_access"("_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."classroom_manage_access"("_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."classroom_manage_access"("_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."classroom_read_access"("_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_read_access"("_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."classroom_read_access"("_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."classroom_read_access"("_classroom_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."classroom_staff_access"("_classroom_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."classroom_staff_access"("_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."classroom_staff_access"("_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."classroom_staff_access"("_classroom_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clone_curriculum_to_cohort"("p_source_curriculum_id" "uuid", "p_target_cohort_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clone_curriculum_to_cohort"("p_source_curriculum_id" "uuid", "p_target_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_curriculum_to_cohort"("p_source_curriculum_id" "uuid", "p_target_cohort_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clone_curriculum_v2"("p_source_curriculum_id" "uuid", "p_target_classroom_id" "uuid", "p_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clone_curriculum_v2"("p_source_curriculum_id" "uuid", "p_target_classroom_id" "uuid", "p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_curriculum_v2"("p_source_curriculum_id" "uuid", "p_target_classroom_id" "uuid", "p_title" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cohort_is_mine"("_cohort_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cohort_is_mine"("_cohort_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cohort_is_mine"("_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cohort_is_mine"("_cohort_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_lead_follow_up"("p_follow_up_id" "uuid", "p_outcome" "text", "p_next_due_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."complete_lead_follow_up"("p_follow_up_id" "uuid", "p_outcome" "text", "p_next_due_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_lead_follow_up"("p_follow_up_id" "uuid", "p_outcome" "text", "p_next_due_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_cohort_graduation"("p_cohort_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_cohort_graduation"("p_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_cohort_graduation"("p_cohort_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_next_recurrence"("_d" "date", "_freq" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_next_recurrence"("_d" "date", "_freq" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_next_recurrence"("_d" "date", "_freq" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_bank_match"("p_installment_id" "uuid", "p_bank_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_bank_match"("p_installment_id" "uuid", "p_bank_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_bank_match"("p_installment_id" "uuid", "p_bank_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_crm_lead"("p_lead_id" "uuid", "p_program_id" "uuid", "p_total_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_crm_lead"("p_lead_id" "uuid", "p_program_id" "uuid", "p_total_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_crm_lead"("p_lead_id" "uuid", "p_program_id" "uuid", "p_total_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_admin_invite"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_admin_invite"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_admin_invite"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."curriculum_add_lesson"("p_unit_id" "uuid", "p_title" "text", "p_content" "text", "p_objectives" "text", "p_video_url" "text", "p_external_link" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."curriculum_add_lesson"("p_unit_id" "uuid", "p_title" "text", "p_content" "text", "p_objectives" "text", "p_video_url" "text", "p_external_link" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."curriculum_add_lesson"("p_unit_id" "uuid", "p_title" "text", "p_content" "text", "p_objectives" "text", "p_video_url" "text", "p_external_link" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."curriculum_classroom_id"("_curriculum_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."curriculum_classroom_id"("_curriculum_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."curriculum_classroom_id"("_curriculum_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."curriculum_classroom_id"("_curriculum_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."curriculum_update_lesson"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_objectives" "text", "p_order_index" integer, "p_video_url" "text", "p_external_link" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."curriculum_update_lesson"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_objectives" "text", "p_order_index" integer, "p_video_url" "text", "p_external_link" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."curriculum_update_lesson"("p_id" "uuid", "p_title" "text", "p_content" "text", "p_objectives" "text", "p_order_index" integer, "p_video_url" "text", "p_external_link" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_admin_role_grant"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_admin_role_grant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_admin_role_grant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enrollment_in_my_hub"("_enrollment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."enrollment_in_my_hub"("_enrollment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enrollment_in_my_hub"("_enrollment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enrollment_is_mine"("_enrollment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."enrollment_is_mine"("_enrollment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enrollment_is_mine"("_enrollment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_lead_campaigns"("p_lead_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_lead_campaigns"("p_lead_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_lead_campaigns"("p_lead_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."attendance_sessions" TO "anon";
GRANT ALL ON TABLE "public"."attendance_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_sessions" TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid", "p_cohort_id" "uuid", "p_duration_mins" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid", "p_cohort_id" "uuid", "p_duration_mins" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid", "p_cohort_id" "uuid", "p_duration_mins" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid", "p_cohort_id" "uuid", "p_duration_mins" integer, "p_schedule_id" "uuid", "p_late_after_mins" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid", "p_cohort_id" "uuid", "p_duration_mins" integer, "p_schedule_id" "uuid", "p_late_after_mins" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_attendance_session"("p_classroom_id" "uuid", "p_lesson_id" "uuid", "p_cohort_id" "uuid", "p_duration_mins" integer, "p_schedule_id" "uuid", "p_late_after_mins" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_class_schedule"("p_classroom_id" "uuid", "p_module_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_days_of_week" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_cohort_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_class_schedule"("p_classroom_id" "uuid", "p_module_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_days_of_week" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_class_schedule"("p_classroom_id" "uuid", "p_module_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_days_of_week" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_cohort_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_cohort_schedule"("p_cohort_id" "uuid", "p_days" "text"[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_instructor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_cohort_schedule"("p_cohort_id" "uuid", "p_days" "text"[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_instructor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_cohort_schedule"("p_cohort_id" "uuid", "p_days" "text"[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_instructor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_assignment_hub_id"("p_assignment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_assignment_hub_id"("p_assignment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_assignment_hub_id"("p_assignment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classroom_curricula"("p_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_classroom_curricula"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_classroom_curricula"("p_classroom_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classroom_curricula_trees"("p_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_classroom_curricula_trees"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_classroom_curricula_trees"("p_classroom_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classroom_hub_id"("p_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_classroom_hub_id"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_classroom_hub_id"("p_classroom_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classroom_lesson_options"("p_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_classroom_lesson_options"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_classroom_lesson_options"("p_classroom_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classroom_schedules"("p_classroom_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_classroom_schedules"("p_classroom_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_classroom_schedules"("p_classroom_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_classroom_staff_hub_id"("p_cs_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_classroom_staff_hub_id"("p_cs_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_classroom_staff_hub_id"("p_cs_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cohort_analytics"("p_cohort_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cohort_analytics"("p_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cohort_analytics"("p_cohort_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cohort_classroom_hub_id"("p_cohort_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cohort_classroom_hub_id"("p_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cohort_classroom_hub_id"("p_cohort_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_crm_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_crm_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_crm_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_curriculum_hub_id"("p_curriculum_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_curriculum_hub_id"("p_curriculum_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_curriculum_hub_id"("p_curriculum_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_curriculum_tree"("p_curriculum_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_curriculum_tree"("p_curriculum_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_curriculum_tree"("p_curriculum_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_curriculum_week_hub_id"("p_cw_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_curriculum_week_hub_id"("p_cw_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_curriculum_week_hub_id"("p_cw_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_enrollment_field_values"("p_enrollment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_enrollment_field_values"("p_enrollment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_enrollment_field_values"("p_enrollment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_enrollment_for_completion"("p_enrollment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_enrollment_for_completion"("p_enrollment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_enrollment_for_completion"("p_enrollment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_enrollment_performance"("p_months" integer, "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_enrollment_performance"("p_months" integer, "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_enrollment_performance"("p_months" integer, "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_finance_summary"("p_months" integer, "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_finance_summary"("p_months" integer, "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_finance_summary"("p_months" integer, "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_lesson_hub_id"("p_lesson_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_lesson_hub_id"("p_lesson_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_lesson_hub_id"("p_lesson_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_hub_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_hub_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_hub_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_hub_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_hub_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_hub_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_staff_names"("p_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_staff_names"("p_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_staff_names"("p_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_progress"("p_student_id" "uuid", "p_cohort_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_progress"("p_student_id" "uuid", "p_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_progress"("p_student_id" "uuid", "p_cohort_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_admin"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_admin"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_admin"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."invoice_in_my_hub"("_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_in_my_hub"("_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_in_my_hub"("_invoice_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."invoice_is_mine"("_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_is_mine"("_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_is_mine"("_invoice_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_cohort_member"("_user_id" "uuid", "_cohort_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_cohort_member"("_user_id" "uuid", "_cohort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_cohort_member"("_user_id" "uuid", "_cohort_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superadmin"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_enrollment_to_user"("p_enrollment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."link_enrollment_to_user"("p_enrollment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_enrollment_to_user"("p_enrollment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_admins"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_admins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_admins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_audit_logs"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_audit_logs"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_audit_logs"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_crm_owners"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_crm_owners"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_crm_owners"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_hubs"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_hubs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_hubs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_outstanding_invoices"("p_only_overdue" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."list_outstanding_invoices"("p_only_overdue" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_outstanding_invoices"("p_only_overdue" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_staff_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_staff_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_staff_users"() TO "service_role";



GRANT ALL ON TABLE "public"."attendance_records" TO "anon";
GRANT ALL ON TABLE "public"."attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_attendance"("p_code" "text", "p_student_lat" numeric, "p_student_lng" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_attendance"("p_code" "text", "p_student_lat" numeric, "p_student_lng" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_attendance"("p_code" "text", "p_student_lat" numeric, "p_student_lng" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."module_classroom_id"("_module_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."module_classroom_id"("_module_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."module_classroom_id"("_module_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."module_classroom_id"("_module_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."name_match_score"("p_bank_text" "text", "p_person" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."name_match_score"("p_bank_text" "text", "p_person" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."name_match_score"("p_bank_text" "text", "p_person" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_target_month"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_target_month"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_target_month"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notifications_set_hub_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."notifications_set_hub_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notifications_set_hub_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."post_recurring_expense"("p_id" "uuid", "p_payment_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."post_recurring_expense"("p_id" "uuid", "p_payment_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_recurring_expense"("p_id" "uuid", "p_payment_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."post_recurring_income"("p_id" "uuid", "p_payment_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."post_recurring_income"("p_id" "uuid", "p_payment_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_recurring_income"("p_id" "uuid", "p_payment_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."presentation_classroom_id"("_presentation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."presentation_classroom_id"("_presentation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."presentation_classroom_id"("_presentation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."presentation_classroom_id"("_presentation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."programs_set_hub_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."programs_set_hub_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."programs_set_hub_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."promote_staff_to_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."promote_staff_to_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_staff_to_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."crm_leads" TO "anon";
GRANT ALL ON TABLE "public"."crm_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_leads" TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_lead_score"("p_lead_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_lead_score"("p_lead_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_lead_score"("p_lead_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_lead_score_event"("p_lead_id" "uuid", "p_event_type" "text", "p_external_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_lead_score_event"("p_lead_id" "uuid", "p_event_type" "text", "p_external_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_lead_score_event"("p_lead_id" "uuid", "p_event_type" "text", "p_external_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_invoice_change"("p_request_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_invoice_change"("p_request_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_invoice_change"("p_request_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_staff_invoice"("p_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_staff_invoice"("p_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_staff_invoice"("p_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_invoice_change"("p_invoice_id" "uuid", "p_action" "text", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."request_invoice_change"("p_invoice_id" "uuid", "p_action" "text", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_invoice_change"("p_invoice_id" "uuid", "p_action" "text", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_admin"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_admin"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_admin"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."run_cohort_graduation_sweep"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_cohort_graduation_sweep"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_cohort_graduation_sweep"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_crm_defaults"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_crm_defaults"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_crm_defaults"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_graduation_override"("p_cohort_student_id" "uuid", "p_status" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_graduation_override"("p_cohort_student_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_graduation_override"("p_cohort_student_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_hub_id_from_context"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_hub_id_from_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_hub_id_from_context"() TO "service_role";



GRANT ALL ON FUNCTION "public"."staff_set_hub_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."staff_set_hub_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."staff_set_hub_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_enrollment_fields"("p_enrollment_id" "uuid", "p_fields" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_enrollment_fields"("p_enrollment_id" "uuid", "p_fields" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."suggest_bank_matches"("p_installment_id" "uuid", "p_day_window" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."suggest_bank_matches"("p_installment_id" "uuid", "p_day_window" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."suggest_bank_matches"("p_installment_id" "uuid", "p_day_window" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."switch_hub_context"("p_hub_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."switch_hub_context"("p_hub_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_hub_context"("p_hub_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."switch_student_classroom"("p_student_id" "uuid", "p_from_classroom_id" "uuid", "p_to_classroom_id" "uuid", "p_to_cohort_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."switch_student_classroom"("p_student_id" "uuid", "p_from_classroom_id" "uuid", "p_to_classroom_id" "uuid", "p_to_cohort_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_student_classroom"("p_student_id" "uuid", "p_from_classroom_id" "uuid", "p_to_classroom_id" "uuid", "p_to_cohort_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_cohort_student_to_classroom"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_cohort_student_to_classroom"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_cohort_student_to_classroom"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_enrollment_first_due_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_enrollment_first_due_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_enrollment_first_due_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_enrollment_to_crm_lead"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_enrollment_to_crm_lead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_enrollment_to_crm_lead"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."track_classroom_id"("_track_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."track_classroom_id"("_track_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."track_classroom_id"("_track_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_classroom_id"("_track_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_crm_lead_campaign_eligibility"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_crm_lead_campaign_eligibility"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_crm_lead_campaign_eligibility"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."unit_classroom_id"("_unit_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unit_classroom_id"("_unit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unit_classroom_id"("_unit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unit_classroom_id"("_unit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."unreconciled_bank_credits"("p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."unreconciled_bank_credits"("p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unreconciled_bank_credits"("p_from" "date", "p_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_crm_lead"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_source_slug" "text", "p_marketing_consent" boolean, "p_metadata" "jsonb", "p_qualification" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_crm_lead"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_source_slug" "text", "p_marketing_consent" boolean, "p_metadata" "jsonb", "p_qualification" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_crm_lead"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_source_slug" "text", "p_marketing_consent" boolean, "p_metadata" "jsonb", "p_qualification" "text") TO "service_role";



GRANT ALL ON TABLE "public"."_rls_policy_backup_20260705" TO "anon";
GRANT ALL ON TABLE "public"."_rls_policy_backup_20260705" TO "authenticated";
GRANT ALL ON TABLE "public"."_rls_policy_backup_20260705" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_resources" TO "anon";
GRANT ALL ON TABLE "public"."assignment_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_resources" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_submissions" TO "anon";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."bank_transactions" TO "anon";
GRANT ALL ON TABLE "public"."bank_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."classroom_permissions" TO "anon";
GRANT ALL ON TABLE "public"."classroom_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."classroom_staff" TO "anon";
GRANT ALL ON TABLE "public"."classroom_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_staff" TO "service_role";



GRANT ALL ON TABLE "public"."classroom_students" TO "anon";
GRANT ALL ON TABLE "public"."classroom_students" TO "authenticated";
GRANT ALL ON TABLE "public"."classroom_students" TO "service_role";



GRANT ALL ON TABLE "public"."classrooms" TO "anon";
GRANT ALL ON TABLE "public"."classrooms" TO "authenticated";
GRANT ALL ON TABLE "public"."classrooms" TO "service_role";



GRANT ALL ON TABLE "public"."cohort_announcements" TO "anon";
GRANT ALL ON TABLE "public"."cohort_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."cohort_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."cohort_messages" TO "anon";
GRANT ALL ON TABLE "public"."cohort_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."cohort_messages" TO "service_role";



GRANT ALL ON TABLE "public"."cohort_schedules" TO "anon";
GRANT ALL ON TABLE "public"."cohort_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."cohort_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."cohort_students" TO "anon";
GRANT ALL ON TABLE "public"."cohort_students" TO "authenticated";
GRANT ALL ON TABLE "public"."cohort_students" TO "service_role";



GRANT ALL ON TABLE "public"."cohorts" TO "anon";
GRANT ALL ON TABLE "public"."cohorts" TO "authenticated";
GRANT ALL ON TABLE "public"."cohorts" TO "service_role";



GRANT ALL ON TABLE "public"."curricula" TO "anon";
GRANT ALL ON TABLE "public"."curricula" TO "authenticated";
GRANT ALL ON TABLE "public"."curricula" TO "service_role";



GRANT ALL ON TABLE "public"."curriculum_lessons" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_lessons" TO "service_role";



GRANT ALL ON TABLE "public"."curriculum_weeks" TO "anon";
GRANT ALL ON TABLE "public"."curriculum_weeks" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculum_weeks" TO "service_role";



GRANT ALL ON TABLE "public"."curriculums" TO "anon";
GRANT ALL ON TABLE "public"."curriculums" TO "authenticated";
GRANT ALL ON TABLE "public"."curriculums" TO "service_role";



GRANT ALL ON TABLE "public"."custom_fields" TO "anon";
GRANT ALL ON TABLE "public"."custom_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_fields" TO "service_role";



GRANT ALL ON TABLE "public"."enrollment_targets" TO "anon";
GRANT ALL ON TABLE "public"."enrollment_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollment_targets" TO "service_role";



GRANT ALL ON TABLE "public"."enrollments" TO "anon";
GRANT ALL ON TABLE "public"."enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."installments" TO "anon";
GRANT ALL ON TABLE "public"."installments" TO "authenticated";
GRANT ALL ON TABLE "public"."installments" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."enrollments_needing_duplicate_review" TO "anon";
GRANT ALL ON TABLE "public"."enrollments_needing_duplicate_review" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollments_needing_duplicate_review" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."field_values" TO "anon";
GRANT ALL ON TABLE "public"."field_values" TO "authenticated";
GRANT ALL ON TABLE "public"."field_values" TO "service_role";



GRANT ALL ON TABLE "public"."hub_invitations" TO "anon";
GRANT ALL ON TABLE "public"."hub_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."hub_members" TO "anon";
GRANT ALL ON TABLE "public"."hub_members" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_members" TO "service_role";



GRANT ALL ON TABLE "public"."hubs" TO "anon";
GRANT ALL ON TABLE "public"."hubs" TO "authenticated";
GRANT ALL ON TABLE "public"."hubs" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_change_requests" TO "anon";
GRANT ALL ON TABLE "public"."invoice_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_change_requests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lead_activities" TO "anon";
GRANT ALL ON TABLE "public"."lead_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_activities" TO "service_role";



GRANT ALL ON TABLE "public"."lead_follow_ups" TO "anon";
GRANT ALL ON TABLE "public"."lead_follow_ups" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_follow_ups" TO "service_role";



GRANT ALL ON TABLE "public"."lead_score_events" TO "anon";
GRANT ALL ON TABLE "public"."lead_score_events" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_score_events" TO "service_role";



GRANT ALL ON TABLE "public"."lead_scoring_rules" TO "anon";
GRANT ALL ON TABLE "public"."lead_scoring_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_scoring_rules" TO "service_role";



GRANT ALL ON TABLE "public"."lead_scoring_settings" TO "anon";
GRANT ALL ON TABLE "public"."lead_scoring_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_scoring_settings" TO "service_role";



GRANT ALL ON TABLE "public"."lead_sources" TO "anon";
GRANT ALL ON TABLE "public"."lead_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_sources" TO "service_role";



GRANT ALL ON TABLE "public"."lead_tag_assignments" TO "anon";
GRANT ALL ON TABLE "public"."lead_tag_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_tag_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."lead_tags" TO "anon";
GRANT ALL ON TABLE "public"."lead_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_tags" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_materials" TO "anon";
GRANT ALL ON TABLE "public"."lesson_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_materials" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaign_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaign_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaign_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaign_steps" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaign_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaign_steps" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_consent_history" TO "anon";
GRANT ALL ON TABLE "public"."marketing_consent_history" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_consent_history" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_email_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."marketing_email_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_email_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_email_templates" TO "anon";
GRANT ALL ON TABLE "public"."marketing_email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."modules" TO "anon";
GRANT ALL ON TABLE "public"."modules" TO "authenticated";
GRANT ALL ON TABLE "public"."modules" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."old_lessons" TO "anon";
GRANT ALL ON TABLE "public"."old_lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."old_lessons" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."other_income" TO "anon";
GRANT ALL ON TABLE "public"."other_income" TO "authenticated";
GRANT ALL ON TABLE "public"."other_income" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_runs" TO "anon";
GRANT ALL ON TABLE "public"."payroll_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_runs" TO "service_role";



GRANT ALL ON TABLE "public"."pending_admin_invites" TO "anon";
GRANT ALL ON TABLE "public"."pending_admin_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_admin_invites" TO "service_role";



GRANT ALL ON TABLE "public"."pending_payments" TO "anon";
GRANT ALL ON TABLE "public"."pending_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_payments" TO "service_role";



GRANT ALL ON TABLE "public"."presentation_grades" TO "anon";
GRANT ALL ON TABLE "public"."presentation_grades" TO "authenticated";
GRANT ALL ON TABLE "public"."presentation_grades" TO "service_role";



GRANT ALL ON TABLE "public"."presentations" TO "anon";
GRANT ALL ON TABLE "public"."presentations" TO "authenticated";
GRANT ALL ON TABLE "public"."presentations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_expenses" TO "anon";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_income" TO "anon";
GRANT ALL ON TABLE "public"."recurring_income" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_income" TO "service_role";



GRANT ALL ON TABLE "public"."schedules" TO "anon";
GRANT ALL ON TABLE "public"."schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."schedules" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."staff_invitations" TO "anon";
GRANT ALL ON TABLE "public"."staff_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."staff_invoices" TO "anon";
GRANT ALL ON TABLE "public"."staff_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."superadmins" TO "anon";
GRANT ALL ON TABLE "public"."superadmins" TO "authenticated";
GRANT ALL ON TABLE "public"."superadmins" TO "service_role";



GRANT ALL ON TABLE "public"."tracks" TO "anon";
GRANT ALL ON TABLE "public"."tracks" TO "authenticated";
GRANT ALL ON TABLE "public"."tracks" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







