-- =====================================================================
-- Vendor Master Module — Part 1: Enums & Roles (must commit before use)
-- =====================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor_reviewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor_master_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_status') THEN
    CREATE TYPE public.vendor_status AS ENUM (
      'draft','submitted','approved_pending_sap_creation','active_in_sap',
      'update_submitted','update_approved_pending_sap_update',
      'sap_update_completed','sap_update_failed_needs_correction',
      'rejected','inactive','blocked_documents_expired'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_ai_verdict') THEN
    CREATE TYPE public.doc_ai_verdict AS ENUM ('pending','accepted','rejected','soft_pending');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_sap_event_kind') THEN
    CREATE TYPE public.vendor_sap_event_kind AS ENUM ('creation','update');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_sap_event_status') THEN
    CREATE TYPE public.vendor_sap_event_status AS ENUM ('pending','completed','failed');
  END IF;
END $$;