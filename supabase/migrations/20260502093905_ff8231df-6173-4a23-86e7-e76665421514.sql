
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Branding assets are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

CREATE POLICY "Admins can upload branding assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update branding assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete branding assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
