-- Additive: old enrollments keep their access; only flow version 2 is gated.
CREATE SEQUENCE public.registration_number_seq;
ALTER TABLE public.programs ADD COLUMN tuition_fee numeric(12,2) CHECK (tuition_fee >= 1000),
  ADD COLUMN registration_plans jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.enrollments
  ADD COLUMN registration_number text UNIQUE,
  ADD COLUMN registration_flow_version integer NOT NULL DEFAULT 1,
  ADD COLUMN profile_completed_at timestamptz,
  ADD COLUMN initial_payment_amount numeric(12,2),
  ADD COLUMN registration_payment_option text CHECK (registration_payment_option IN ('full','installment','custom')),
  ADD COLUMN registration_plan_snapshot jsonb,
  ADD COLUMN custom_amount_status text CHECK (custom_amount_status IN ('pending','approved','rejected')),
  ADD COLUMN custom_review_reason text,
  ADD COLUMN custom_reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN custom_reviewed_at timestamptz;

CREATE FUNCTION public.assign_registration_number() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.registration_number IS NOT NULL AND NEW.registration_number IS DISTINCT FROM OLD.registration_number THEN
    RAISE EXCEPTION 'Registration number is immutable';
  END IF;
  IF NEW.registration_number IS NULL THEN
    NEW.registration_number := nextval('public.registration_number_seq')::text;
    NEW.registration_number := 'REG-' || extract(year FROM now())::text || '-' || lpad(NEW.registration_number, greatest(6,length(NEW.registration_number)), '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assign_registration_number BEFORE INSERT OR UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.assign_registration_number();
UPDATE public.enrollments SET registration_number = NULL;
ALTER TABLE public.enrollments ALTER COLUMN registration_number SET NOT NULL;
ALTER TABLE public.pending_payments ADD COLUMN review_reason text;

CREATE FUNCTION public.validate_registration_plans() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE plan jsonb; part jsonb; total numeric; previous_offset integer; labels text[] := '{}';
BEGIN
  IF jsonb_typeof(NEW.registration_plans) <> 'array' THEN RAISE EXCEPTION 'Plans must be an array'; END IF;
  FOR plan IN SELECT * FROM jsonb_array_elements(NEW.registration_plans) LOOP
    IF coalesce(btrim(plan->>'label'),'') = '' OR (plan->>'label') = ANY(labels) THEN RAISE EXCEPTION 'Each plan needs a unique label'; END IF;
    labels := array_append(labels, plan->>'label');
    IF jsonb_typeof(plan->'parts') IS DISTINCT FROM 'array' OR jsonb_array_length(plan->'parts') < 2 THEN RAISE EXCEPTION 'Installment plans need at least two payments'; END IF;
    total := 0; previous_offset := -1;
    FOR part IN SELECT * FROM jsonb_array_elements(plan->'parts') LOOP
      IF (part->>'percent') IS NULL OR (part->>'percent')::numeric <= 0 OR (part->>'days') IS NULL
        OR (part->>'days')::numeric <> trunc((part->>'days')::numeric)
        OR (part->>'days')::integer <= previous_offset
        OR (previous_offset = -1 AND (part->>'days')::integer <> 0) THEN RAISE EXCEPTION 'Invalid percentages or due-day offsets'; END IF;
      IF NEW.tuition_fee IS NOT NULL AND round(NEW.tuition_fee * (part->>'percent')::numeric / 100,2) < 1000 THEN RAISE EXCEPTION 'Every installment must be at least NGN 1,000'; END IF;
      total := total + (part->>'percent')::numeric; previous_offset := (part->>'days')::integer;
    END LOOP;
    IF total <> 100 THEN RAISE EXCEPTION 'Plan percentages must total 100'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_registration_plans BEFORE INSERT OR UPDATE OF tuition_fee, registration_plans ON public.programs
FOR EACH ROW EXECUTE FUNCTION public.validate_registration_plans();

CREATE FUNCTION public.registration_eligible(p_enrollment_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT e.registration_flow_version = 1 OR (
    e.profile_completed_at IS NOT NULL AND e.amount_paid >= e.initial_payment_amount
    AND (e.registration_payment_option <> 'custom' OR e.custom_amount_status = 'approved')
    AND e.enrollment_status <> 'cancelled') FROM enrollments e WHERE e.id = p_enrollment_id), false);
