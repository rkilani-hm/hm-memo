import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Effective permission resolution
 * --------------------------------------------------------------
 * Priority (highest → lowest):
 *   1. Admin role           → always allowed (bypass)
 *   2. user_permissions     → explicit per-user grant or deny
 *   3. department_permissions → department default for the user's dept
 *   4. (default)            → ALLOWED if not configured anywhere
 *
 * "Default allow" means: a fresh resource_key not configured in either
 * table is accessible by everyone. This matches the UI in
 * Admin → Authorization where each row cycles Default → Denied → Allowed.
 *
 * Cache invalidation
 * --------------------------------------------------------------
 * Both queries below use the keys ['user_permissions', userId] and
 * ['department_permissions', deptId]. The Authorization admin page
 * invalidates them whenever it writes a change, so the admin's own
 * view updates immediately. Other users will pick up the change on
 * their next route change (React Query refetches stale data on
 * window focus by default).
 */
export function usePermissions() {
  const { user, profile, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const userId = user?.id;
  const departmentId = profile?.department_id ?? null;

  // User-level explicit overrides
  const userPermsQuery = useQuery({
    queryKey: ['user_permissions', userId ?? 'anon'],
    enabled: !!userId && !isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('resource_key, is_allowed')
        .eq('user_id', userId!);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000, // 1 min — re-fetches on window focus
  });

  // Department-level defaults
  const deptPermsQuery = useQuery({
    queryKey: ['department_permissions', departmentId ?? 'none'],
    enabled: !!userId && !isAdmin && !!departmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_permissions')
        .select('resource_key, is_allowed')
        .eq('department_id', departmentId!);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000,
  });

  const permMap = useMemo(() => {
    const m = new Map<string, boolean>();
    if (isAdmin || !userId) return m;
    // Department first, user overrides on top
    for (const p of deptPermsQuery.data || []) m.set(p.resource_key, p.is_allowed);
    for (const p of userPermsQuery.data || []) m.set(p.resource_key, p.is_allowed);
    return m;
  }, [isAdmin, userId, deptPermsQuery.data, userPermsQuery.data]);

  const loading =
    !!userId && !isAdmin && (userPermsQuery.isLoading || deptPermsQuery.isLoading);

  const hasPermission = (resourceKey: string): boolean => {
    if (isAdmin) return true;
    // While loading, allow access (so a slow network doesn't flash-deny content
    // the user is entitled to). Pages with sensitive data should still rely on
    // server-side RLS as the authoritative gate.
    if (loading) return true;
    const v = permMap.get(resourceKey);
    return v === undefined ? true : v;
  };

  return { hasPermission, loading };
}

/**
 * Tiny hook used by the Authorization admin page after writing a permission
 * change, so the admin's own sidebar/permissions react immediately. Other
 * users will pick up the change on their next page navigation.
 */
export function useInvalidatePermissions() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['user_permissions'] });
    qc.invalidateQueries({ queryKey: ['department_permissions'] });
  };
}
