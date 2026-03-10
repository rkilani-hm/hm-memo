
-- ============================================================
-- Fix ALL RESTRICTIVE RLS policies → PERMISSIVE across all tables
-- ============================================================

-- ==================== approval_steps ====================
DROP POLICY IF EXISTS "View own approval steps" ON public.approval_steps;
CREATE POLICY "View own approval steps" ON public.approval_steps
  FOR SELECT TO authenticated USING (auth.uid() = approver_user_id);

DROP POLICY IF EXISTS "View steps for own memos" ON public.approval_steps;
CREATE POLICY "View steps for own memos" ON public.approval_steps
  FOR SELECT TO authenticated USING (is_memo_owner(auth.uid(), memo_id));

DROP POLICY IF EXISTS "Approvers update own steps" ON public.approval_steps;
CREATE POLICY "Approvers update own steps" ON public.approval_steps
  FOR UPDATE TO authenticated USING (auth.uid() = approver_user_id AND status = 'pending');

DROP POLICY IF EXISTS "Users insert approval steps for own memos" ON public.approval_steps;
CREATE POLICY "Users insert approval steps for own memos" ON public.approval_steps
  FOR INSERT TO authenticated WITH CHECK (is_memo_owner(auth.uid(), memo_id) OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage approval steps" ON public.approval_steps;
CREATE POLICY "Admins manage approval steps" ON public.approval_steps
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ==================== audit_log ====================
DROP POLICY IF EXISTS "Users view own audit" ON public.audit_log;
CREATE POLICY "Users view own audit" ON public.audit_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all audit" ON public.audit_log;
CREATE POLICY "Admins view all audit" ON public.audit_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users insert own audit entries" ON public.audit_log;
CREATE POLICY "Users insert own audit entries" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ==================== departments ====================
DROP POLICY IF EXISTS "Departments viewable by authenticated" ON public.departments;
CREATE POLICY "Departments viewable by authenticated" ON public.departments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ==================== memo_attachments ====================
DROP POLICY IF EXISTS "Users upload attachments" ON public.memo_attachments;
CREATE POLICY "Users upload attachments" ON public.memo_attachments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

DROP POLICY IF EXISTS "View attachments for accessible memos" ON public.memo_attachments;
CREATE POLICY "View attachments for accessible memos" ON public.memo_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM memos WHERE memos.id = memo_attachments.memo_id AND (memos.from_user_id = auth.uid() OR memos.to_user_id = auth.uid()))
    OR is_approver_for_memo(auth.uid(), memo_id)
    OR has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins manage attachments" ON public.memo_attachments;
CREATE POLICY "Admins manage attachments" ON public.memo_attachments
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ==================== memo_sequences ====================
DROP POLICY IF EXISTS "Authenticated read sequences" ON public.memo_sequences;
CREATE POLICY "Authenticated read sequences" ON public.memo_sequences
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage sequences" ON public.memo_sequences;
CREATE POLICY "Admins manage sequences" ON public.memo_sequences
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ==================== memos ====================
DROP POLICY IF EXISTS "Users create memos" ON public.memos;
CREATE POLICY "Users create memos" ON public.memos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "Users view own memos" ON public.memos;
CREATE POLICY "Users view own memos" ON public.memos
  FOR SELECT TO authenticated USING (auth.uid() = from_user_id);

DROP POLICY IF EXISTS "Users view memos to them" ON public.memos;
CREATE POLICY "Users view memos to them" ON public.memos
  FOR SELECT TO authenticated USING (auth.uid() = to_user_id);

DROP POLICY IF EXISTS "Approvers view assigned memos" ON public.memos;
CREATE POLICY "Approvers view assigned memos" ON public.memos
  FOR SELECT TO authenticated USING (is_approver_for_memo(auth.uid(), id));

DROP POLICY IF EXISTS "Admins view all memos" ON public.memos;
CREATE POLICY "Admins view all memos" ON public.memos
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage memos" ON public.memos;
CREATE POLICY "Admins manage memos" ON public.memos
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Dept heads view dept memos" ON public.memos;
CREATE POLICY "Dept heads view dept memos" ON public.memos
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'department_head') AND department_id IN (SELECT profiles.department_id FROM profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users update own draft memos" ON public.memos;
CREATE POLICY "Users update own draft memos" ON public.memos
  FOR UPDATE TO authenticated USING (auth.uid() = from_user_id AND status = 'draft');

-- NEW: Approvers can update memo status (for advancing workflow)
DROP POLICY IF EXISTS "Approvers update assigned memos" ON public.memos;
CREATE POLICY "Approvers update assigned memos" ON public.memos
  FOR UPDATE TO authenticated USING (is_approver_for_memo(auth.uid(), id));

-- ==================== notifications ====================
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- NEW: Approvers can insert notifications for next approver
DROP POLICY IF EXISTS "Approvers insert notifications" ON public.notifications;
CREATE POLICY "Approvers insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- ==================== profiles ====================
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ==================== user_roles ====================
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- ==================== workflow_templates ====================
DROP POLICY IF EXISTS "Templates viewable by authenticated" ON public.workflow_templates;
CREATE POLICY "Templates viewable by authenticated" ON public.workflow_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage templates" ON public.workflow_templates;
CREATE POLICY "Admins manage templates" ON public.workflow_templates
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
