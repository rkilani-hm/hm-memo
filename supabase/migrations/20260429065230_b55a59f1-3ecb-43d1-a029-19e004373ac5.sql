-- Backfill dispatch steps that were auto-approved without a signature image.
-- These are approved approval_steps where is_dispatcher = true and signature_image_url is null.
-- We stamp the dispatcher's stored asset (initials_image_url for 'initial', signature_image_url for 'signature') so the memo preview / PDF renders their actual mark instead of a fallback ✓.
UPDATE public.approval_steps ast
SET 
  signature_image_url = COALESCE(
    CASE 
      WHEN ast.action_type = 'initial' THEN p.initials_image_url
      ELSE p.signature_image_url
    END,
    CASE 
      WHEN ast.action_type = 'initial' THEN p.signature_image_url
      ELSE p.initials_image_url
    END
  ),
  signing_method = CASE 
    WHEN COALESCE(
      CASE WHEN ast.action_type = 'initial' THEN p.initials_image_url ELSE p.signature_image_url END,
      CASE WHEN ast.action_type = 'initial' THEN p.signature_image_url ELSE p.initials_image_url END
    ) IS NOT NULL THEN 'digital'
    ELSE ast.signing_method
  END
FROM public.profiles p
WHERE ast.approver_user_id = p.user_id
  AND ast.is_dispatcher = true
  AND ast.status = 'approved'
  AND ast.signature_image_url IS NULL;