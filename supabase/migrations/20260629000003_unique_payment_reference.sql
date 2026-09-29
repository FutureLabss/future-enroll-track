-- Prevent duplicate payment records for the same Paystack reference.
-- The paystack-verify function has a read-then-write idempotency check that is
-- vulnerable to a race condition when two webhooks arrive simultaneously.
-- This constraint is the safety net: the second insert will fail with a unique
-- violation rather than silently creating a duplicate payment row.
CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_reference_key
  ON public.payments (payment_reference)
  WHERE payment_reference IS NOT NULL;
