-- 15 of the 44 unmatched payments are unmatchable for one reason: somebody else
-- paid, and nobody wrote down who. Lawrence Inyang paid for Umoren Aniebiet Okon.
-- Kingsley Christian Akpan's deposit part-funded his sister Victoria after he
-- absconded. Ephraim Friday Akpan pays for several students at a time, labelling
-- the transfers "2kid boatcamp" and "4 month IT student".
--
-- None of that is recoverable from the bank statement: the statement knows the
-- SENDER, the LMS knows the STUDENT, and the link between them only ever existed
-- in a conversation at the front desk. Name matching cannot bridge it -- it fails
-- in both directions, producing false positives (a common surname) and false
-- negatives (the payer shares no name with the student at all).
--
-- So capture it at the moment it is known, which is the only moment it exists.
ALTER TABLE public.installments
  ADD COLUMN IF NOT EXISTS paid_by text;
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_by text;

COMMENT ON COLUMN public.installments.paid_by IS
  'Name on the transfer when it is not the student''s own - parent, sibling, sponsor, employer. Leave NULL when the student paid themselves. This is the one fact reconciliation cannot recover later: the bank knows the sender, the LMS knows the student, and only the person at the desk knows they are connected.';
COMMENT ON COLUMN public.payments.paid_by IS
  'Name on the transfer when it is not the student''s own. See installments.paid_by.';

-- Searchable, because the point is to look a deposit's sender up later.
CREATE INDEX IF NOT EXISTS idx_installments_paid_by
  ON public.installments (lower(paid_by)) WHERE paid_by IS NOT NULL;
