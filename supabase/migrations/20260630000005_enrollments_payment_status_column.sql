-- Add payment_status as a stored generated column so we can filter/sort server-side
-- without a client-side computed field. Values: 'unpaid' | 'partial' | 'paid'
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS payment_status text GENERATED ALWAYS AS (
    CASE
      WHEN COALESCE(amount_paid, 0) = 0                                    THEN 'unpaid'
      WHEN COALESCE(amount_paid, 0) >= COALESCE(total_amount, 0) AND
           COALESCE(total_amount, 0) > 0                                   THEN 'paid'
      ELSE 'partial'
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_enrollments_payment_status
  ON public.enrollments(payment_status);
