-- Create private vendor-attachments storage bucket with size + mime restrictions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-attachments',
  'vendor-attachments',
  false,
  26214400, -- 25MB
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies on storage.objects for the vendor-attachments bucket.
-- Authenticated users can upload (vendor portal users + admins). Reads are
-- restricted to authenticated users; row-level access to vendor records is
-- enforced at the public.vendor_attachments table level.
CREATE POLICY "Authenticated can read vendor attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'vendor-attachments');

CREATE POLICY "Authenticated can upload vendor attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vendor-attachments');

CREATE POLICY "Authenticated can update own vendor attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vendor-attachments' AND owner = auth.uid());

CREATE POLICY "Admins can delete vendor attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vendor-attachments' AND public.has_role(auth.uid(), 'admin'));