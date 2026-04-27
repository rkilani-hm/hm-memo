-- =====================================================================
-- Finance role + payment-handoff lifecycle (Option B from FRAUD docs)
--
-- Adds:
--  1. 'finance' value to app_role enum so users can be designated finance team.
--  2. Columns on `memos` to track the post-approval handoff:
--       originals_received_at / by    — when finance physically received the bundle
--       originals_received_notes      — optional note (e.g. "missing PO copy")
--       paid_at / by                  — when finance released the cheque/transfer
--       payment_method                — cheque / bank_transfer / wire / cash
--       payment_reference             — cheque number / transfer ID
--       payment_notes                 — free text
--  3. RLS policies giving finance role SELECT on all memos and attachments,
--     plus UPDATE rights on the new payment columns.
--  4. Audit-log helper events fire from the frontend (no DB triggers); this
--     migration is purely additive so no existing approve/reject path changes.
--
-- Important: the existing `memos.status` enum is NOT modified. A fully
-- approved memo stays at status='approved'. The new columns are orthogonal —
-- a memo is "awaiting originals" when status=approved AND originals_received_at IS NULL,
-- "awaiting payment" when originals received AND paid_at IS NULL,
-- "paid" when paid_at IS NOT NULL.
-- =====================================================================

-- 1) Extend app_role enum --------------------------------------------------
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';


-- 2) Payment lifecycle columns --------------------------------------------
ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS originals_received_at    timestamptz,
  ADD COLUMN IF NOT EXISTS originals_received_by    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS originals_received_notes text,
  ADD COLUMN IF NOT EXISTS paid_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by                  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS payment_method           text
    CHECK (payment_method IS NULL OR payment_method IN ('cheque', 'bank_transfer', 'wire', 'cash', 'other')),
  ADD COLUMN IF NOT EXISTS payment_reference        text,
  ADD COLUMN IF NOT EXISTS payment_notes            text;

CREATE INDEX IF NOT EXISTS idx_memos_payment_lifecycle
  ON public.memos (status, originals_received_at, paid_at)
  WHERE status = 'approved';


-- 3) Helper: is_finance(uid) function (mirrors has_role pattern) ----------
-- (We use the existing has_role function. No new function needed.)


-- 4) RLS: finance can read all memos + attachments, update payment columns
DROP POLICY IF EXISTS "Finance views all memos" ON public.memos;
CREATE POLICY "Finance views all memos"
  ON public.memos
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'finance'));

DROP POLICY IF EXISTS "Finance views all attachments" ON public.memo_attachments;
CREATE POLICY "Finance views all attachments"
  ON public.memo_attachments
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'finance'));

DROP POLICY IF EXISTS "Finance views all approval steps" ON public.approval_steps;
CREATE POLICY "Finance views all approval steps"
  ON public.approval_steps
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'finance'));

-- Allow finance role to UPDATE any memo, but in practice the frontend only
-- writes to the payment-lifecycle columns. We rely on the application layer
-- to keep this scoped, and on the audit_log to record every change.
DROP POLICY IF EXISTS "Finance updates payment lifecycle" ON public.memos;
CREATE POLICY "Finance updates payment lifecycle"
  ON public.memos
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'finance') AND status = 'approved')
  WITH CHECK (public.has_role(auth.uid(), 'finance') AND status = 'approved');


-- 5) View for the finance dashboard's "Awaiting Originals" queue ----------
CREATE OR REPLACE VIEW public.v_payment_handoff_queue AS
SELECT
  m.id,
  m.transmittal_no,
  m.subject,
  m.date,
  m.from_user_id,
  m.department_id,
  m.memo_types,
  m.status,
  m.originals_received_at,
  m.originals_received_by,
  m.paid_at,
  m.paid_by,
  m.payment_method,
  m.payment_reference,
  m.updated_at,
  CASE
    WHEN m.paid_at IS NOT NULL                                     THEN 'paid'
    WHEN m.originals_received_at IS NOT NULL                       THEN 'awaiting_payment'
    ELSE                                                                'awaiting_originals'
  END AS handoff_stage
FROM public.memos m
WHERE m.status = 'approved'
  AND 'payments' = ANY(COALESCE(m.memo_types, ARRAY[]::text[]));


-- 6) Make the seed `fraud_settings` row safe under RLS (re-run safe)
INSERT INTO public.fraud_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
