-- STAFF (superadmin-only)
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  role_title text,
  base_salary numeric NOT NULL DEFAULT 0,
  email text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin manages staff" ON public.staff
  FOR ALL USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PAYROLL RUNS (superadmin-only)
CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  pay_month date NOT NULL, -- use first day of the month
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- pending | paid
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, pay_month)
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmin manages payroll runs" ON public.payroll_runs
  FOR ALL USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
CREATE TRIGGER payroll_runs_updated_at BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_payroll_runs_month ON public.payroll_runs(pay_month);

-- OTHER INCOME (admin-wide)
CREATE TABLE public.other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL, -- workspace, rental, consulting, other
  payer_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text,
  payment_reference text,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.other_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage other income" ON public.other_income
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER other_income_updated_at BEFORE UPDATE ON public.other_income
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_other_income_date ON public.other_income(payment_date);