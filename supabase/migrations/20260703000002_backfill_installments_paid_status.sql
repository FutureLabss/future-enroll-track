-- Backfill: enrollments approved via the verify flow had amount_paid set
-- directly, bypassing the normal payment path. Their invoices and installments
-- were never marked paid. This migration reconciles them once.

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
