-- Create public storage bucket for lesson materials (PDFs, slides, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lesson-materials', 'lesson-materials', true, 52428800)  -- 50 MB limit
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated staff/admins to upload
CREATE POLICY "Authenticated users upload lesson materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lesson-materials');

-- Public read (bucket is public but explicit policy for objects)
CREATE POLICY "Public read lesson materials"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-materials');

-- Allow uploader to delete their own files
CREATE POLICY "Owners delete lesson materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lesson-materials' AND auth.uid() = owner);
