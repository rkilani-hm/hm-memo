
-- 1. Create delegate_assignments table
CREATE TABLE public.delegate_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  principal_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (delegate_user_id, principal_user_id)
);

ALTER TABLE public.delegate_assignments ENABLE ROW LEVEL SECURITY;

-- Admins manage all
CREATE POLICY "Admins manage delegate assignments" ON public.delegate_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Principals can view their own delegates
CREATE POLICY "Principals view own delegates" ON public.delegate_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = principal_user_id);

-- Delegates can view their own assignments
CREATE POLICY "Delegates view own assignments" ON public.delegate_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = delegate_user_id);

-- 2. Add manual registration columns to approval_steps
ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS signing_method text,
  ADD COLUMN IF NOT EXISTS registered_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS date_of_physical_signing timestamptz,
  ADD COLUMN IF NOT EXISTS scan_attachment_url text,
  ADD COLUMN IF NOT EXISTS registration_notes text;

-- 3. Expand audit_log with forensic fields
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS on_behalf_of_user_id uuid,
  ADD COLUMN IF NOT EXISTS on_behalf_of_name text,
  ADD COLUMN IF NOT EXISTS action_detail text,
  ADD COLUMN IF NOT EXISTS signing_method text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS ip_geolocation_city text,
  ADD COLUMN IF NOT EXISTS ip_geolocation_country text,
  ADD COLUMN IF NOT EXISTS user_agent_raw text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS os text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS password_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS scan_attachment_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS new_status text,
  ADD COLUMN IF NOT EXISTS transmittal_no text;

-- 4. Add indexes for audit_log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_memo_id ON public.audit_log(memo_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_on_behalf ON public.audit_log(on_behalf_of_user_id);

-- 5. Helper function: check if user is delegate for a principal
CREATE OR REPLACE FUNCTION public.is_delegate_for(_delegate_id uuid, _principal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegate_assignments
    WHERE delegate_user_id = _delegate_id
      AND principal_user_id = _principal_id
      AND is_active = true
  )
$$;

-- 6. Allow delegates to view approval steps for their principals
CREATE POLICY "Delegates view principal approval steps" ON public.approval_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delegate_assignments da
      WHERE da.delegate_user_id = auth.uid()
        AND da.principal_user_id = approval_steps.approver_user_id
        AND da.is_active = true
    )
  );

-- 7. Allow delegates to update (register manual signature) on principal's steps
CREATE POLICY "Delegates register manual signatures" ON public.approval_steps
  FOR UPDATE TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM public.delegate_assignments da
      WHERE da.delegate_user_id = auth.uid()
        AND da.principal_user_id = approval_steps.approver_user_id
        AND da.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delegate_assignments da
      WHERE da.delegate_user_id = auth.uid()
        AND da.principal_user_id = approval_steps.approver_user_id
        AND da.is_active = true
    )
  );

-- 8. Allow delegates to view memos pending for their principals
CREATE POLICY "Delegates view principal memos" ON public.memos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_steps ast
      JOIN public.delegate_assignments da ON da.principal_user_id = ast.approver_user_id
      WHERE ast.memo_id = memos.id
        AND da.delegate_user_id = auth.uid()
        AND da.is_active = true
    )
  );
