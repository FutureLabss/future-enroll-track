-- HIGH: Fix two function-level multi-tenancy gaps identified in the audit.
--
-- 1. approve_staff_invoice: used is_superadmin(auth.uid()) (wrong — function
--    takes no argument in its no-arg form). Also inserted the resulting expense
--    with get_my_hub_id() which returns NULL for a superadmin without context,
--    breaking finance_summary aggregation. Fix: derive hub from the linked
--    staff record instead.
--
-- 2. switch_hub_context: silently mutated hub_members with no audit trail.
--    Fix: insert an audit_log entry on every successful context switch.

-- ── 1. approve_staff_invoice ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_staff_invoice(
  p_id           uuid,
  p_payment_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

GRANT EXECUTE ON FUNCTION public.approve_staff_invoice(uuid, date) TO authenticated;

-- ── 2. switch_hub_context — add audit trail ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.switch_hub_context(p_hub_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmins can switch hub context';
  END IF;

  UPDATE public.hub_members
  SET hub_id = p_hub_id, hub_role = 'owner'
  WHERE user_id = auth.uid();

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'switch_hub_context', 'hub', p_hub_id,
          jsonb_build_object('to_hub_id', p_hub_id, 'switched_at', now()));
END;
$$;
