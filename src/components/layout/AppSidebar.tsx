import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  FileText,
  FilePlus,
  CheckSquare,
  Settings,
  Users,
  LogOut,
  Building2,
  Shield,
  ScrollText,
  BarChart3,
  ShieldCheck,
  HelpCircle,
  Bell,
  Lock,
  Banknote,
  Plus,
  Minus,
  Briefcase,
  Workflow,
  History,
  Eye,
  CalendarDays,
} from 'lucide-react';

// -------------------------------------------------------------------------
// Nav data
// -------------------------------------------------------------------------

interface NavItem {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  key: string;
}

interface NavGroup {
  id: string;             // localStorage key suffix
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  /** If specified, only render the group when the predicate returns true. */
  visibleWhen?: (helpers: { hasRole: (r: string) => boolean }) => boolean;
  defaultOpen?: boolean;
  /** Optional sub-groups inside this group (only one level of nesting supported). */
  subgroups?: NavGroup[];
}

const mainItems: NavItem[] = [
  { title: 'Dashboard',           icon: LayoutDashboard, path: '/',                key: 'dashboard' },
  { title: 'All Memos',           icon: FileText,        path: '/memos',           key: 'memos' },
  { title: 'Create Memo',         icon: FilePlus,        path: '/memos/create',    key: 'memos/create' },
  { title: 'Pending My Approval', icon: CheckSquare,     path: '/approvals',       key: 'approvals' },
  { title: 'Help & Guide',        icon: HelpCircle,      path: '/help',            key: 'help' },
];

const financeItems: NavItem[] = [
  { title: 'Payments', icon: Banknote, path: '/finance/payments', key: 'finance/payments' },
];

// Administration is broken into three logical sub-groups. Each is its own
// collapsible section with +/- indicator, so admins don't see a single wall
// of 11 links.
const adminGroups: NavGroup[] = [
  {
    id: 'admin/users-access',
    label: 'Users & Access',
    icon: Users,
    items: [
      { title: 'User Management',  icon: Users,       path: '/admin/users',            key: 'admin/users' },
      { title: 'Departments',      icon: Building2,   path: '/admin/departments',      key: 'admin/departments' },
      { title: 'Authorization',    icon: Lock,        path: '/admin/authorization',    key: 'admin/authorization' },
      { title: 'Cross-Dept Rules', icon: ShieldCheck, path: '/admin/cross-dept-rules', key: 'admin/cross-dept-rules' },
      { title: 'Delegates',        icon: Shield,      path: '/admin/delegates',        key: 'admin/delegates' },
    ],
  },
  {
    id: 'admin/workflows-approvals',
    label: 'Workflows & Approvals',
    icon: Workflow,
    items: [
      { title: 'Workflows',          icon: Workflow,  path: '/admin/workflows',           key: 'admin/workflows' },
      { title: 'Workflow Preview',   icon: Eye,       path: '/admin/workflow-preview',    key: 'admin/workflow-preview' },
      { title: 'Reminder Settings',  icon: Bell,      path: '/admin/reminder-settings',   key: 'admin/reminder-settings' },
      { title: 'Approval KPIs',      icon: BarChart3, path: '/admin/approval-performance',key: 'admin/approval-performance' },
      { title: 'Holidays',           icon: CalendarDays, path: '/admin/holidays',          key: 'admin/holidays' },
    ],
  },
  {
    id: 'admin/security-compliance',
    label: 'Security & Compliance',
    icon: Shield,
    items: [
      { title: 'Fraud & MFA',       icon: ShieldCheck, path: '/admin/fraud-settings',     key: 'admin/fraud-settings' },
      { title: 'Permission Audit',  icon: History,     path: '/admin/permission-audit',   key: 'admin/permission-audit' },
      { title: 'Audit Log',         icon: ScrollText,  path: '/admin/audit-log',          key: 'admin/audit-log' },
      { title: 'Audit Analytics',   icon: BarChart3,   path: '/admin/audit-dashboard',    key: 'admin/audit-dashboard' },
    ],
  },
];

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

const STORAGE_KEY = 'sidebar:open-groups:v1';

function loadOpenState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOpenState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore — quota / private mode etc.
  }
}

