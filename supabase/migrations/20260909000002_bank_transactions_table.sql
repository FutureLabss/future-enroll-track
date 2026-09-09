-- Records the date money ACTUALLY entered the bank, separately from every other
-- date the system already tracks. Four different dates were being conflated:
--
--   installments.due_date  - when the money was supposed to arrive (a schedule)
--   payments.created_at    - when the row was inserted (data-entry time)
--   payments.payment_date  - what staff typed, when they remembered to type it
--   <missing>              - when the bank says the money landed  <- this migration
--
-- Only the bank knows the fourth one, so it cannot be derived from anything already
-- in this database. It has to be imported. `bank_transactions` is that import; the
-- `paid_at_actual` columns are where a matched bank row writes its timestamp back.
--
-- Deliberately NOT auto-matched: in the Jan-Sep 2026 Moniepoint statement, 275 of
-- 291 external deposits share their exact amount with another deposit (74 separate
-- deposits of exactly N2,000, 41 of N50,000). Amount alone cannot identify a payer,
-- so matching produces *suggestions* for a human to confirm - see
-- suggest_bank_matches() at the bottom - and nothing writes paid_at_actual without
-- someone accepting it.

-- ---------------------------------------------------------------------------
-- 1. The imported bank ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id              uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  account_number      text NOT NULL,
  occurred_at         timestamptz NOT NULL,          -- the bank's value date/time. Source of truth.
  amount              numeric NOT NULL,              -- signed: positive = credit (money in), negative = debit
  balance_after       numeric,                       -- kept for statement re-verification
  transaction_ref     text NOT NULL,                 -- Moniepoint's reference; the natural key
  narration           text,
  payer               text,                          -- best-effort counterparty name parsed from narration
  kind                text NOT NULL DEFAULT 'external'
                      CHECK (kind IN ('external','internal_transfer','refund','fee')),
  statement_source    text,                          -- filename/period the row was imported from
  imported_at         timestamptz NOT NULL DEFAULT now(),

  -- Re-importing an overlapping statement must be a no-op, not a duplicate. Same
  -- idempotency rule as the reminder flags (see CLAUDE.md): scheduled/repeated
  -- imports are normal, so the natural key carries the uniqueness.
  CONSTRAINT bank_transactions_natural_key UNIQUE (account_number, transaction_ref)
);

COMMENT ON TABLE public.bank_transactions IS
  'Immutable bank statement rows. occurred_at is the only trustworthy answer to "when did this money arrive". Imported via scripts/import-bank-statement.mjs; re-import is idempotent on (account_number, transaction_ref).';
COMMENT ON COLUMN public.bank_transactions.amount IS
  'Signed. Positive = credit. Internal transfers between the company''s own accounts are kind=internal_transfer and must be excluded from revenue.';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_hub_occurred
  ON public.bank_transactions (hub_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_amount
  ON public.bank_transactions (amount) WHERE kind = 'external';

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- Flat hub check on a column this table owns. Deliberately no joins to other
-- RLS-protected tables: nested-EXISTS policies are what blew up query planning
-- in July (see docs / commit ff5e1f5).
DROP POLICY IF EXISTS bank_transactions_admin_read ON public.bank_transactions;
CREATE POLICY bank_transactions_admin_read ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    (hub_id = public.get_my_hub_id() AND public.has_role(auth.uid(), 'admin'::app_role))
    OR public.is_superadmin()
  );

DROP POLICY IF EXISTS bank_transactions_superadmin_write ON public.bank_transactions;
CREATE POLICY bank_transactions_superadmin_write ON public.bank_transactions
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- House rule (CLAUDE.md): every new table carries hub_id and fills it from context.
DROP TRIGGER IF EXISTS trg_bank_transactions_set_hub_id ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_set_hub_id
  BEFORE INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();
