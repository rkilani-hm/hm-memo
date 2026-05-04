-- =====================================================================
-- Vendor Master Module
-- =====================================================================
--
-- Adds a complete vendor lifecycle on top of the existing memo system.
-- Vendors register through a public form (or are entered by internal
-- staff), procurement reviews their documents, AI assists with document
-- analysis and expiry tracking, and after approval the SAP master data
-- admin enters SAP codes to mark the vendor as active.
--
-- This migration is the foundation. Frontend pages, edge functions,
-- and email templates are layered on top in the same commit.
--
-- Tables created
-- ==============
--   vendor_types                — lookup (local_company, local_individual, international)
--   document_types              — lookup, ~22 types from Al Hamra's existing supplier forms
--   vendor_document_requirements — which docs required for which vendor type
--   vendors                     — main vendor record (45+ fields)
--   vendor_attachments          — uploaded files with AI analysis results
--   vendor_audit_log            — who changed what when
--   vendor_sap_events           — API-readiness layer; manual today, API tomorrow
--   vendor_users                — links vendors to Supabase auth users (vendor portal)
--   vendor_change_requests      — pending updates for active vendors
--   document_reminder_settings  — tunable reminder cadence
--
-- Roles added
-- ===========
--   vendor_reviewer       — reviews submissions, approves/rejects
--   vendor_master_admin   — enters SAP codes, marks active
--   vendor                — non-staff role for vendor portal users
--
-- Status enum
-- ===========
--   draft, submitted, approved_pending_sap_creation, active_in_sap,
--   update_submitted, update_approved_pending_sap_update,
--   sap_update_completed, sap_update_failed_needs_correction,
--   rejected, inactive, blocked_documents_expired
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS + ROLES
-- ---------------------------------------------------------------------

-- New app roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor_reviewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor_master_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor';

-- Vendor lifecycle status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_status') THEN
    CREATE TYPE public.vendor_status AS ENUM (
      'draft',
      'submitted',
      'approved_pending_sap_creation',
      'active_in_sap',
      'update_submitted',
      'update_approved_pending_sap_update',
      'sap_update_completed',
      'sap_update_failed_needs_correction',
      'rejected',
      'inactive',
      'blocked_documents_expired'
    );
  END IF;
END $$;

-- AI document review verdict
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_ai_verdict') THEN
    CREATE TYPE public.doc_ai_verdict AS ENUM (
      'pending',
      'accepted',
      'rejected',
      'soft_pending'  -- AI errored or timed out; procurement reviews
    );
  END IF;
END $$;

