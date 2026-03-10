
-- Allow all authenticated users to view any signature (for memo display)
CREATE POLICY "Authenticated view all signatures"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures');
