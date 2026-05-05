-- =====================================================================
-- Vendor per-attachment review + Memo templates
-- =====================================================================

-- Add 'awaiting_vendor_response' to vendor_status
ALTER TYPE public.vendor_status ADD VALUE IF NOT EXISTS 'awaiting_vendor_response';

-- New enum: human review status per attachment
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attachment_human_status') THEN
    CREATE TYPE public.attachment_human_status AS ENUM (
      'pending_review',
      'approved',
      'rejected',
      'clarification_requested'
    );
  END IF;
END $$;

ALTER TABLE public.vendor_attachments
  ADD COLUMN IF NOT EXISTS human_status         public.attachment_human_status NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS human_status_reason  TEXT,
  ADD COLUMN IF NOT EXISTS human_reviewed_by    UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS human_reviewed_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vendor_attachments_human_status
  ON public.vendor_attachments(vendor_id, human_status);

CREATE TABLE IF NOT EXISTS public.vendor_attachment_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id   UUID NOT NULL REFERENCES public.vendor_attachments(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  author_kind     TEXT NOT NULL CHECK (author_kind IN ('procurement', 'vendor')),
  author_user_id  UUID REFERENCES auth.users(id),
  message         TEXT NOT NULL CHECK (length(message) > 0 AND length(message) <= 4000),
  read_by_other_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_attachment_messages_thread
  ON public.vendor_attachment_messages(attachment_id, created_at);

CREATE INDEX IF NOT EXISTS idx_vendor_attachment_messages_vendor
  ON public.vendor_attachment_messages(vendor_id);

ALTER TABLE public.vendor_attachment_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_attachment_messages_staff_all" ON public.vendor_attachment_messages
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'vendor_reviewer')
    OR public.has_role(auth.uid(), 'vendor_master_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'vendor_reviewer')
    OR public.has_role(auth.uid(), 'vendor_master_admin')
  );

CREATE POLICY "vendor_attachment_messages_vendor_own" ON public.vendor_attachment_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_users vu
      WHERE vu.vendor_id = vendor_attachment_messages.vendor_id
        AND vu.user_id = auth.uid()
        AND vu.is_active = true
    )
  )
  WITH CHECK (
    author_kind = 'vendor'
    AND EXISTS (
      SELECT 1 FROM public.vendor_users vu
      WHERE vu.vendor_id = vendor_attachment_messages.vendor_id
        AND vu.user_id = auth.uid()
        AND vu.is_active = true
    )
  );

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS revision_round INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.vendors.revision_round IS
  'Increments each time the vendor resubmits after procurement asked for changes.';

CREATE TABLE IF NOT EXISTS public.memo_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(name) > 0 AND length(name) <= 200),
  description     TEXT,
  subject_text    TEXT,
  body_html       TEXT,
  action_comments TEXT,
  memo_types      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memo_templates_user
  ON public.memo_templates(user_id, updated_at DESC);

ALTER TABLE public.memo_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memo_templates_owner_all" ON public.memo_templates
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS memo_templates_set_updated_at ON public.memo_templates;
CREATE TRIGGER memo_templates_set_updated_at BEFORE UPDATE ON public.memo_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();