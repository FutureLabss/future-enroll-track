-- Add payment_type and evidence columns to enrollments
ALTER TABLE public.enrollments 
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS payment_evidence_url text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';

-- Create storage bucket for payment evidence
INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment-evidence', 'payment-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for payment evidence bucket: anyone can upload, admins can view all
CREATE POLICY "Anyone can upload payment evidence"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-evidence');

CREATE POLICY "Anyone can view payment evidence"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-evidence');

-- Allow public read on programs and cohorts for enrollment page
CREATE POLICY "Public can view active programs"
ON public.programs FOR SELECT
TO anon
USING (active = true);

CREATE POLICY "Public can view cohorts"
ON public.cohorts FOR SELECT
TO anon
USING (true);

-- Allow anonymous inserts to enrollments for self-enrollment
CREATE POLICY "Public can self-enroll"
ON public.enrollments FOR INSERT
TO anon
WITH CHECK (true);