import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldOff, ArrowLeft, Home } from 'lucide-react';

const NoAccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state || {}) as { from?: string; reason?: string };

  const reasonLabel =
    state.reason === 'role'
      ? 'This page is restricted to a specific role.'
      : 'You do not have permission to view this page.';

  return (
    <div className="max-w-2xl mx-auto py-16">
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30">
            <ShieldOff className="h-7 w-7 text-amber-600" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">Access Restricted</h1>
            <p className="text-sm text-muted-foreground">{reasonLabel}</p>
            {state.from && (
              <p className="text-xs text-muted-foreground/80">
                Attempted route: <code className="font-mono">{state.from}</code>
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            If you believe this is incorrect, please ask an administrator to grant you access in
            <strong> Admin → Authorization</strong>. You may need to sign out and back in for
            permission changes to take effect.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Go back
            </Button>
            <Button size="sm" onClick={() => navigate('/')}>
              <Home className="h-3.5 w-3.5 mr-1.5" />
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NoAccess;
