-- Three installments carry an amount of N100 - typed to get past the invoice form
-- when the real fee was not known yet. They are never corrected afterwards: the
-- student then reads as fully paid on a N100 course, and their real balance
-- disappears from every report that sums installments.
--
-- NOT VALID deliberately: the existing N100 rows must stay readable and fixable by
-- hand (Ekanem, Agnes Gabriel; Joseph Eno mfon; Oboh Promise - the last of which is
-- also a duplicate enrollment). The constraint applies to every INSERT and to any
-- UPDATE that touches those rows, so nothing new can be created this way, and it
-- can be validated once the three are cleaned up:
--     ALTER TABLE public.installments VALIDATE CONSTRAINT installments_amount_not_placeholder;
--
-- N1,000 is below every real price the school charges - the smallest genuine
-- installment in Jan-Sep 2026 is a N2,000 workspace day pass.
ALTER TABLE public.installments
  DROP CONSTRAINT IF EXISTS installments_amount_not_placeholder;
ALTER TABLE public.installments
  ADD CONSTRAINT installments_amount_not_placeholder
  CHECK (amount >= 1000) NOT VALID;
