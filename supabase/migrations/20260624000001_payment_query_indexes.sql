-- Indexes for the payment query hot paths.
-- PaymentsPage orders payments and invoices by created_at DESC;
-- PendingPaymentsPage orders pending_payments by created_at DESC and filters by status;
-- various pages join installments on invoice_id and filter by status.

CREATE INDEX IF NOT EXISTS idx_payments_created_at
  ON public.payments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
  ON public.payments (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoices_created_at
  ON public.invoices (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON public.invoices (status);

CREATE INDEX IF NOT EXISTS idx_installments_invoice_id_status
  ON public.installments (invoice_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_payments_created_at
  ON public.pending_payments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_payments_status
  ON public.pending_payments (status);
