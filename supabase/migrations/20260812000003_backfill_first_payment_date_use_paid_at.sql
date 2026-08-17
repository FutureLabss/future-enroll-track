-- Companion to 20260812000002: recompute first_payment_date for existing
-- enrollments now that admin_update_invoice uses paid_at again instead of
-- due_date. Same pattern as the original 20260518000022 backfill. The old
-- due-date-derived value isn't preserved anywhere — it was itself wrong
-- (that's the whole point of this change) and is trivially recomputable as
-- MIN(due_date) over paid installments if it's ever needed for comparison.
UPDATE public.enrollments e
SET first_payment_date = fp.first_paid_at
FROM (
  SELECT inv.enrollment_id, MIN(inst.paid_at) AS first_paid_at
  FROM public.installments inst
  JOIN public.invoices inv ON inv.id = inst.invoice_id
  WHERE inst.status = 'paid'
  GROUP BY inv.enrollment_id
) fp
WHERE e.id = fp.enrollment_id
  AND (e.first_payment_date IS DISTINCT FROM fp.first_paid_at);
