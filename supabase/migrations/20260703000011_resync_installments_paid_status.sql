-- Same reconciliation as 20260703000002, re-run to catch any enrollments
-- approved via EnrollmentDetailPage between that backfill and the fix in
-- this change (which now reconciles invoices/installments at approval time,
-- so this gap won't reopen). Idempotent — safe to run again.

UPDATE public.installments inst
SET    status  = 'paid',
       paid_at = COALESCE(inst.paid_at, e.last_payment_date, now())
FROM   public.invoices inv
JOIN   public.enrollments e ON e.id = inv.enrollment_id
WHERE  inst.invoice_id = inv.id
  AND  inst.status    <> 'paid'
  AND  e.amount_paid  >= e.total_amount
  AND  e.total_amount  > 0;

UPDATE public.invoices inv
SET    status = 'paid'
FROM   public.enrollments e
WHERE  inv.enrollment_id = e.id
  AND  inv.status       <> 'paid'
  AND  e.amount_paid    >= e.total_amount
  AND  e.total_amount    > 0
  AND  NOT EXISTS (
    SELECT 1 FROM public.installments
    WHERE invoice_id = inv.id AND status <> 'paid'
  );
