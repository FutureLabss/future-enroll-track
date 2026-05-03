
CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  vendor_name text,
  amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  next_due_date date NOT NULL DEFAULT CURRENT_DATE,
  last_posted_date date,
  payment_method text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expenses_freq_chk CHECK (frequency IN ('weekly','monthly','yearly'))
);

CREATE TABLE public.recurring_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  payer_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  next_due_date date NOT NULL DEFAULT CURRENT_DATE,
  last_posted_date date,
  payment_method text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_income_freq_chk CHECK (frequency IN ('weekly','monthly','yearly'))
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recurring expenses"
  ON public.recurring_expenses FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Admins manage recurring income"
  ON public.recurring_income FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_rec_exp_updated BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rec_inc_updated BEFORE UPDATE ON public.recurring_income
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.compute_next_recurrence(_d date, _freq text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _freq
    WHEN 'weekly' THEN _d + INTERVAL '1 week'
    WHEN 'yearly' THEN _d + INTERVAL '1 year'
    ELSE _d + INTERVAL '1 month'
  END::date
$$;

CREATE OR REPLACE FUNCTION public.post_recurring_expense(p_id uuid, p_payment_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.recurring_expenses%ROWTYPE;
  _new_id uuid;
  _post_date date;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can post recurring expenses';
  END IF;

  SELECT * INTO r FROM public.recurring_expenses WHERE id = p_id AND active = true;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Recurring expense not found or inactive'; END IF;

  _post_date := COALESCE(p_payment_date, r.next_due_date);

  INSERT INTO public.expenses (category, vendor_name, amount, payment_date, payment_method, notes, recorded_by)
  VALUES (r.category, r.vendor_name, r.amount, _post_date, r.payment_method,
          COALESCE(r.notes,'') || ' [recurring]', auth.uid())
  RETURNING id INTO _new_id;

  UPDATE public.recurring_expenses
     SET last_posted_date = _post_date,
         next_due_date = public.compute_next_recurrence(r.next_due_date, r.frequency),
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(),'post_recurring','expense', _new_id,
          jsonb_build_object('recurring_id', p_id, 'amount', r.amount, 'date', _post_date));

  RETURN _new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_recurring_income(p_id uuid, p_payment_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.recurring_income%ROWTYPE;
  _new_id uuid;
  _post_date date;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can post recurring income';
  END IF;

  SELECT * INTO r FROM public.recurring_income WHERE id = p_id AND active = true;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Recurring income not found or inactive'; END IF;

  _post_date := COALESCE(p_payment_date, r.next_due_date);

  INSERT INTO public.other_income (category, payer_name, amount, payment_date, payment_method, notes, recorded_by)
  VALUES (r.category, r.payer_name, r.amount, _post_date, r.payment_method,
          COALESCE(r.notes,'') || ' [recurring]', auth.uid())
  RETURNING id INTO _new_id;

  UPDATE public.recurring_income
     SET last_posted_date = _post_date,
         next_due_date = public.compute_next_recurrence(r.next_due_date, r.frequency),
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(),'post_recurring','other_income', _new_id,
          jsonb_build_object('recurring_id', p_id, 'amount', r.amount, 'date', _post_date));

  RETURN _new_id;
END;
$$;
