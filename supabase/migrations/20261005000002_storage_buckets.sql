-- Storage used by enrollment, coursework, and payment workflows.
-- All buckets are public because the application persists getPublicUrl() URLs.
-- Upload permissions remain restricted by the policies below.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'student-photos',
    'student-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'assignment-submissions',
    'assignment-submissions',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'lesson-materials',
    'lesson-materials',
    true,
    52428800,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mpeg',
      'audio/mp4',
      'video/mp4',
      'video/webm'
    ]
  ),
  (
    'payment-evidence',
    'payment-evidence',
    true,
    5242880,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'payment-receipts',
    'payment-receipts',
    true,
    5242880,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public enrollment happens before authentication. Bucket-level MIME and size
-- limits constrain these otherwise anonymous, create-only uploads.
CREATE POLICY "Public enrollment uploads student photos"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'student-photos');

CREATE POLICY "Public enrollment uploads payment evidence"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'payment-evidence');

-- Assignment paths begin with the authenticated user's UUID.
CREATE POLICY "Users upload their assignment submissions"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'assignment-submissions'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users update their assignment submissions"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'assignment-submissions'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'assignment-submissions'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Curriculum materials are maintained by staff and administrators.
CREATE POLICY "Staff upload lesson materials"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lesson-materials'
  AND (
    public.is_owner(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  )
);

CREATE POLICY "Staff update lesson materials"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'lesson-materials'
  AND (
    public.is_owner(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'lesson-materials'
  AND (
    public.is_owner(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  )
);

-- Authenticated payment receipts are stored below the submitting user's UUID.
CREATE POLICY "Users upload their payment receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Owners and administrators can maintain all application storage objects.
CREATE POLICY "Administrators manage application storage"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id IN (
    'student-photos',
    'assignment-submissions',
    'lesson-materials',
    'payment-evidence',
    'payment-receipts'
  )
  AND (
    public.is_owner(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id IN (
    'student-photos',
    'assignment-submissions',
    'lesson-materials',
    'payment-evidence',
    'payment-receipts'
  )
  AND (
    public.is_owner(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
