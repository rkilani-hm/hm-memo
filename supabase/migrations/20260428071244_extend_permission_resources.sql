-- =====================================================================
-- Add new pages to the permission_resources catalog so admins can grant
-- or revoke access via the Authorization page.
--
-- Pages added since the original seed:
--   - admin/fraud-settings    (Fraud + MFA admin page)
--   - finance/payments        (Finance team's payment handoff dashboard)
-- =====================================================================

INSERT INTO public.permission_resources (resource_key, label, category, description, sort_order)
VALUES
  ('admin/fraud-settings', 'Fraud & MFA Settings', 'page',
     'Configure fraud-detection thresholds, AI provider, and Microsoft Authenticator step-up MFA (admin)', 20),
  ('finance/payments', 'Finance — Payments', 'page',
     'Finance team dashboard: receive originals + release payments for approved memos', 50)
ON CONFLICT (resource_key) DO NOTHING;