-- SAP event type for the API-readiness layer
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_sap_event_kind') THEN
    CREATE TYPE public.vendor_sap_event_kind AS ENUM (
      'creation',  -- new vendor pushed to SAP
      'update'     -- changes pushed to SAP
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_sap_event_status') THEN
    CREATE TYPE public.vendor_sap_event_status AS ENUM (
      'pending',
      'completed',
      'failed'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. LOOKUP TABLES
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vendor_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,         -- machine-readable: local_company, local_individual, international
  label_en    TEXT NOT NULL,
  label_ar    TEXT NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,        -- machine-readable: commercial_registration, civil_id, ...
  label_en        TEXT NOT NULL,
  label_ar        TEXT NOT NULL,
  description_en  TEXT,
  description_ar  TEXT,
  has_expiry      BOOLEAN NOT NULL DEFAULT false,  -- whether the AI should look for an expiry date
  ai_check_hints  TEXT,    -- guidance for the AI on what fields to extract / verify
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_document_requirements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_type_id   UUID NOT NULL REFERENCES public.vendor_types(id) ON DELETE CASCADE,
  document_type_id UUID NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  is_required      BOOLEAN NOT NULL DEFAULT true,
  is_conditional   BOOLEAN NOT NULL DEFAULT false,
  condition_label_en TEXT,    -- e.g. "If you have a tax registration"
  condition_label_ar TEXT,
  display_order    INT NOT NULL DEFAULT 0,
  UNIQUE(vendor_type_id, document_type_id)
);

CREATE TABLE IF NOT EXISTS public.document_reminder_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_days    INT[] NOT NULL DEFAULT ARRAY[60, 30, 14, 7],
  notify_vendor    BOOLEAN NOT NULL DEFAULT true,
  notify_procurement BOOLEAN NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. CORE TABLES
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vendors (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_reference_no         TEXT NOT NULL UNIQUE,   -- AHR-VEND-XXXXX (vendor-facing)
  vendor_type_id              UUID NOT NULL REFERENCES public.vendor_types(id),
  status                      public.vendor_status NOT NULL DEFAULT 'draft',

  -- Company details
  legal_name_en               TEXT NOT NULL,
  legal_name_ar               TEXT,
  trading_name                TEXT,
  country                     TEXT NOT NULL DEFAULT 'KW',
  address_line1               TEXT,
  address_line2               TEXT,
  city                        TEXT,
  state_region                TEXT,
  postal_code                 TEXT,
  industry_activity           TEXT,
  website                     TEXT,

  -- Primary contact
  contact_name                TEXT NOT NULL,
  contact_email               TEXT NOT NULL,
  contact_phone               TEXT,
  contact_position            TEXT,

  -- Authorized signatory
  signatory_name              TEXT,
  signatory_position          TEXT,
  signatory_civil_id_or_passport TEXT,

  -- Bank details
  bank_name                   TEXT,
  bank_branch                 TEXT,
  bank_account_name           TEXT,
  bank_account_number         TEXT,
  bank_iban                   TEXT,
  bank_swift_bic              TEXT,
  bank_currency               TEXT DEFAULT 'KWD',

  -- Tax / regulatory
  tax_registration_no         TEXT,
  has_tax_exemption           BOOLEAN DEFAULT false,
  has_iso_qms                 BOOLEAN DEFAULT false,
  iso_certifying_body         TEXT,
  payment_terms_preference    TEXT,

  -- Internal SAP fields (NEVER shown to vendor)
  sap_vendor_code             TEXT,
  sap_account_group           TEXT,
  sap_company_code            TEXT,
  sap_purchasing_organization TEXT,
  sap_creation_status         TEXT,
  sap_created_at              TIMESTAMPTZ,
  sap_created_by              UUID REFERENCES auth.users(id),
  sap_last_update_at          TIMESTAMPTZ,
  sap_last_update_by          UUID REFERENCES auth.users(id),
  sap_last_update_reference   TEXT,

  -- Lifecycle metadata
  attestation_accepted        BOOLEAN NOT NULL DEFAULT false,
  attestation_accepted_at     TIMESTAMPTZ,
  submitted_at                TIMESTAMPTZ,
  reviewed_by                 UUID REFERENCES auth.users(id),
  reviewed_at                 TIMESTAMPTZ,
  rejection_reason            TEXT,
  blocked_reason              TEXT,
  created_by                  UUID REFERENCES auth.users(id),  -- internal staff if entered on behalf
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_contact_email ON public.vendors(contact_email);
CREATE INDEX IF NOT EXISTS idx_vendors_legal_name ON public.vendors(legal_name_en);

-- Sequence for AHR-VEND reference numbers
CREATE SEQUENCE IF NOT EXISTS public.vendor_reference_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.generate_vendor_reference()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_val INT;
BEGIN
  next_val := nextval('public.vendor_reference_seq');
  RETURN 'AHR-VEND-' || LPAD(next_val::TEXT, 5, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.vendor_attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  document_type_id    UUID REFERENCES public.document_types(id),  -- which slot
  file_name           TEXT NOT NULL,
  file_url            TEXT NOT NULL,
  file_size           BIGINT,
  file_mime_type      TEXT,

  -- AI review results
  ai_verdict          public.doc_ai_verdict NOT NULL DEFAULT 'pending',
  ai_summary          TEXT,
  ai_findings         JSONB,         -- structured findings
  ai_rejection_reason TEXT,          -- specific message shown to vendor on rejection
  ai_analysed_at      TIMESTAMPTZ,
  ai_model_used       TEXT,

  -- Expiry tracking
  extracted_expiry_date DATE,        -- AI's best guess
  expiry_date         DATE,          -- authoritative (may be human-corrected)
  expiry_source       TEXT,          -- 'ai_extracted', 'manually_entered', 'manually_corrected'
  last_reminder_sent_at TIMESTAMPTZ,
  last_reminder_window  INT,         -- which window triggered the last email (60, 30, 14, 7, or -1 for expired)

  uploaded_by         UUID REFERENCES auth.users(id),
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_attachments_vendor ON public.vendor_attachments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_attachments_expiry ON public.vendor_attachments(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vendor_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,       -- 'submitted', 'approved', 'rejected', 'sap_code_entered', 'update_submitted', etc.
  actor_user_id UUID REFERENCES auth.users(id),
  actor_kind    TEXT,                -- 'staff', 'vendor', 'system'
  notes         TEXT,
  metadata      JSONB,               -- e.g. status_from, status_to, field changes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_audit_log_vendor ON public.vendor_audit_log(vendor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.vendor_sap_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  kind            public.vendor_sap_event_kind NOT NULL,
  status          public.vendor_sap_event_status NOT NULL DEFAULT 'pending',
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  completed_by    UUID REFERENCES auth.users(id),
  sap_reference   TEXT,
  error_message   TEXT,
  payload_snapshot JSONB,            -- snapshot of vendor data at request time
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_sap_events_vendor ON public.vendor_sap_events(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_sap_events_pending ON public.vendor_sap_events(status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.vendor_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_users_vendor ON public.vendor_users(vendor_id);

CREATE TABLE IF NOT EXISTS public.vendor_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  proposed_changes JSONB NOT NULL,        -- field-by-field changes
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, applied
  submitted_by_user_id UUID REFERENCES auth.users(id),
  submitted_by_kind    TEXT,              -- 'staff' or 'vendor'
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by          UUID REFERENCES auth.users(id),
  reviewed_at          TIMESTAMPTZ,
  rejection_reason     TEXT,
  applied_at           TIMESTAMPTZ,
  applied_by           UUID REFERENCES auth.users(id),
  sap_reference        TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendor_change_requests_vendor ON public.vendor_change_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_change_requests_pending ON public.vendor_change_requests(status) WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- 4. UPDATED-AT TRIGGERS
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vendors_set_updated_at ON public.vendors;
CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS vendor_attachments_set_updated_at ON public.vendor_attachments;
CREATE TRIGGER vendor_attachments_set_updated_at BEFORE UPDATE ON public.vendor_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. RLS — ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

ALTER TABLE public.vendor_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_sap_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_change_requests ENABLE ROW LEVEL SECURITY;

-- Lookup tables: read by anyone authenticated, write by admins only
CREATE POLICY "vendor_types_read_authenticated" ON public.vendor_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_types_admin_write" ON public.vendor_types
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "document_types_read_authenticated" ON public.document_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "document_types_admin_write" ON public.document_types
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vendor_document_requirements_read_authenticated" ON public.vendor_document_requirements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_document_requirements_admin_write" ON public.vendor_document_requirements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Note: lookup tables are also readable anonymously (for the public
-- registration form). We add an "anon SELECT" policy for those:
CREATE POLICY "vendor_types_read_anon" ON public.vendor_types
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "document_types_read_anon" ON public.document_types
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "vendor_document_requirements_read_anon" ON public.vendor_document_requirements
  FOR SELECT TO anon USING (true);

CREATE POLICY "document_reminder_settings_read_authenticated" ON public.document_reminder_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "document_reminder_settings_admin_write" ON public.document_reminder_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Vendors table:
-- - Staff with vendor_reviewer / vendor_master_admin / admin can see all
-- - Vendor users can see only their own vendor record
CREATE POLICY "vendors_staff_read" ON public.vendors
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'vendor_reviewer')
    OR public.has_role(auth.uid(), 'vendor_master_admin')
    OR public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE POLICY "vendors_vendor_user_read" ON public.vendors
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_users vu
      WHERE vu.vendor_id = vendors.id
        AND vu.user_id = auth.uid()
        AND vu.is_active = true
    )
  );

CREATE POLICY "vendors_staff_write" ON public.vendors
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

-- Anonymous insert is allowed for the public registration form.
-- Updates are blocked for anon - only fresh registrations.
CREATE POLICY "vendors_anon_insert" ON public.vendors
  FOR INSERT TO anon WITH CHECK (status = 'submitted');

-- vendor_attachments — staff full access; vendor users read+write own
CREATE POLICY "vendor_attachments_staff_all" ON public.vendor_attachments
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

CREATE POLICY "vendor_attachments_vendor_own" ON public.vendor_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_users vu
      WHERE vu.vendor_id = vendor_attachments.vendor_id
        AND vu.user_id = auth.uid()
        AND vu.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendor_users vu
      WHERE vu.vendor_id = vendor_attachments.vendor_id
        AND vu.user_id = auth.uid()
        AND vu.is_active = true
    )
  );

CREATE POLICY "vendor_attachments_anon_insert" ON public.vendor_attachments
  FOR INSERT TO anon WITH CHECK (true);

-- vendor_audit_log — read by staff; write by anyone via service role
-- (audit entries are written from edge functions / triggers)
CREATE POLICY "vendor_audit_log_staff_read" ON public.vendor_audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'vendor_reviewer')
    OR public.has_role(auth.uid(), 'vendor_master_admin')
  );

