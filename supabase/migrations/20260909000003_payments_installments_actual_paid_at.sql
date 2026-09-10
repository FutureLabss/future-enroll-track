-- The "actual" columns: when the money genuinely reached the bank, kept apart
-- from due_date (a schedule), created_at (data-entry time) and payment_date (a
-- human's recollection). NULL until there is evidence - never a guess.
-- Companion to 20260909000002 (bank_transactions).

-- ---------------------------------------------------------------------------
-- 2. The "actual" columns
-- ---------------------------------------------------------------------------
-- paid_at_actual is NULL until there is real evidence. NULL means "we do not know
-- when this money arrived" - which is the honest state for most historical rows -
-- and the revenue functions fall back to the existing basis when it is NULL.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_at_actual      timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at_source      text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.installments
  ADD COLUMN IF NOT EXISTS paid_at_actual      timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at_source      text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.payments ADD CONSTRAINT payments_paid_at_source_check
    CHECK (paid_at_source IN ('bank_statement','paystack','staff_entered','inferred','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.installments ADD CONSTRAINT installments_paid_at_source_check
    CHECK (paid_at_source IN ('bank_statement','paystack','staff_entered','inferred','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.payments.paid_at_actual IS
  'When the money actually reached the bank. NULL = unknown, never a guess. Set only from a matched bank_transactions row or a payment-gateway timestamp.';
COMMENT ON COLUMN public.payments.paid_at_source IS
  'Provenance of paid_at_actual. bank_statement/paystack are evidence; staff_entered is a human''s recollection; inferred is a backfill; unknown means no date evidence exists.';

CREATE INDEX IF NOT EXISTS idx_payments_paid_at_actual
  ON public.payments (paid_at_actual) WHERE paid_at_actual IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_installments_paid_at_actual
  ON public.installments (paid_at_actual) WHERE paid_at_actual IS NOT NULL;