/**
 * Tiny wrapper used by both top-level groups and admin sub-groups. Renders
 * a clickable header row with a +/- toggle, persists open/close state to
 * localStorage, and animates content in/out via a CSS grid trick (1fr ↔ 0fr).
 */
const CollapsibleSection: React.FC<{
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  /** Auto-open if a child route matches the current location. */
  autoOpenForActive?: boolean;
  /** Indent the label slightly (used for nested admin sub-groups). */
  nested?: boolean;
  children: React.ReactNode;
}> = ({ id, label, icon: Icon, defaultOpen = true, autoOpenForActive = false, nested = false, children }) => {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = loadOpenState();
    return stored[id] !== undefined ? stored[id] : defaultOpen;
  });

  // Auto-open when a descendant route is active (so users never see a
  // "you're on a page that's hidden inside a collapsed group" mismatch).
  useEffect(() => {
    if (autoOpenForActive && !open) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenForActive]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const stored = loadOpenState();
    stored[id] = next;
    saveOpenState(stored);
  };

  return (
    <div className={nested ? 'ml-1' : ''}>
      <button
        type="button"
        onClick={toggle}
        className={
          'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide ' +
          'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-colors'
        }
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        {open ? (
          <Minus className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
        ) : (
          <Plus className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
        )}
      </button>
      {/* CSS-grid collapse: animates max-content height without measuring */}
      <div
        className={
          'grid transition-[grid-template-rows] duration-200 ease-out ' +
          (open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')
        }
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// Sidebar
// -------------------------------------------------------------------------

const AppSidebar = () => {
  const { profile, hasRole, signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const groupHasActive = (items: NavItem[]) => items.some((it) => isActive(it.path));

  const renderItem = (item: NavItem) => (
    <SidebarMenuItem key={item.path}>
      <SidebarMenuButton
        onClick={() => navigate(item.path)}
        className={
          isActive(item.path)
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : ''
        }
      >
        <item.icon className="h-4 w-4" />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  // ---- Filter by permission --------------------------------------------------
  const visibleMain = mainItems.filter((i) => hasPermission(i.key));
  const visibleFinance = financeItems.filter((i) => hasPermission(i.key));

  const visibleAdminGroups = adminGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => hasPermission(i.key)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <img src={alHamraLogo} alt="Al Hamra Logo" className="w-10 h-10 object-contain shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-sidebar-foreground truncate">Al Hamra</h2>
            <p className="text-xs text-sidebar-foreground/60 truncate">Memo Platform</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 space-y-2">
        {/* Main navigation — flat, always expanded */}
        {visibleMain.length > 0 && (
          <CollapsibleSection
            id="navigation"
            label="Navigation"
            defaultOpen={true}
            autoOpenForActive={groupHasActive(visibleMain)}
          >
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu>{visibleMain.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </CollapsibleSection>
        )}

        {/* Finance — visible by role or explicit Authorization permission */}
        {visibleFinance.length > 0 && (
          <CollapsibleSection
            id="finance"
            label="Finance"
            icon={Briefcase}
            defaultOpen={true}
            autoOpenForActive={groupHasActive(visibleFinance)}
          >
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu>{visibleFinance.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </CollapsibleSection>
        )}

        {/* Administration — collapsible parent with three collapsible sub-sections */}
        {hasRole('admin') && visibleAdminGroups.length > 0 && (
          <CollapsibleSection
            id="administration"
            label="Administration"
            icon={Shield}
            defaultOpen={true}
            autoOpenForActive={visibleAdminGroups.some((g) => groupHasActive(g.items))}
          >
            <div className="space-y-1 pl-1">
              {visibleAdminGroups.map((sub) => (
                <CollapsibleSection
                  key={sub.id}
                  id={sub.id}
                  label={sub.label}
                  icon={sub.icon}
                  defaultOpen={false}
                  autoOpenForActive={groupHasActive(sub.items)}
                  nested
                >
                  <SidebarGroup className="p-0">
                    <SidebarGroupContent>
                      <SidebarMenu>{sub.items.map(renderItem)}</SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </CollapsibleSection>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
            <span className="text-sidebar-accent-foreground text-xs font-medium">
              {profile?.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '??'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{profile?.job_title || ''}</p>
          </div>
        </div>
        <SidebarMenu>
          {hasPermission('settings') && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => navigate('/settings')}
                className={isActive('/settings') ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : ''}
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
