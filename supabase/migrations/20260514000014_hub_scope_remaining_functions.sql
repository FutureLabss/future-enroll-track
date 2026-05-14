-- Hub-scope remaining functions and tables.
-- 1. enrollment_targets: add hub_id, fix unique constraint, update RLS, seed RhemaHub
-- 2. get_enrollment_performance: hub scope + created_at (not installments)
-- 3. list_outstanding_invoices: hub scope + payments (not installments) for amount_paid
-- 4. approve_staff_invoice / post_recurring_expense / post_recurring_income: pass hub_id

-- ── 1. enrollment_targets: migrate constraint + add hub_id ────────────────────
ALTER TABLE public.enrollment_targets
  DROP CONSTRAINT IF EXISTS enrollment_targets_target_month_key;

ALTER TABLE public.enrollment_targets
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);

UPDATE public.enrollment_targets
  SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE hub_id IS NULL;

ALTER TABLE public.enrollment_targets
  ALTER COLUMN hub_id SET NOT NULL;

ALTER TABLE public.enrollment_targets
  ADD CONSTRAINT enrollment_targets_hub_month_key UNIQUE (hub_id, target_month);

DROP POLICY IF EXISTS "Admins manage enrollment targets" ON public.enrollment_targets;
CREATE POLICY "Admins manage enrollment targets"
  ON public.enrollment_targets FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );

