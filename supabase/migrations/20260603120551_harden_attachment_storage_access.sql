-- Harden attachment storage access.
--
-- Problem: the original storage SELECT policy on the 'attachments' bucket only
-- checked `bucket_id = 'attachments'`, meaning ANY authenticated user could
-- read ANY attachment object if they knew its path. The memo_attachments TABLE
-- is correctly scoped (creator, recipient, approvers, admins) but the storage
-- OBJECT policy was not, leaving the underlying bucket effectively open to all
-- authenticated users.
--
-- Fix: replace the loose SELECT policy with one that mirrors the table policy.
-- Attachment objects are stored with the path `<memo_id>/<uuid>-<filename>`,
-- so the first path segment is the memo id. We join that to public.memos and
-- enforce the same access rules: memo sender, recipient, an approver on the
-- memo, or an admin.
--
-- The bucket is already private (public = false); this only tightens who can
-- read objects via signed-URL / authenticated access. Uploads are unchanged.

-- Drop the over-permissive SELECT policy.
DROP POLICY IF EXISTS "Authenticated view attachments" ON storage.objects;

-- Recreate SELECT scoped to users authorized for the parent memo.
CREATE POLICY "View attachments for accessible memos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1
      FROM public.memos m
      WHERE m.id = ((storage.foldername(name))[1])::uuid
        AND (
          m.from_user_id = auth.uid()
          OR m.to_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR EXISTS (
            SELECT 1
            FROM public.approval_steps a
            WHERE a.memo_id = m.id
              AND a.approver_user_id = auth.uid()
          )
        )
    )
  );

-- Allow admins to manage (update/delete) attachment objects, matching the
-- "Admins manage attachments" table policy. Without this, admins could read
-- but not clean up storage objects.
DROP POLICY IF EXISTS "Admins manage attachment objects" ON storage.objects;
CREATE POLICY "Admins manage attachment objects"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND public.has_role(auth.uid(), 'admin')
  );