CREATE POLICY "vendor_audit_log_authenticated_insert" ON public.vendor_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- vendor_sap_events — staff only, NEVER visible to vendor users
CREATE POLICY "vendor_sap_events_staff_all" ON public.vendor_sap_events
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'vendor_master_admin')
    OR public.has_role(auth.uid(), 'vendor_reviewer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'vendor_master_admin')
  );

-- vendor_users — admin manages; vendor sees own row only
CREATE POLICY "vendor_users_admin_all" ON public.vendor_users
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendor_master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendor_master_admin'));

CREATE POLICY "vendor_users_self_read" ON public.vendor_users
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- vendor_change_requests — staff full access; vendor users see own
CREATE POLICY "vendor_change_requests_staff_all" ON public.vendor_change_requests
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

CREATE POLICY "vendor_change_requests_vendor_own" ON public.vendor_change_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vendor_users vu
      WHERE vu.vendor_id = vendor_change_requests.vendor_id
        AND vu.user_id = auth.uid()
        AND vu.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendor_users vu
      WHERE vu.vendor_id = vendor_change_requests.vendor_id
        AND vu.user_id = auth.uid()
        AND vu.is_active = true
    )
  );

-- ---------------------------------------------------------------------
-- 6. SEED — VENDOR TYPES
-- ---------------------------------------------------------------------

