-- Create a SECURITY DEFINER function to fetch finance reviewer pool,
-- bypassing user_roles RLS that hides other users' roles from non-admins.
CREATE OR REPLACE FUNCTION public.get_finance_reviewer_pool()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  job_title text,
  is_active boolean,
  roles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.full_name,
    p.email,
    p.job_title,
    p.is_active,
    ARRAY(
      SELECT ur.role::text
      FROM public.user_roles ur
      WHERE ur.user_id = p.user_id
        AND ur.role::text IN (
          'finance_dispatcher','ap_accountant','ar_accountant','budget_controller','finance','finance_manager'
        )
    ) AS roles
  FROM public.profiles p
  WHERE p.is_active = true
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur2
      WHERE ur2.user_id = p.user_id
        AND ur2.role::text IN (
          'finance_dispatcher','ap_accountant','ar_accountant','budget_controller','finance','finance_manager'
        )
    )
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_reviewer_pool() TO authenticated;