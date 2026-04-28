import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * Wraps a route element and gates rendering on a permission resource_key.
 * If the current user does not have access, redirects to /no-access with
 * the attempted path passed in state so the No-Access page can show context.
 *
 * Admins always pass through (handled inside usePermissions).
 *
 * Note: this is the FRONTEND gate. The authoritative server-side gate is
 * Postgres RLS on the underlying tables. We rely on RLS to make sure that
 * even if a malicious user bypasses the frontend, they cannot read or
 * write data they aren't entitled to.
 */
export interface ProtectedRouteProps {
  resourceKey: string;
  /** Optional role required IN ADDITION to the permission. e.g. 'finance' for finance pages. */
  requiredRole?: string;
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ resourceKey, requiredRole, children }) => {
  const { hasPermission, loading } = usePermissions();
  const { user, hasRole } = useAuth();
  const location = useLocation();

  // Auth guard: not signed in → kick to /login
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // While permissions load, show a brief spinner (default-allow inside the
  // hook still applies, but the page might use hasPermission for finer
  // gating, so we give the data a moment to arrive).
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Checking access…
      </div>
    );
  }

  // Role check (admin always passes)
  if (requiredRole && !hasRole('admin') && !hasRole(requiredRole as any)) {
    return <Navigate to="/no-access" state={{ from: location.pathname, reason: 'role' }} replace />;
  }

  // Permission check
  if (!hasPermission(resourceKey)) {
    return <Navigate to="/no-access" state={{ from: location.pathname, reason: 'permission' }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
