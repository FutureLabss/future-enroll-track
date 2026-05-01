-- Pending bank-transfer payments awaiting admin verification
CREATE TABLE public.pending_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
  enrollment_id UUID NOT NULL,
  installment_id UUID,
  amount NUMERIC NOT NULL,
  payment_reference TEXT,
  evidence_url TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  submitted_by UUID,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pending payments"
ON public.pending_payments FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students insert own pending payments"
ON public.pending_payments FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = enrollment_id AND e.user_id = auth.uid())
);

CREATE POLICY "Students view own pending payments"
ON public.pending_payments FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.enrollments e WHERE e.id = enrollment_id AND e.user_id = auth.uid())
);

CREATE TRIGGER trg_pending_payments_updated
BEFORE UPDATE ON public.pending_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for bank transfer receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read payment receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated upload payment receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-receipts');

CREATE POLICY "Admins manage payment receipts"
ON storage.objects FOR ALL
USING (bucket_id = 'payment-receipts' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'payment-receipts' AND public.has_role(auth.uid(), 'admin'::app_role));