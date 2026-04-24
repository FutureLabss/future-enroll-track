
-- Create public storage bucket for student profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for student-photos
CREATE POLICY "Public can view student photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'student-photos');

CREATE POLICY "Anyone can upload student photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'student-photos');

CREATE POLICY "Anyone can update student photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'student-photos');