$$;

CREATE FUNCTION public.registration_profile_available(p_enrollment_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM enrollments e WHERE e.id = p_enrollment_id AND
    (e.registration_flow_version = 1 OR e.amount_paid >= e.initial_payment_amount OR EXISTS(
      SELECT 1 FROM pending_payments pp WHERE pp.enrollment_id=e.id AND pp.status IN ('pending','approved'))));
$$;

CREATE FUNCTION public.start_registration(p_program_id uuid, p_full_name text, p_phone text,
  p_cohort_id uuid DEFAULT NULL, p_option text DEFAULT 'full', p_plan_label text DEFAULT NULL,
  p_custom_amount numeric DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prog programs; enr enrollments; enrollment_id uuid; invoice_id uuid; plan jsonb; part jsonb;
  fee numeric; amount numeric; allocated numeric := 0; n integer := 0; count_parts integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to register'; END IF;
  IF btrim(coalesce(p_full_name,'')) = '' OR p_phone !~ '^\+[1-9][0-9]{6,14}$' OR p_phone IS NULL THEN RAISE EXCEPTION 'Name and international WhatsApp number required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_program_id::text,0));
  SELECT * INTO enr FROM enrollments WHERE user_id = auth.uid() AND program_id = p_program_id AND enrollment_status <> 'cancelled' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN enr.id; END IF;
  -- Retain the previous public form's same-phone/same-course duplicate guard.
  -- Shared family numbers on different courses remain valid.
  PERFORM pg_advisory_xact_lock(hashtextextended(right(regexp_replace(p_phone,'[^0-9]','','g'),10)||p_program_id::text,1));
  IF EXISTS(SELECT 1 FROM enrollments WHERE program_id=p_program_id AND enrollment_status<>'cancelled'
    AND (phone_normalized=right(regexp_replace(p_phone,'[^0-9]','','g'),10)
      OR lower(email)=lower((SELECT email FROM auth.users WHERE id=auth.uid())))) THEN
    RAISE EXCEPTION 'An enrollment already exists for this course and contact details. Please contact the front desk to link your record or register family members on the same course.';
  END IF;
  SELECT * INTO prog FROM programs WHERE id=p_program_id AND active FOR SHARE;
  IF NOT FOUND OR prog.tuition_fee IS NULL THEN RAISE EXCEPTION 'Course pricing is not configured'; END IF;
  IF p_cohort_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cohorts WHERE id=p_cohort_id AND program_id=p_program_id AND status IN ('active','upcoming')) THEN RAISE EXCEPTION 'Cohort unavailable for this course'; END IF;
  fee := prog.tuition_fee;
  IF p_option = 'full' THEN
    plan := jsonb_build_object('label','Full payment','parts',jsonb_build_array(jsonb_build_object('percent',100,'days',0))); amount := fee;
  ELSIF p_option = 'installment' THEN
    SELECT value INTO plan FROM jsonb_array_elements(prog.registration_plans) WHERE value->>'label'=p_plan_label;
    IF plan IS NULL THEN RAISE EXCEPTION 'Installment plan unavailable'; END IF;
    amount := round(fee * (plan->'parts'->0->>'percent')::numeric / 100,2);
  ELSIF p_option = 'custom' THEN
    IF p_custom_amount IS NULL OR p_custom_amount <> round(p_custom_amount,2) OR p_custom_amount < 1000 OR p_custom_amount >= fee OR fee-p_custom_amount < 1000 THEN RAISE EXCEPTION 'Custom deposit and remaining balance must each be at least NGN 1,000'; END IF;
    amount := p_custom_amount; plan := jsonb_build_object('label','Custom deposit','deposit',amount,'remaining',fee-amount);
  ELSE RAISE EXCEPTION 'Invalid payment option'; END IF;
  INSERT INTO enrollments(user_id,full_name,email,phone,program_id,cohort_id,total_amount,registration_flow_version,
    initial_payment_amount,registration_payment_option,registration_plan_snapshot,custom_amount_status)
  VALUES(auth.uid(),btrim(p_full_name),(SELECT email FROM auth.users WHERE id=auth.uid()),p_phone,p_program_id,p_cohort_id,fee,2,
    amount,p_option,plan,CASE WHEN p_option='custom' THEN 'pending' END) RETURNING id INTO enrollment_id;
  INSERT INTO invoices(enrollment_id,invoice_number,total_amount,status,payment_plan_type)
  VALUES(enrollment_id,'',fee,'active',CASE WHEN p_option='full' THEN 'single' ELSE 'installment' END) RETURNING id INTO invoice_id;
  IF p_option='custom' THEN
    INSERT INTO installments(invoice_id,amount,due_date) VALUES(invoice_id,amount,current_date);
  ELSE
    count_parts := jsonb_array_length(plan->'parts');
    FOR part IN SELECT * FROM jsonb_array_elements(plan->'parts') LOOP
      n := n+1;
      amount := CASE WHEN n=count_parts THEN fee-allocated ELSE round(fee*(part->>'percent')::numeric/100,2) END;
      INSERT INTO installments(invoice_id,amount,due_date) VALUES(invoice_id,amount,current_date+(part->>'days')::integer);
      allocated := allocated+amount;
    END LOOP;
  END IF;
  RETURN enrollment_id;