-- ── 2. Seed RhemaHub enrollment targets ──────────────────────────────────────
INSERT INTO public.enrollment_targets (id, target_month, target_count, hub_id)
VALUES
  ('e0000001-0000-0000-0000-000000000001'::uuid, '2026-01-01', 3, '00000000-0000-0000-0000-000000000002'::uuid),
  ('e0000001-0000-0000-0000-000000000002'::uuid, '2026-02-01', 3, '00000000-0000-0000-0000-000000000002'::uuid),
  ('e0000001-0000-0000-0000-000000000003'::uuid, '2026-03-01', 4, '00000000-0000-0000-0000-000000000002'::uuid),
  ('e0000001-0000-0000-0000-000000000004'::uuid, '2026-04-01', 4, '00000000-0000-0000-0000-000000000002'::uuid),
  ('e0000001-0000-0000-0000-000000000005'::uuid, '2026-05-01', 5, '00000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (hub_id, target_month) DO NOTHING;

-- ── 3. get_enrollment_performance: hub scope, use enrollments.created_at ──────
CREATE OR REPLACE FUNCTION public.get_enrollment_performance(
  p_months     int  DEFAULT 12,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL
)
RETURNS TABLE (
  month            date,
  target_count     integer,
  actual_count     integer,
  variance         integer,
  achievement_pct  numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _start date;
  _end   date;
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

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(_start, _end, '1 month'::interval)::date AS m
  ),
  actual AS (
    SELECT date_trunc('month', e.created_at)::date AS m,
           COUNT(*)::int AS cnt
    FROM public.enrollments e
    JOIN public.programs pr ON pr.id = e.program_id
    WHERE pr.hub_id = _hub
      AND e.enrollment_status NOT IN ('cancelled', 'withdrawn')
    GROUP BY 1
  ),
  tgt AS (
    SELECT t.target_month AS m, t.target_count AS cnt
    FROM public.enrollment_targets t
    WHERE t.hub_id = _hub
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

GRANT EXECUTE ON FUNCTION public.get_enrollment_performance(int, date, date) TO authenticated;

-- ── 4. list_outstanding_invoices: hub scope + payments for amount_paid ─────────
CREATE OR REPLACE FUNCTION public.list_outstanding_invoices(p_only_overdue boolean DEFAULT false)
RETURNS TABLE (
  invoice_id            uuid,
  invoice_number        text,
  enrollment_id         uuid,
  full_name             text,
  email                 text,
  phone                 text,
  program_name          text,
  cohort_label          text,
  total_amount          numeric,
  amount_paid           numeric,
  outstanding           numeric,
  next_due_date         date,
  earliest_overdue_date date,
  days_overdue          integer,
  is_overdue            boolean,
  invoice_status        text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _hub uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only admins can view outstanding invoices';
  END IF;

  _hub := public.get_my_hub_id();

  RETURN QUERY
  WITH pay_agg AS (
    SELECT p.invoice_id,
           SUM(p.amount) AS paid_amt
    FROM public.payments p
    GROUP BY p.invoice_id
  ),
  inst_agg AS (
    SELECT i.invoice_id,
           MIN(CASE WHEN i.status = 'pending' THEN i.due_date END)                               AS next_due,
           MIN(CASE WHEN i.status = 'pending' AND i.due_date < CURRENT_DATE THEN i.due_date END) AS earliest_overdue
    FROM public.installments i
    GROUP BY i.invoice_id
  )
  SELECT
    inv.id,
    inv.invoice_number,
    e.id,
    e.full_name,
    e.email,
    e.phone,
    pr.program_name,
    c.cohort_label,
    inv.total_amount,
    COALESCE(pa.paid_amt, 0)::numeric,
    GREATEST(inv.total_amount - COALESCE(pa.paid_amt, 0), 0)::numeric,
    ia.next_due,
    ia.earliest_overdue,
    CASE WHEN ia.earliest_overdue IS NOT NULL
         THEN (CURRENT_DATE - ia.earliest_overdue)::integer
         ELSE 0 END,
    (ia.earliest_overdue IS NOT NULL OR inv.status = 'overdue'),
    inv.status::text
  FROM public.invoices inv
  JOIN public.enrollments e   ON e.id  = inv.enrollment_id
  JOIN public.programs    pr  ON pr.id = e.program_id
  LEFT JOIN public.cohorts    c   ON c.id  = e.cohort_id
  LEFT JOIN pay_agg           pa  ON pa.invoice_id = inv.id
  LEFT JOIN inst_agg          ia  ON ia.invoice_id = inv.id
  WHERE pr.hub_id = _hub
    AND inv.status NOT IN ('paid', 'cancelled', 'draft')
    AND (inv.total_amount - COALESCE(pa.paid_amt, 0)) > 0
    AND (NOT p_only_overdue OR ia.earliest_overdue IS NOT NULL OR inv.status = 'overdue')
  ORDER BY ia.earliest_overdue NULLS LAST, ia.next_due NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_outstanding_invoices(boolean) TO authenticated;

-- ── 5. approve_staff_invoice: include hub_id ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_staff_invoice(
  p_id           uuid,
  p_payment_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r           public.staff_invoices%ROWTYPE;
  _expense_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the superadmin can approve staff invoices';
  END IF;

  SELECT * INTO r FROM public.staff_invoices WHERE id = p_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Staff invoice not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Staff invoice already %', r.status; END IF;

  INSERT INTO public.expenses (category, vendor_name, amount, payment_date, payment_method, notes, recorded_by, hub_id)
  VALUES ('Staff Reimbursement', r.staff_name, r.amount,
          COALESCE(p_payment_date, CURRENT_DATE), 'bank_transfer',
          COALESCE(r.title, '') || COALESCE(' - ' || NULLIF(r.description, ''), '') || ' [staff invoice]',
          auth.uid(),
          public.get_my_hub_id())
  RETURNING id INTO _expense_id;

  UPDATE public.staff_invoices
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), expense_id = _expense_id
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approve_staff_invoice', 'staff_invoice', p_id,
          jsonb_build_object('expense_id', _expense_id, 'amount', r.amount));

  RETURN _expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_staff_invoice(uuid, date) TO authenticated;

-- ── 6. post_recurring_expense: include hub_id ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_recurring_expense(
  p_id           uuid,
  p_payment_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

GRANT EXECUTE ON FUNCTION public.post_recurring_expense(uuid, date) TO authenticated;

-- ── 7. post_recurring_income: include hub_id ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_recurring_income(
  p_id           uuid,
  p_payment_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
     SET last_posted_date = _post_date,
         next_due_date    = public.compute_next_recurrence(r.next_due_date, r.frequency),
         updated_at       = now()
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'post_recurring', 'other_income', _new_id,
          jsonb_build_object('recurring_id', p_id, 'amount', r.amount, 'date', _post_date));

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_recurring_income(uuid, date) TO authenticated;
