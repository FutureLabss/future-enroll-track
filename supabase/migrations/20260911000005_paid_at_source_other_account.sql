-- "No deposit found" was conflating two very different situations:
--   (a) we genuinely cannot explain the payment, and
--   (b) we know exactly where it went - the company's SECOND Moniepoint account,
--       8288325467, for which no statement has been imported.
--
-- (b) is a known answer, not a mystery, and leaving it as 'unknown' meant those
-- rows would be re-investigated every time somebody worked the list. Bla, Godiya
-- Danjuma's N50,000 is the first confirmed case.
--
-- This is still NOT evidence: paid_at_actual stays NULL, because the date the money
-- landed lives in a ledger we do not hold. It records that the question is answered
-- and where the answer would be found, so the row stops looking unexplained. Import
-- that account's statement and these become matchable for real.
ALTER TABLE public.installments DROP CONSTRAINT IF EXISTS installments_paid_at_source_check;
ALTER TABLE public.installments ADD CONSTRAINT installments_paid_at_source_check
  CHECK (paid_at_source = ANY (ARRAY[
    'bank_statement'::text, 'paystack'::text, 'staff_entered'::text,
    'inferred'::text, 'other_account'::text, 'unknown'::text]));

COMMENT ON COLUMN public.installments.paid_at_source IS
  'Provenance of paid_at_actual. bank_statement/paystack are evidence; inferred is reasoned from amount+date+uniqueness; staff_entered is an assertion; other_account means it was paid into Moniepoint 8288325467, whose statement is not imported (so paid_at_actual stays NULL, but the row is explained); unknown means genuinely unexplained.';