END $$;

CREATE TABLE public.registration_payment_attempts (
  reference text PRIMARY KEY, invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  installment_id uuid REFERENCES public.installments(id), amount numeric(12,2) NOT NULL CHECK(amount>0),
  currency text NOT NULL DEFAULT 'NGN', status text NOT NULL DEFAULT 'initialized' CHECK(status IN ('initialized','paid')),
  created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);
ALTER TABLE public.registration_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read payment attempts" ON public.registration_payment_attempts FOR SELECT TO authenticated USING(public.invoice_is_mine(invoice_id));
GRANT SELECT ON public.registration_payment_attempts TO authenticated;
GRANT ALL ON public.registration_payment_attempts TO service_role;

-- A single transaction handles callback, webhook, and manual transfer approval.
CREATE FUNCTION public.record_verified_payment(p_invoice_id uuid, p_installment_id uuid, p_amount numeric,
  p_reference text, p_method text, p_paid_at timestamptz, p_bank_transaction_id uuid DEFAULT NULL,
  p_source text DEFAULT 'paystack') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv invoices; paid numeric; prior_paid numeric;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.status='cancelled' THEN RAISE EXCEPTION 'Invoice unavailable'; END IF;
  -- Serialize all invoices for an enrollment before changing its balance.
  PERFORM 1 FROM enrollments WHERE id=inv.enrollment_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM payments WHERE payment_reference=p_reference) THEN RETURN; END IF;
  IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
  IF p_installment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM installments WHERE id=p_installment_id AND invoice_id=inv.id) THEN RAISE EXCEPTION 'Installment does not belong to invoice'; END IF;
  SELECT coalesce(sum(amount),0) INTO prior_paid FROM installments WHERE invoice_id=inv.id AND status='paid';
  INSERT INTO payments(invoice_id,installment_id,amount,payment_reference,payment_method,payment_date,paid_at_actual,paid_at_source,bank_transaction_id)
  VALUES(inv.id,p_installment_id,p_amount,p_reference,p_method,p_paid_at::date,
    CASE WHEN p_source IN ('paystack','bank_statement') THEN p_paid_at END,p_source,p_bank_transaction_id);
  SELECT coalesce(sum(amount),0) INTO paid FROM payments WHERE invoice_id=inv.id;
  IF EXISTS(SELECT 1 FROM enrollments WHERE id=inv.enrollment_id AND registration_flow_version=1) THEN paid:=greatest(paid,prior_paid+p_amount); END IF;
  -- Allocate actual money across the schedule; a partial payment never marks a whole part paid.
  WITH running AS (SELECT id,sum(amount) OVER (ORDER BY due_date,created_at,id) AS threshold FROM installments WHERE invoice_id=inv.id)
  UPDATE installments i SET status=CASE WHEN r.threshold<=paid THEN 'paid' ELSE 'pending' END,
    paid_at=CASE WHEN r.threshold<=paid THEN coalesce(i.paid_at,p_paid_at) END,
    paid_at_actual=CASE WHEN r.threshold<=paid AND i.status<>'paid' AND p_source IN ('paystack','bank_statement') THEN p_paid_at ELSE i.paid_at_actual END,
    paid_at_source=CASE WHEN r.threshold<=paid AND i.status<>'paid' THEN p_source ELSE i.paid_at_source END,
    bank_transaction_id=CASE WHEN i.id=p_installment_id THEN coalesce(p_bank_transaction_id,i.bank_transaction_id) ELSE i.bank_transaction_id END
  FROM running r WHERE i.id=r.id;
  UPDATE invoices SET status=CASE WHEN paid>=total_amount THEN 'paid' ELSE 'active' END WHERE id=inv.id;
  UPDATE enrollments SET amount_paid=amount_paid+p_amount,
    first_payment_date=coalesce(first_payment_date,p_paid_at),last_payment_date=p_paid_at,
    enrollment_status=CASE WHEN amount_paid+p_amount>=total_amount THEN 'completed' ELSE 'active' END
  WHERE id=inv.enrollment_id;
  PERFORM public.activate_registration(inv.enrollment_id);
