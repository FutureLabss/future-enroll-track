-- ── Shared trigger function: auto-set hub_id from get_my_hub_id() on INSERT ───
CREATE OR REPLACE FUNCTION public.set_hub_id_from_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.hub_id IS NULL THEN
    NEW.hub_id := public.get_my_hub_id();
  END IF;
  RETURN NEW;
END;
$$;

-- ── 1. expenses ───────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_expenses_set_hub_id ON public.expenses;
CREATE TRIGGER trg_expenses_set_hub_id
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

-- ── 2. other_income ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_other_income_set_hub_id ON public.other_income;
CREATE TRIGGER trg_other_income_set_hub_id
  BEFORE INSERT ON public.other_income
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

-- ── 3. organizations ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_organizations_set_hub_id ON public.organizations;
CREATE TRIGGER trg_organizations_set_hub_id
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

-- ── 4. recurring_expenses: add hub_id, backfill, scope RLS, add trigger ───────
ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);

UPDATE public.recurring_expenses
  SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE hub_id IS NULL;

DROP POLICY IF EXISTS "Admins manage recurring expenses" ON public.recurring_expenses;

CREATE POLICY "Admins manage recurring expenses"
  ON public.recurring_expenses FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );

DROP TRIGGER IF EXISTS trg_recurring_expenses_set_hub_id ON public.recurring_expenses;
CREATE TRIGGER trg_recurring_expenses_set_hub_id
  BEFORE INSERT ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

-- ── 5. recurring_income: add hub_id, backfill, scope RLS, add trigger ─────────
ALTER TABLE public.recurring_income
  ADD COLUMN IF NOT EXISTS hub_id uuid REFERENCES public.hubs(id);

UPDATE public.recurring_income
  SET hub_id = '00000000-0000-0000-0000-000000000001'::uuid
  WHERE hub_id IS NULL;

DROP POLICY IF EXISTS "Admins manage recurring income" ON public.recurring_income;

CREATE POLICY "Admins manage recurring income"
  ON public.recurring_income FOR ALL
  USING (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.has_role(auth.uid(), 'admin'::app_role) AND hub_id = public.get_my_hub_id())
  );

DROP TRIGGER IF EXISTS trg_recurring_income_set_hub_id ON public.recurring_income;
CREATE TRIGGER trg_recurring_income_set_hub_id
  BEFORE INSERT ON public.recurring_income
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();
