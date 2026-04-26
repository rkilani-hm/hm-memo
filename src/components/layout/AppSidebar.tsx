import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import { useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
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
} from 'lucide-react';

const AppSidebar = () => {
  const { profile, hasRole, signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();

  const mainNavItems = [
    { title: 'Dashboard', icon: LayoutDashboard, path: '/', key: 'dashboard' },
    { title: 'All Memos', icon: FileText, path: '/memos', key: 'memos' },
    { title: 'Create Memo', icon: FilePlus, path: '/memos/create', key: 'memos/create' },
    { title: 'Pending My Approval', icon: CheckSquare, path: '/approvals', key: 'approvals' },
    { title: 'Help & Guide', icon: HelpCircle, path: '/help', key: 'help' },
  ];

  const adminNavItems = [
    { title: 'User Management', icon: Users, path: '/admin/users', key: 'admin/users' },
    { title: 'Departments', icon: Building2, path: '/admin/departments', key: 'admin/departments' },
    { title: 'Workflows', icon: Settings, path: '/admin/workflows', key: 'admin/workflows' },
    { title: 'Delegates', icon: Shield, path: '/admin/delegates', key: 'admin/delegates' },
    { title: 'Cross-Dept Rules', icon: ShieldCheck, path: '/admin/cross-dept-rules', key: 'admin/cross-dept-rules' },
    { title: 'Authorization', icon: Lock, path: '/admin/authorization', key: 'admin/authorization' },
    { title: 'Approval KPIs', icon: BarChart3, path: '/admin/approval-performance', key: 'admin/approval-performance' },
    { title: 'Reminder Settings', icon: Bell, path: '/admin/reminder-settings', key: 'admin/reminder-settings' },
    { title: 'Fraud & MFA', icon: ShieldCheck, path: '/admin/fraud-settings', key: 'admin/fraud-settings' },
    { title: 'Audit Log', icon: ScrollText, path: '/admin/audit-log', key: 'admin/audit-log' },
    { title: 'Audit Analytics', icon: BarChart3, path: '/admin/audit-dashboard', key: 'admin/audit-dashboard' },
  ];

  const visibleMain = mainNavItems.filter((item) => hasPermission(item.key));
  const visibleAdmin = adminNavItems.filter((item) => hasPermission(item.key));

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
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton onClick={() => navigate(item.path)}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {hasRole('admin') && visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton onClick={() => navigate(item.path)}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
            <span className="text-sidebar-accent-foreground text-xs font-medium">
              {profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'}
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
              <SidebarMenuButton onClick={() => navigate('/settings')}>
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
