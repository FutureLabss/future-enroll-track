-- Six students were enrolled twice and their payments counted twice (N380,000 over
-- Jan-Sep 2026). EnrollPage.tsx already guarded against this -- but only on
-- (email, program_id), and every real duplicate used a DIFFERENT email:
-- "Chukwuemerie Nwachukwu" <chukwuemerietriumpant@> vs "Nwachukwu Chukwemerie
-- Triumphant" <nwachukwuchukwemerietriumphant@>, same phone, same N150,000, both
-- marked fully paid. The guard watched the one field that reliably differs and
-- ignored the one that reliably matches.
--
-- Phone is the stable identifier here, but it is NOT unique: siblings legitimately
-- share a parent's number (the Udomah children are on three different programmes,
-- the Umia twins both on KID BOOTCAMP, all bank-confirmed). So this deliberately
-- does NOT add a UNIQUE constraint -- that would reject real enrollments. It
-- normalizes the number so it can be compared at all, and exposes a review view.

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (
    nullif(right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10), '')
  ) STORED;

COMMENT ON COLUMN public.enrollments.phone_normalized IS
  'Last 10 digits of phone, for duplicate detection. Nigerian numbers arrive as +234..., 0..., or with stray whitespace/tabs; the last 10 digits are the stable part. Not unique - siblings share a parent''s number.';

CREATE INDEX IF NOT EXISTS idx_enrollments_phone_normalized
  ON public.enrollments (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

-- Review surface. Deliberately named "review", not "duplicates": a shared phone is
-- evidence to check, never proof. The columns are the ones that actually settled
-- each case by hand -- whether the name tokens are a permutation of each other
-- (same person) or genuinely different given names (siblings), and how much of the
-- money on each record is backed by a real bank deposit.
-- enrollments carries no hub_id of its own (it is scoped through program_id), so
-- security_invoker is what keeps this view inside the caller's RLS - without it a
-- view runs as its owner and would hand every hub's enrollments to any caller.
CREATE OR REPLACE VIEW public.enrollments_needing_duplicate_review
WITH (security_invoker = true) AS
WITH live AS (
  SELECT e.id, e.full_name, e.email, e.phone_normalized,
         e.program_id, e.created_at, e.amount_paid,
         (SELECT p.program_name FROM public.programs p WHERE p.id = e.program_id) AS program_name,
         (SELECT count(*) FROM public.invoices i
            JOIN public.installments ins ON ins.invoice_id = i.id
           WHERE i.enrollment_id = e.id AND i.status <> 'cancelled'
             AND ins.status = 'paid') AS paid_installments,
         (SELECT count(*) FROM public.invoices i
            JOIN public.installments ins ON ins.invoice_id = i.id
           WHERE i.enrollment_id = e.id AND i.status <> 'cancelled'
             AND ins.status = 'paid' AND ins.bank_transaction_id IS NOT NULL) AS bank_confirmed,
         (SELECT array_agg(DISTINCT w ORDER BY w)
            FROM unnest(string_to_array(upper(regexp_replace(e.full_name, '[^A-Za-z ]', ' ', 'g')), ' ')) AS w
           WHERE length(w) >= 3) AS name_tokens
  FROM public.enrollments e
  WHERE e.enrollment_status <> 'cancelled'
    AND e.phone_normalized IS NOT NULL
),
grp AS (
  SELECT phone_normalized FROM live GROUP BY phone_normalized HAVING count(*) > 1
)
SELECT l.phone_normalized,
       l.id AS enrollment_id,
       l.full_name,
       l.email,
       l.program_name,
       l.created_at,
       l.amount_paid,
       l.paid_installments,
       l.bank_confirmed,
       -- How many name words this record shares with the others on the same number.
       -- A full permutation ("George Sunday Ukpong" / "Ukpong George Sunday") is the
       -- signature of one person entered twice; siblings share only the family names.
       (SELECT count(*) FROM live o
         WHERE o.phone_normalized = l.phone_normalized AND o.id <> l.id
           AND o.name_tokens @> l.name_tokens) AS others_containing_this_name,
       (SELECT count(*) FROM live o
         WHERE o.phone_normalized = l.phone_normalized AND o.id <> l.id) AS others_on_this_number
FROM live l
JOIN grp g ON g.phone_normalized = l.phone_normalized
ORDER BY l.phone_normalized, l.created_at;

COMMENT ON VIEW public.enrollments_needing_duplicate_review IS
  'Enrollments sharing a phone number. A shared number is NOT proof of a duplicate - siblings share a parent''s phone. The discriminator that settled all six real cases is bank_confirmed: a phantom copy carries paid installments that NO deposit backs (0), while each real sibling has their own (>0). others_containing_this_name catches the name-permutation cases on top of that.';

GRANT SELECT ON public.enrollments_needing_duplicate_review TO authenticated;