END $$;

CREATE FUNCTION public.complete_paystack_attempt(p_reference text,p_paid_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE attempt registration_payment_attempts;
BEGIN
 SELECT * INTO attempt FROM registration_payment_attempts WHERE reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown payment attempt'; END IF;
 IF attempt.status='paid' THEN RETURN false; END IF;
 PERFORM record_verified_payment(attempt.invoice_id,attempt.installment_id,attempt.amount,attempt.reference,'paystack',p_paid_at);
 UPDATE registration_payment_attempts SET status='paid',paid_at=p_paid_at WHERE reference=p_reference;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_paystack_attempt(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_paystack_attempt(text,timestamptz) TO service_role;

CREATE FUNCTION public.submit_registration_receipt(p_enrollment_id uuid,p_path text,p_reference text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv invoices; part installments; result uuid;
BEGIN
  PERFORM 1 FROM enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() AND registration_flow_version=2 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  SELECT * INTO inv FROM invoices WHERE enrollment_id=p_enrollment_id AND status<>'cancelled' ORDER BY created_at LIMIT 1;
  SELECT * INTO part FROM installments WHERE invoice_id=inv.id AND status<>'paid' ORDER BY due_date,id LIMIT 1;
  IF part.id IS NULL THEN RAISE EXCEPTION 'Nothing to pay'; END IF;
  IF split_part(p_path,'/',1)<>auth.uid()::text OR split_part(p_path,'/',2)<>inv.id::text OR NOT EXISTS(
    SELECT 1 FROM storage.objects WHERE bucket_id='registration-receipts' AND name=p_path) THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  SELECT id INTO result FROM pending_payments WHERE enrollment_id=p_enrollment_id AND status='pending' LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;
  INSERT INTO pending_payments(invoice_id,enrollment_id,installment_id,amount,payment_reference,evidence_url,submitted_by)
  VALUES(inv.id,p_enrollment_id,part.id,part.amount,p_reference,p_path,auth.uid()) RETURNING id INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.review_registration_transfer(p_pending_id uuid,p_approve boolean,p_paid_at timestamptz DEFAULT now(),p_bank_transaction_id uuid DEFAULT NULL,p_reason text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item pending_payments; bank bank_transactions;
BEGIN
  SELECT * INTO item FROM pending_payments WHERE id=p_pending_id FOR UPDATE;
  IF item.id IS NULL OR NOT (is_superadmin() OR (has_role(auth.uid(),'admin') AND enrollment_in_my_hub(item.enrollment_id))) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF item.status<>'pending' THEN RETURN false; END IF;
  IF NOT p_approve AND coalesce(btrim(p_reason),'')='' THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  IF p_bank_transaction_id IS NOT NULL THEN
    SELECT * INTO bank FROM bank_transactions WHERE id=p_bank_transaction_id FOR UPDATE;
    IF bank.id IS NULL OR bank.amount<>item.amount OR bank.hub_id<>get_my_hub_id() THEN RAISE EXCEPTION 'Invalid bank match'; END IF;
    IF EXISTS(SELECT 1 FROM payments WHERE bank_transaction_id=bank.id) OR EXISTS(SELECT 1 FROM installments WHERE bank_transaction_id=bank.id) THEN RAISE EXCEPTION 'Bank deposit already reconciled'; END IF;
    p_paid_at:=bank.occurred_at;
  END IF;
  IF p_approve THEN
    PERFORM record_verified_payment(item.invoice_id,item.installment_id,item.amount,'TRANSFER-'||item.id,'bank_transfer',p_paid_at,p_bank_transaction_id,
      CASE WHEN p_bank_transaction_id IS NULL THEN 'staff_entered' ELSE 'bank_statement' END);
  END IF;
  UPDATE pending_payments SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now(),
    review_reason=coalesce(nullif(btrim(p_reason),''),'Payment verified') WHERE id=item.id;
  INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(auth.uid(),'registration_transfer_review','pending_payment',item.id,jsonb_build_object('approved',p_approve,'reason',p_reason));
  RETURN true;
END $$;

CREATE FUNCTION public.review_custom_registration(p_enrollment_id uuid,p_approve boolean,p_reason text,p_schedule jsonb DEFAULT '[]') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE enr enrollments; inv invoices; part jsonb; total numeric:=0;
BEGIN
  SELECT * INTO enr FROM enrollments WHERE id=p_enrollment_id FOR UPDATE;
  IF enr.id IS NULL OR NOT (is_superadmin() OR (has_role(auth.uid(),'admin') AND enrollment_in_my_hub(enr.id))) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF enr.registration_payment_option IS DISTINCT FROM 'custom' OR btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Custom registration and review reason required'; END IF;
  IF enr.custom_amount_status='approved' THEN RETURN; END IF;
  SELECT * INTO inv FROM invoices WHERE enrollment_id=enr.id AND status<>'cancelled' ORDER BY created_at LIMIT 1;
  IF p_approve THEN
    IF jsonb_typeof(p_schedule)<>'array' OR jsonb_array_length(p_schedule)=0 THEN RAISE EXCEPTION 'Remaining schedule required'; END IF;
    FOR part IN SELECT * FROM jsonb_array_elements(p_schedule) LOOP
      IF coalesce((part->>'amount')::numeric,0)<1000 OR (part->>'amount')::numeric<>round((part->>'amount')::numeric,2)
        OR (part->>'due_date') IS NULL OR (part->>'due_date')::date<=current_date THEN RAISE EXCEPTION 'Remaining payments need a future date'; END IF;
      total:=total+(part->>'amount')::numeric;
    END LOOP;
    IF total<>enr.total_amount-enr.initial_payment_amount THEN RAISE EXCEPTION 'Schedule must equal the balance after the deposit'; END IF;
    -- The deposit row is retained even if transfer review is still pending.
    FOR part IN SELECT * FROM jsonb_array_elements(p_schedule) LOOP
      INSERT INTO installments(invoice_id,amount,due_date) VALUES(inv.id,(part->>'amount')::numeric,(part->>'due_date')::date);
    END LOOP;
  END IF;
  UPDATE enrollments SET custom_amount_status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    custom_review_reason=btrim(p_reason),custom_reviewed_by=auth.uid(),custom_reviewed_at=now() WHERE id=enr.id;
  INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(auth.uid(),'custom_registration_review','enrollment',enr.id,jsonb_build_object('approved',p_approve,'reason',p_reason,'schedule',p_schedule));
  PERFORM activate_registration(enr.id);
END $$;

-- Guard every existing membership creation path, including classroom backfills.
DO $$ DECLARE definition text; BEGIN
  definition:=pg_get_functiondef('public.auto_enroll_student_in_classrooms()'::regprocedure);
  definition:=replace(definition,'BEGIN','BEGIN' || E'\n  IF NOT public.registration_eligible(NEW.id) THEN RETURN NEW; END IF;');
  EXECUTE definition;
  definition:=pg_get_functiondef('public.auto_enroll_student_classroom(uuid)'::regprocedure);
  definition:=replace(definition,'BEGIN','BEGIN' || E'\n  IF NOT public.registration_eligible(p_enrollment_id) THEN RETURN; END IF;');
  definition:=replace(definition, 'WHERE classroom_id = _cls.id AND status = ''active''',
    'WHERE classroom_id = _cls.id AND ((_e.cohort_id IS NOT NULL AND id = _e.cohort_id) OR (_e.cohort_id IS NULL AND status = ''active''))');
  EXECUTE definition;
  definition:=pg_get_functiondef('public.backfill_classroom_students_on_classroom_insert()'::regprocedure);
  definition:=replace(definition,'WHERE e.program_id = NEW.program_id','WHERE public.registration_eligible(e.id) AND e.program_id = NEW.program_id');
  EXECUTE definition;
  definition:=pg_get_functiondef('public.auto_enroll_on_classroom_program()'::regprocedure);
  definition:=replace(definition,'e.user_id IS NOT NULL','e.user_id IS NOT NULL AND public.registration_eligible(e.id)');
  EXECUTE definition;
  definition:=pg_get_functiondef('public.classroom_read_access(uuid)'::regprocedure);
  definition:=replace(definition,'e.user_id = auth.uid()','e.user_id = auth.uid() AND public.registration_eligible(e.id)');
  definition:=replace(definition,'cs.student_id = auth.uid()','cs.student_id = auth.uid() AND (cs.enrollment_id IS NULL OR public.registration_eligible(cs.enrollment_id))');
  definition:=replace(definition,'cst.student_id = auth.uid()','cst.student_id = auth.uid() AND (cst.enrollment_id IS NULL OR public.registration_eligible(cst.enrollment_id))');
  EXECUTE definition;
  definition:=pg_get_functiondef('public.cohort_is_mine(uuid)'::regprocedure);
  definition:=replace(definition,'e.user_id = auth.uid()','e.user_id = auth.uid() AND public.registration_eligible(e.id)');
  definition:=replace(definition,'cst.student_id = auth.uid()','cst.student_id = auth.uid() AND (cst.enrollment_id IS NULL OR public.registration_eligible(cst.enrollment_id))');
  EXECUTE definition;
END $$;

CREATE FUNCTION public.guard_registration_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.enrollment_id IS NOT NULL AND NOT registration_eligible(NEW.enrollment_id) THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_registration_membership BEFORE INSERT OR UPDATE ON public.classroom_students
FOR EACH ROW EXECUTE FUNCTION public.guard_registration_membership();
CREATE TRIGGER guard_registration_membership BEFORE INSERT OR UPDATE ON public.cohort_students
FOR EACH ROW EXECUTE FUNCTION public.guard_registration_membership();

CREATE FUNCTION public.activate_registration(p_enrollment_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF registration_eligible(p_enrollment_id) THEN
    PERFORM auto_enroll_student_classroom(p_enrollment_id);
    INSERT INTO cohort_students(cohort_id,student_id,enrollment_id)
      SELECT co.id,e.user_id,e.id FROM enrollments e JOIN cohorts co ON co.id=e.cohort_id AND co.program_id=e.program_id
      WHERE e.id=p_enrollment_id AND e.user_id IS NOT NULL AND co.status IN ('active','upcoming')
      ON CONFLICT(cohort_id,student_id) DO NOTHING;
  END IF;
END $$;

-- Existing program-based RLS also needs the eligibility predicate: route guards alone are insufficient.
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND policyname IN
    ('Students read curricula for their programs','Students read lessons for their programs','Students read modules for their programs','Students read tracks for their programs','Students read units for their programs') LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',pol.policyname,pol.tablename,
      replace(pol.qual,'(e.user_id = auth.uid())','(e.user_id = auth.uid() AND public.registration_eligible(e.id))'));
  END LOOP;
END $$;

-- Preserve the existing profile upsert and add authoritative completion validation.
ALTER FUNCTION public.submit_enrollment_fields(uuid,jsonb) RENAME TO save_enrollment_fields;
REVOKE ALL ON FUNCTION public.save_enrollment_fields(uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.submit_enrollment_fields(p_enrollment_id uuid,p_fields jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE enr enrollments; missing text; dob text;
BEGIN
  SELECT * INTO enr FROM enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'You may only update your own enrollment'; END IF;
  IF NOT registration_profile_available(enr.id) THEN RAISE EXCEPTION 'Submit payment before completing registration'; END IF;
  PERFORM save_enrollment_fields(enr.id,p_fields);
  SELECT string_agg(cf.label,', ') INTO missing FROM custom_fields cf
  JOIN programs p ON p.id=enr.program_id
  LEFT JOIN field_values fv ON fv.field_id=cf.id AND fv.enrollment_id=enr.id
  WHERE cf.active AND cf.visible_to_student AND (cf.hub_id IS NULL OR cf.hub_id=p.hub_id)
    AND (cf.required OR (enr.profile_requirements_version>=2 AND cf.key=ANY(ARRAY['surname','first_name','date_of_birth','sex','pwd_status','state_of_residence','residential_address','highest_educational_qualification'])))
    AND NOT (cf.key='current_academic_level' AND coalesce(p_fields->>'highest_education','')<>'SIWES/IT (Internship)')
    AND coalesce(btrim(fv.value),'')='';
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Required fields: %',missing; END IF;
  SELECT fv.value INTO dob FROM field_values fv JOIN custom_fields cf ON cf.id=fv.field_id
    WHERE fv.enrollment_id=enr.id AND cf.key='date_of_birth' AND cf.active AND cf.visible_to_student LIMIT 1;
  IF nullif(btrim(dob),'') IS NOT NULL AND dob::date>current_date-interval '8 years' THEN RAISE EXCEPTION 'Applicant must be at least 8 years old'; END IF;
  UPDATE enrollments SET profile_completed_at=now() WHERE id=enr.id;
  PERFORM activate_registration(enr.id);
END $$;

CREATE OR REPLACE FUNCTION public.get_enrollment_for_completion(p_enrollment_id uuid)
RETURNS TABLE(id uuid,full_name text,email text,phone text,user_id uuid,program_name text,hub_id uuid,profile_requirements_version integer)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id,e.full_name,e.email,e.phone,e.user_id,p.program_name,p.hub_id,e.profile_requirements_version
  FROM enrollments e JOIN programs p ON p.id=e.program_id WHERE e.id=p_enrollment_id AND auth.uid() IS NOT NULL
    AND (e.user_id=auth.uid() OR (e.user_id IS NULL AND lower(e.email)=lower((SELECT u.email FROM auth.users u WHERE u.id=auth.uid()))));
$$;
CREATE OR REPLACE FUNCTION public.get_enrollment_field_values(p_enrollment_id uuid)
RETURNS TABLE(field_key text,value text) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT cf.key,fv.value FROM field_values fv JOIN custom_fields cf ON cf.id=fv.field_id
  WHERE fv.enrollment_id=p_enrollment_id AND cf.active AND cf.visible_to_student
    AND EXISTS(SELECT 1 FROM get_enrollment_for_completion(p_enrollment_id));
$$;

CREATE FUNCTION public.get_registration_progress() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('dashboard_access',EXISTS(SELECT 1 FROM enrollments e WHERE e.user_id=auth.uid() AND registration_eligible(e.id)),
 'registrations',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT e.*,p.program_name,
 registration_eligible(e.id) AS eligible,registration_profile_available(e.id) AS profile_available,
 (SELECT i.id FROM invoices i WHERE i.enrollment_id=e.id AND i.status<>'cancelled' ORDER BY created_at LIMIT 1) AS invoice_id
 FROM enrollments e JOIN programs p ON p.id=e.program_id WHERE e.user_id=auth.uid() ORDER BY e.created_at DESC) r),'[]'::jsonb));
$$;

-- Prevent authenticated clients bypassing receipt submission or editing clearance fields through RLS.
CREATE FUNCTION public.protect_registration_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND (NEW.registration_flow_version=2 OR (TG_OP='UPDATE' AND OLD.registration_flow_version=2))
     AND NOT (public.is_superadmin() OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Use the registration operations to update this record';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_registration_fields BEFORE INSERT OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.protect_registration_fields();
DROP POLICY "Public can self-enroll" ON public.enrollments;
DROP POLICY "Public can insert field values for pending enrollments" ON public.field_values;
DROP POLICY "Public can update field values for unlinked enrollments" ON public.field_values;
CREATE POLICY "Registration receipts use server submission" ON public.pending_payments AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT EXISTS(SELECT 1 FROM enrollments e WHERE e.id=enrollment_id AND e.registration_flow_version=2));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
('registration-receipts','registration-receipts',false,5242880,ARRAY['application/pdf','image/jpeg','image/png','image/webp']);
CREATE POLICY "Applicants upload registration receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK
(bucket_id='registration-receipts' AND (storage.foldername(name))[1]=auth.uid()::text AND EXISTS(
 SELECT 1 FROM invoices i JOIN enrollments e ON e.id=i.enrollment_id WHERE i.id::text=(storage.foldername(name))[2] AND e.user_id=auth.uid()));
CREATE POLICY "Owners and hub admins read registration receipts" ON storage.objects FOR SELECT TO authenticated USING
(bucket_id='registration-receipts' AND ((storage.foldername(name))[1]=auth.uid()::text OR is_superadmin() OR EXISTS(
 SELECT 1 FROM invoices i WHERE i.id::text=(storage.foldername(name))[2] AND has_role(auth.uid(),'admin') AND enrollment_in_my_hub(i.enrollment_id))));

-- Functions are private by default; explicitly expose only authenticated operations.
REVOKE ALL ON FUNCTION public.record_verified_payment(uuid,uuid,numeric,text,text,timestamptz,uuid,text),public.activate_registration(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_payment(uuid,uuid,numeric,text,text,timestamptz,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.start_registration(uuid,text,text,uuid,text,text,numeric),public.submit_registration_receipt(uuid,text,text),
 public.review_registration_transfer(uuid,boolean,timestamptz,uuid,text),public.review_custom_registration(uuid,boolean,text,jsonb),
 public.get_registration_progress(),public.submit_enrollment_fields(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_registration(uuid,text,text,uuid,text,text,numeric),public.submit_registration_receipt(uuid,text,text),
 public.review_registration_transfer(uuid,boolean,timestamptz,uuid,text),public.review_custom_registration(uuid,boolean,text,jsonb),
 public.get_registration_progress(),public.submit_enrollment_fields(uuid,jsonb) TO authenticated;
