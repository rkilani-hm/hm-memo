export type RouteRequiredRole = 'admin' | 'department_head' | 'staff' | 'approver' | 'finance';

export interface RouteAccessRule {
  path: string;
  label: string;
  area: string;
  resourceKey: string;
  requiredRole?: RouteRequiredRole;
}

export const routeAccessRules: RouteAccessRule[] = [
  { path: '/', label: 'Dashboard', area: 'Navigation', resourceKey: 'dashboard' },
  { path: '/memos', label: 'All Memos', area: 'Memos', resourceKey: 'memos' },
  { path: '/memos/create', label: 'Create Memo', area: 'Memos', resourceKey: 'memos/create' },
  { path: '/memos/:id/edit', label: 'Edit Memo', area: 'Memos', resourceKey: 'memos' },
  { path: '/memos/:id', label: 'View Memo', area: 'Memos', resourceKey: 'memos' },
  { path: '/approvals', label: 'Pending My Approval', area: 'Approvals', resourceKey: 'approvals' },
  { path: '/finance/payments', label: 'Payments — Finance Queue', area: 'Finance', resourceKey: 'finance/payments', requiredRole: 'finance' },
  { path: '/settings', label: 'Settings', area: 'Account', resourceKey: 'settings' },
  { path: '/help', label: 'Help & Guide', area: 'Support', resourceKey: 'help' },
  { path: '/notifications', label: 'Notifications', area: 'Account', resourceKey: 'notifications' },
  { path: '/admin/users', label: 'User Management', area: 'Administration', resourceKey: 'admin/users', requiredRole: 'admin' },
  { path: '/admin/departments', label: 'Departments', area: 'Administration', resourceKey: 'admin/departments', requiredRole: 'admin' },
  { path: '/admin/workflows', label: 'Workflows', area: 'Administration', resourceKey: 'admin/workflows', requiredRole: 'admin' },
  { path: '/admin/delegates', label: 'Delegates', area: 'Administration', resourceKey: 'admin/delegates', requiredRole: 'admin' },
  { path: '/admin/audit-log', label: 'Audit Log', area: 'Administration', resourceKey: 'admin/audit-log', requiredRole: 'admin' },
  { path: '/admin/audit-dashboard', label: 'Audit Analytics', area: 'Administration', resourceKey: 'admin/audit-dashboard', requiredRole: 'admin' },
  { path: '/admin/cross-dept-rules', label: 'Cross-Dept Rules', area: 'Administration', resourceKey: 'admin/cross-dept-rules', requiredRole: 'admin' },
  { path: '/admin/approval-performance', label: 'Approval KPIs', area: 'Administration', resourceKey: 'admin/approval-performance', requiredRole: 'admin' },
  { path: '/admin/reminder-settings', label: 'Reminder Settings', area: 'Administration', resourceKey: 'admin/reminder-settings', requiredRole: 'admin' },
  { path: '/admin/authorization', label: 'Authorization', area: 'Administration', resourceKey: 'admin/authorization', requiredRole: 'admin' },
  { path: '/admin/fraud-settings', label: 'Fraud & MFA', area: 'Administration', resourceKey: 'admin/fraud-settings', requiredRole: 'admin' },
  { path: '/admin/permission-audit', label: 'Permission Audit', area: 'Administration', resourceKey: 'admin/permission-audit', requiredRole: 'admin' },
];

export const getRouteAccessRule = (path: string) => routeAccessRules.find((rule) => rule.path === path);

export const routeGuard = (path: string) => {
  const rule = getRouteAccessRule(path);
  if (!rule) throw new Error(`Missing route access rule for ${path}`);
  return { resourceKey: rule.resourceKey, requiredRole: rule.requiredRole };
};