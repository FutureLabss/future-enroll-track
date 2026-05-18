-- PostgREST requires explicit FK constraints to resolve joins.
-- Without these, the invoice_change_requests query was silently failing
-- and returning null data on the approvals page.
ALTER TABLE public.invoice_change_requests
  ADD CONSTRAINT invoice_change_requests_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_change_requests
  ADD CONSTRAINT invoice_change_requests_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