INSERT INTO public.vendor_types (code, label_en, label_ar, display_order) VALUES
  ('local_company',     'Local Company (Kuwait)',  'شركة محلية (الكويت)',     10),
  ('local_individual',  'Local Individual Contractor', 'مقاول فرد محلي',     20),
  ('international',     'International Company',   'شركة دولية',              30)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. SEED — DOCUMENT TYPES (from Al Hamra's existing supplier forms)
-- ---------------------------------------------------------------------

INSERT INTO public.document_types (code, label_en, label_ar, has_expiry, ai_check_hints, display_order) VALUES
  ('constitutional_documents',   'Constitutional Documents (MoA / AoA)',
                                 'مستندات التأسيس (عقد التأسيس / النظام الأساسي)',
                                 false,
                                 'Should contain: company legal name, partners/shareholders, share capital, business activities, signatory powers.',
                                 10),
  ('commercial_registration',    'Commercial Registration / License',
                                 'السجل التجاري / الترخيص',
                                 true,
                                 'Look for: registration number, company name, expiry date (Valid Until / حتى تاريخ), registered activities, address.',
                                 20),
  ('authorized_signatories',     'Authorized Signatories Certificate',
                                 'شهادة المفوضين بالتوقيع',
                                 true,
                                 'Should list authorized signatory names and positions.',
                                 30),
  ('civil_id_signatory',         'Civil ID — Authorized Signatory',
                                 'البطاقة المدنية للمفوض بالتوقيع',
                                 true,
                                 'Kuwait Civil ID. Look for: civil_id number (12 digits), full name (English+Arabic), expiry date.',
                                 40),
  ('civil_id_manager',           'Civil ID — Manager / Chairman / CEO',
                                 'البطاقة المدنية لمن يمثل الشركة',
                                 true,
                                 'Kuwait Civil ID for the legal representative of the company per its legal form.',
                                 50),
  ('passport_signatory',         'Passport Copy — Authorized Signatory',
                                 'صورة جواز السفر للمفوض بالتوقيع',
                                 true,
                                 'International signatory passport. Look for passport number, full name, nationality, expiry date.',
                                 60),
  ('government_approvals',       'Government Approvals',
                                 'الموافقات الحكومية',
                                 false,
                                 'Any required government licensing for the vendor''s business activity.',
                                 70),
  ('major_clients_list',         'List of Major Current Clients',
                                 'قائمة العملاء الحاليين الرئيسيين',
                                 false,
                                 'Should be a list of current significant clients.',
                                 80),
  ('completed_projects',         'Completed Projects / Engagements',
                                 'المشاريع / المهام المنجزة',
                                 false,
                                 'Portfolio of past work / company profile / CV-style document.',
                                 90),
  ('tax_registration',           'Tax / VAT Registration',
                                 'تسجيل الضريبة / ضريبة القيمة المضافة',
                                 false,
                                 'Tax registration certificate; extract registration number.',
                                 100),
  ('tax_exemption',              'Tax Exemption Certificate',
                                 'شهادة الخضوع الضريبي',
                                 true,
                                 'Tax exemption certificate; check expiry / validity.',
                                 110),
  ('bank_account_details',       'Bank Account Details',
                                 'تفاصيل الحساب البنكي',
                                 false,
                                 'Bank letter or IBAN certificate. Extract: account holder name (must match company), IBAN, bank name, branch, currency. Verify account holder matches the registered company name exactly.',
                                 120),
  ('company_financials',         'Company Financial Statements',
                                 'البيانات المالية للشركة',
                                 false,
                                 'Audited financial statements; check year coverage.',
                                 130),
  ('payment_terms',              'Payment Terms and Conditions',
                                 'شروط وبنود السداد',
                                 false,
                                 'Vendor''s standard payment terms.',
                                 140),
  ('individual_contractor_civil_id', 'Civil ID — Individual Contractor',
                                 'البطاقة المدنية للمقاول الفرد',
                                 true,
                                 'For individual contractors: their personal Civil ID.',
                                 150),
  ('iso_qms_setup',              'ISO Quality Management System Setup',
                                 'إعدادات نظام إدارة الجودة (ISO)',
                                 true,
                                 'ISO 9001 or similar certification; check certifying body and expiry.',
                                 160),
  ('iso_audit_availability',     'Availability for ISO Audits at Supplier Facility',
                                 'احتمالية إجراء تدقيق ايزو على منشأة المورد',
                                 false,
                                 'Vendor''s confirmation about ISO audit availability.',
                                 170)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 8. SEED — DOCUMENT REQUIREMENTS PER VENDOR TYPE
-- (From Al Hamra's existing Local + International supplier forms)
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_local_company UUID;
  v_local_individual UUID;
  v_international UUID;

  d_constitutional UUID;
  d_commercial UUID;
  d_signatories UUID;
  d_civil_id_signatory UUID;
  d_civil_id_manager UUID;
  d_passport UUID;
  d_gov_approvals UUID;
  d_clients UUID;
  d_projects UUID;
  d_tax UUID;
  d_tax_exempt UUID;
  d_bank UUID;
  d_financials UUID;
  d_payment_terms UUID;
  d_individual_civil UUID;
  d_iso_qms UUID;
  d_iso_audit UUID;
BEGIN
  SELECT id INTO v_local_company    FROM public.vendor_types WHERE code = 'local_company';
  SELECT id INTO v_local_individual FROM public.vendor_types WHERE code = 'local_individual';
  SELECT id INTO v_international    FROM public.vendor_types WHERE code = 'international';

  SELECT id INTO d_constitutional      FROM public.document_types WHERE code = 'constitutional_documents';
  SELECT id INTO d_commercial          FROM public.document_types WHERE code = 'commercial_registration';
  SELECT id INTO d_signatories         FROM public.document_types WHERE code = 'authorized_signatories';
  SELECT id INTO d_civil_id_signatory  FROM public.document_types WHERE code = 'civil_id_signatory';
  SELECT id INTO d_civil_id_manager    FROM public.document_types WHERE code = 'civil_id_manager';
  SELECT id INTO d_passport            FROM public.document_types WHERE code = 'passport_signatory';
  SELECT id INTO d_gov_approvals       FROM public.document_types WHERE code = 'government_approvals';
  SELECT id INTO d_clients             FROM public.document_types WHERE code = 'major_clients_list';
  SELECT id INTO d_projects            FROM public.document_types WHERE code = 'completed_projects';
  SELECT id INTO d_tax                 FROM public.document_types WHERE code = 'tax_registration';
  SELECT id INTO d_tax_exempt          FROM public.document_types WHERE code = 'tax_exemption';
  SELECT id INTO d_bank                FROM public.document_types WHERE code = 'bank_account_details';
  SELECT id INTO d_financials          FROM public.document_types WHERE code = 'company_financials';
  SELECT id INTO d_payment_terms       FROM public.document_types WHERE code = 'payment_terms';
  SELECT id INTO d_individual_civil    FROM public.document_types WHERE code = 'individual_contractor_civil_id';
  SELECT id INTO d_iso_qms             FROM public.document_types WHERE code = 'iso_qms_setup';
  SELECT id INTO d_iso_audit           FROM public.document_types WHERE code = 'iso_audit_availability';

  -- LOCAL COMPANY (16 documents from the local supplier form)
  INSERT INTO public.vendor_document_requirements (vendor_type_id, document_type_id, is_required, is_conditional, condition_label_en, condition_label_ar, display_order) VALUES
    (v_local_company, d_constitutional,     true,  false, NULL, NULL, 10),
    (v_local_company, d_commercial,         true,  false, NULL, NULL, 20),
    (v_local_company, d_signatories,        true,  false, NULL, NULL, 30),
    (v_local_company, d_civil_id_signatory, true,  false, NULL, NULL, 40),
    (v_local_company, d_civil_id_manager,   true,  false, NULL, NULL, 50),
    (v_local_company, d_gov_approvals,      false, true,  'If applicable to your business activity', 'إن وجدت', 60),
    (v_local_company, d_clients,            true,  false, NULL, NULL, 70),
    (v_local_company, d_projects,           true,  false, NULL, NULL, 80),
    (v_local_company, d_tax,                false, true,  'If you have a tax registration', 'إن وجد', 90),
    (v_local_company, d_tax_exempt,         false, true,  'If applicable', 'إن وجدت', 100),
    (v_local_company, d_bank,               true,  false, NULL, NULL, 110),
    (v_local_company, d_financials,         false, true,  'If applicable', 'إن وجدت', 120),
    (v_local_company, d_payment_terms,      true,  false, NULL, NULL, 130),
    (v_local_company, d_iso_qms,            false, true,  'If you hold ISO certification', 'إن وجدت', 140),
    (v_local_company, d_iso_audit,          false, false, NULL, NULL, 150)
  ON CONFLICT DO NOTHING;

  -- LOCAL INDIVIDUAL CONTRACTOR (only Civil ID per the form note)
  INSERT INTO public.vendor_document_requirements (vendor_type_id, document_type_id, is_required, is_conditional, condition_label_en, condition_label_ar, display_order) VALUES
    (v_local_individual, d_individual_civil, true, false, NULL, NULL, 10),
    (v_local_individual, d_bank,             true, false, NULL, NULL, 20),
    (v_local_individual, d_payment_terms,    true, false, NULL, NULL, 30)
  ON CONFLICT DO NOTHING;

  -- INTERNATIONAL (6 documents from the international supplier form)
  INSERT INTO public.vendor_document_requirements (vendor_type_id, document_type_id, is_required, is_conditional, condition_label_en, condition_label_ar, display_order) VALUES
    (v_international, d_commercial,    true,  false, NULL, NULL, 10),
    (v_international, d_signatories,   true,  false, NULL, NULL, 20),
    (v_international, d_passport,      true,  false, NULL, NULL, 30),
    (v_international, d_tax,           false, true,  'If you have a tax registration', 'إن وجد', 40),
    (v_international, d_tax_exempt,    false, true,  'If applicable', 'إن وجدت', 50),
    (v_international, d_bank,          true,  false, NULL, NULL, 60)
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------
-- 9. SEED — DEFAULT REMINDER SETTINGS (single row, admin can edit)
-- ---------------------------------------------------------------------

INSERT INTO public.document_reminder_settings (reminder_days, notify_vendor, notify_procurement)
VALUES (ARRAY[60, 30, 14, 7], true, true)
ON CONFLICT DO NOTHING;

COMMIT;
