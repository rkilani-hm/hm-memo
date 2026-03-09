import { useAuth } from '@/contexts/AuthContext';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const AppHeader = () => {
  const { profile, roles } = useAuth();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">
          Internal Memo System
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
          {roles.map(role => (
            <Badge key={role} variant="secondary" className="text-xs capitalize">
              {role.replace('_', ' ')}
            </Badge>
          ))}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
