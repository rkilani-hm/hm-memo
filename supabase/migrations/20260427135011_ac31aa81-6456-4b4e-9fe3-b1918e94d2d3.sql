-- Add finance payment handoff tracking columns to memos
ALTER TABLE public.memos
  ADD COLUMN IF NOT EXISTS originals_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS originals_received_by uuid,
  ADD COLUMN IF NOT EXISTS originals_received_notes text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_notes text;

-- Create the Finance Payments handoff queue view.
-- Includes ALL payment memos that are approved OR still in the approval workflow,
-- so finance can see them as soon as they enter the system (not only after final approval).
CREATE OR REPLACE VIEW public.v_payment_handoff_queue
WITH (security_invoker = true)
AS
SELECT
  m.id,
  m.transmittal_no,
  m.subject,
  m.date,
  m.from_user_id,
  m.department_id,
  m.memo_types,
  m.status::text                  AS status,
  m.originals_received_at,
  m.originals_received_by,
  m.paid_at,
  m.paid_by,
  m.payment_method,
  m.payment_reference,
  m.updated_at,
  CASE
    WHEN m.paid_at IS NOT NULL                                     THEN 'paid'
    WHEN m.originals_received_at IS NOT NULL                        THEN 'awaiting_payment'
    ELSE 'awaiting_originals'
  END AS handoff_stage
FROM public.memos m
WHERE 'payments' = ANY (m.memo_types)
  AND m.status IN ('approved','submitted','in_review');

GRANT SELECT ON public.v_payment_handoff_queue TO authenticated;