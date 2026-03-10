import { useAuth } from '@/contexts/AuthContext';
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
} from 'lucide-react';

const AppSidebar = () => {
  const { profile, hasRole, signOut } = useAuth();
  const navigate = useNavigate();

  const mainNavItems = [
    { title: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { title: 'My Memos', icon: FileText, path: '/memos' },
    { title: 'Create Memo', icon: FilePlus, path: '/memos/create' },
    { title: 'Pending Approvals', icon: CheckSquare, path: '/approvals' },
  ];

  const adminNavItems = [
    { title: 'User Management', icon: Users, path: '/admin/users' },
    { title: 'Departments', icon: Building2, path: '/admin/departments' },
    { title: 'Workflows', icon: Settings, path: '/admin/workflows' },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center shrink-0">
            <span className="text-sidebar-primary-foreground text-sm font-bold">AH</span>
          </div>
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
              {mainNavItems.map((item) => (
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

        {hasRole('admin') && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
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
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
