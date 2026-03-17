import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';

interface GeoGateProps {
  children: React.ReactNode;
}

const GeoGate = ({ children }: GeoGateProps) => {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'blocked'>('checking');

  useEffect(() => {
    let cancelled = false;

    const checkGeo = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('geo-check');

        if (cancelled) return;

        if (error || !data) {
          // Fail-open if edge function is unreachable
          setStatus('allowed');
          return;
        }

        setStatus(data.allowed ? 'allowed' : 'blocked');
      } catch {
        // Fail-open on network errors
        if (!cancelled) setStatus('allowed');
      }
    };

    checkGeo();
    return () => { cancelled = true; };
  }, []);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/20 animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (status === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardContent className="pt-8 text-center space-y-4">
            <ShieldAlert className="h-14 w-14 mx-auto text-destructive" />
            <h2 className="text-xl font-bold text-foreground">Access Restricted</h2>
            <p className="text-muted-foreground text-sm">
              This application is only accessible from Kuwait. If you believe this is an error, please contact your system administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default GeoGate;
