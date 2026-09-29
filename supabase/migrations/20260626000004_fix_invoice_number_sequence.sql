-- Fix duplicate invoice_number errors caused by sequence falling behind existing records.

-- 1. Remove any zombie invoices with an empty invoice_number that slipped through
--    (these block the unique constraint for the next empty-string insert)
DELETE FROM public.invoices WHERE invoice_number = '';

-- 2. Advance the sequence to be strictly above the highest existing INV-XXXXXX number
SELECT setval(
  'public.invoice_number_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(CAST(REGEXP_REPLACE(invoice_number, '\D+', '', 'g') AS BIGINT))
       FROM public.invoices
       WHERE invoice_number ~ '^INV-\d+$'),
      1000
    ),
    1000
  )
);

-- 3. Recreate the trigger function to be more defensive:
--    handle NULL, empty string, and any other non-generated value
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR TRIM(NEW.invoice_number) = '' THEN
    NEW.invoice_number := 'INV-' || LPAD(nextval('public.invoice_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
