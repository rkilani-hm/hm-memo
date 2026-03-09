
-- ============================================
-- Al Hamra Internal Memo Platform - Full Schema
-- ============================================

-- 1. Custom types
CREATE TYPE public.app_role AS ENUM ('admin', 'department_head', 'staff', 'approver');
CREATE TYPE public.memo_status AS ENUM ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'rework');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected', 'rework', 'skipped');
CREATE TYPE public.memo_type AS ENUM ('action', 'announcement', 'review_comments', 'payments', 'information', 'filing', 'use_return', 'request', 'other');

-- 2. Departments table
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  head_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- 3. Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  job_title TEXT,
  department_id UUID REFERENCES public.departments(id),
  signature_image_url TEXT,
  signature_type TEXT DEFAULT 'none',
  initials TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. User roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 6. Memos table
CREATE TABLE public.memos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transmittal_no TEXT NOT NULL UNIQUE,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id),
  to_user_id UUID REFERENCES auth.users(id),
  department_id UUID NOT NULL REFERENCES public.departments(id),
  subject TEXT NOT NULL,
  description TEXT,
  status memo_status NOT NULL DEFAULT 'draft',
  memo_types memo_type[] NOT NULL DEFAULT '{}',
  continuation_pages INTEGER DEFAULT 0,
  initials TEXT,
  copies_to TEXT[],
  current_step INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;

-- 7. Memo attachments
CREATE TABLE public.memo_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  memo_id UUID NOT NULL REFERENCES public.memos(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.memo_attachments ENABLE ROW LEVEL SECURITY;

-- 8. Approval steps
CREATE TABLE public.approval_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  memo_id UUID NOT NULL REFERENCES public.memos(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_user_id UUID NOT NULL REFERENCES auth.users(id),
  status approval_status NOT NULL DEFAULT 'pending',
  signature_image_url TEXT,
  signed_at TIMESTAMPTZ,
  comments TEXT,
  password_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

-- 9. Workflow templates
CREATE TABLE public.workflow_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  memo_type memo_type,
  steps JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- 10. Audit log
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  memo_id UUID REFERENCES public.memos(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 11. Notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memo_id UUID REFERENCES public.memos(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 12. Sequence tracking for transmittal numbers
CREATE TABLE public.memo_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id),
  year INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  UNIQUE (department_id, year)
);
ALTER TABLE public.memo_sequences ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Timestamp trigger function
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_memos_updated_at BEFORE UPDATE ON public.memos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_approval_steps_updated_at BEFORE UPDATE ON public.approval_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workflow_templates_updated_at BEFORE UPDATE ON public.workflow_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Transmittal number generator
-- ============================================
CREATE OR REPLACE FUNCTION public.get_next_transmittal_no(dept_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dept_code TEXT;
  current_year INTEGER;
  next_seq INTEGER;
BEGIN
  SELECT code INTO dept_code FROM public.departments WHERE id = dept_id;
  current_year := EXTRACT(YEAR FROM now());
  
  INSERT INTO public.memo_sequences (department_id, year, last_sequence)
  VALUES (dept_id, current_year, 1)
  ON CONFLICT (department_id, year)
  DO UPDATE SET last_sequence = public.memo_sequences.last_sequence + 1
  RETURNING last_sequence INTO next_seq;
  
  RETURN 'HM/' || dept_code || '-IM/' || LPAD(next_seq::TEXT, 4, '0') || '/' || current_year;
END;
$$;

-- ============================================
-- RLS Policies
-- ============================================

-- Departments
CREATE POLICY "Departments viewable by authenticated" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage departments" ON public.departments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System inserts profiles" ON public.profiles FOR INSERT WITH CHECK (true);

-- User roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Memos
CREATE POLICY "Users view own memos" ON public.memos FOR SELECT TO authenticated USING (auth.uid() = from_user_id);
CREATE POLICY "Users view memos to them" ON public.memos FOR SELECT TO authenticated USING (auth.uid() = to_user_id);
CREATE POLICY "Admins view all memos" ON public.memos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Approvers view assigned memos" ON public.memos FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.approval_steps WHERE memo_id = memos.id AND approver_user_id = auth.uid()));
CREATE POLICY "Dept heads view dept memos" ON public.memos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'department_head') AND department_id IN (SELECT department_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users create memos" ON public.memos FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Users update own draft memos" ON public.memos FOR UPDATE TO authenticated USING (auth.uid() = from_user_id AND status = 'draft');
CREATE POLICY "Admins manage memos" ON public.memos FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Memo attachments
CREATE POLICY "View attachments for accessible memos" ON public.memo_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.memos WHERE id = memo_id AND (
    from_user_id = auth.uid() OR to_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.approval_steps AS a WHERE a.memo_id = memo_attachments.memo_id AND a.approver_user_id = auth.uid())
  )));
CREATE POLICY "Users upload attachments" ON public.memo_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Admins manage attachments" ON public.memo_attachments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Approval steps
CREATE POLICY "View own approval steps" ON public.approval_steps FOR SELECT TO authenticated USING (auth.uid() = approver_user_id);
CREATE POLICY "View steps for own memos" ON public.approval_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.memos WHERE id = memo_id AND from_user_id = auth.uid()));
CREATE POLICY "Admins manage approval steps" ON public.approval_steps FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Approvers update own steps" ON public.approval_steps FOR UPDATE TO authenticated USING (auth.uid() = approver_user_id AND status = 'pending');
CREATE POLICY "System inserts approval steps" ON public.approval_steps FOR INSERT TO authenticated WITH CHECK (true);

-- Workflow templates
CREATE POLICY "Templates viewable by authenticated" ON public.workflow_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage templates" ON public.workflow_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Audit log
CREATE POLICY "Users view own audit" ON public.audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System inserts audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Notifications
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System inserts notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Memo sequences
CREATE POLICY "Authenticated read sequences" ON public.memo_sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "System manages sequences" ON public.memo_sequences FOR ALL TO authenticated USING (true);

-- ============================================
-- Storage buckets
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', false);

CREATE POLICY "Authenticated upload attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments');
CREATE POLICY "Authenticated view attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'attachments');
CREATE POLICY "Users upload own signatures" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view own signatures" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own signatures" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_memos_from_user ON public.memos(from_user_id);
CREATE INDEX idx_memos_to_user ON public.memos(to_user_id);
CREATE INDEX idx_memos_department ON public.memos(department_id);
CREATE INDEX idx_memos_status ON public.memos(status);
CREATE INDEX idx_memos_created_at ON public.memos(created_at DESC);
CREATE INDEX idx_approval_steps_memo ON public.approval_steps(memo_id);
CREATE INDEX idx_approval_steps_approver ON public.approval_steps(approver_user_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_audit_log_memo ON public.audit_log(memo_id);
CREATE INDEX idx_profiles_department ON public.profiles(department_id);
CREATE INDEX idx_profiles_user ON public.profiles(user_id);
