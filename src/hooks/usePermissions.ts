import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface PermissionState {
  loading: boolean;
  permissions: Map<string, boolean>;
}

/**
 * Resolves effective permission for a resource_key.
 * Priority: admin=always true > user override > department default > true (default allow)
 */
export function usePermissions() {
  const { user, profile, hasRole } = useAuth();
  const [state, setState] = useState<PermissionState>({ loading: true, permissions: new Map() });
  const isAdmin = hasRole('admin');

  useEffect(() => {
    if (!user) {
      setState({ loading: false, permissions: new Map() });
      return;
    }

    if (isAdmin) {
      // Admin has access to everything
      setState({ loading: false, permissions: new Map() });
      return;
    }

    const load = async () => {
      const permMap = new Map<string, boolean>();

      // Fetch department permissions
      if (profile?.department_id) {
        const { data: deptPerms } = await supabase
          .from('department_permissions')
          .select('resource_key, is_allowed')
          .eq('department_id', profile.department_id);

        if (deptPerms) {
          for (const p of deptPerms) {
            permMap.set(p.resource_key, p.is_allowed);
          }
        }
      }

      // Fetch user overrides (takes priority)
      const { data: userPerms } = await supabase
        .from('user_permissions')
        .select('resource_key, is_allowed')
        .eq('user_id', user.id);

      if (userPerms) {
        for (const p of userPerms) {
          permMap.set(p.resource_key, p.is_allowed);
        }
      }

      setState({ loading: false, permissions: permMap });
    };

    load();
  }, [user, profile?.department_id, isAdmin]);

  const hasPermission = (resourceKey: string): boolean => {
    if (isAdmin) return true;
    if (state.loading) return true; // Default allow while loading
    const perm = state.permissions.get(resourceKey);
    return perm === undefined ? true : perm; // Default allow if not configured
  };

  return { hasPermission, loading: state.loading };
}
