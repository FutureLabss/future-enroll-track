-- Reconciliation: what the bank says vs what the LMS recorded, plus the only
-- path that writes paid_at_actual from a bank row (confirm_bank_match).
-- Suggestions are scored but never auto-applied - see 20260909000002 for why.

-- ---------------------------------------------------------------------------
-- 4. Reconciliation: what the bank says vs what the LMS recorded
-- ---------------------------------------------------------------------------
-- Money that arrived in the bank but has no payment recorded against it. This is
-- the report that would have surfaced the drift months ago.
CREATE OR REPLACE FUNCTION public.unreconciled_bank_credits(p_from date, p_to date)
RETURNS TABLE(id uuid, occurred_at timestamptz, amount numeric, payer text, narration text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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

-- Fraction of the student's name words that appear in the bank text. Deliberately
-- plain SQL rather than pg_trgm: enabling an extension installs it outside `public`
-- on Supabase, which these SET search_path TO 'public' functions would not resolve.
-- Word-overlap is also the right measure here - bank narrations reorder and truncate
-- names ("INYANG EKPEDEME USEN" vs "Ekpedeme Usen Inyang") far more often than they
-- misspell them.
CREATE OR REPLACE FUNCTION public.name_match_score(p_bank_text text, p_person text)
RETURNS real LANGUAGE sql IMMUTABLE AS $$
  WITH words AS (
    SELECT w FROM unnest(string_to_array(upper(regexp_replace(COALESCE(p_person,''), '[^A-Za-z ]', ' ', 'g')), ' ')) AS w
    WHERE length(w) >= 3
  )
  SELECT CASE WHEN (SELECT count(*) FROM words) = 0 THEN 0::real
         ELSE (SELECT count(*) FILTER (WHERE upper(COALESCE(p_bank_text,'')) LIKE '%'||w||'%')::real
                      / count(*)::real FROM words)
         END;
$$;

-- Candidate bank rows for one installment, scored. Suggestions only - the caller
-- decides. Amount must match exactly; name similarity and date proximity rank the
-- candidates, because amount alone is ambiguous across hundreds of deposits.
CREATE OR REPLACE FUNCTION public.suggest_bank_matches(p_installment_id uuid, p_day_window integer DEFAULT 45)
RETURNS TABLE(bank_transaction_id uuid, occurred_at timestamptz, amount numeric, payer text,
              narration text, name_similarity real, days_from_due integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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

GRANT EXECUTE ON FUNCTION public.unreconciled_bank_credits(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_bank_matches(uuid, integer) TO authenticated;

-- Confirming a match is the only thing that writes paid_at_actual from a bank row.
CREATE OR REPLACE FUNCTION public.confirm_bank_match(p_installment_id uuid, p_bank_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

GRANT EXECUTE ON FUNCTION public.confirm_bank_match(uuid, uuid) TO authenticated;
