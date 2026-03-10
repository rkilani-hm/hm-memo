import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const Dashboard = () => {
  const { user, profile, hasRole } = useAuth();
  const navigate = useNavigate();

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  // My memos stats
  const { data: myMemos = [] } = useQuery({
    queryKey: ['my-memos-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memos')
        .select('id, status, created_at')
        .eq('from_user_id', user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // My pending approval steps
  const { data: myPendingSteps = [] } = useQuery({
    queryKey: ['my-pending-steps', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_steps')
        .select('*, memos!inner(id, transmittal_no, subject, from_user_id, created_at)')
        .eq('approver_user_id', user!.id)
        .eq('status', 'pending');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Delegate assignments
  const { data: delegateAssignments = [] } = useQuery({
    queryKey: ['my-delegate-assignments-dashboard', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delegate_assignments')
        .select('*')
        .eq('delegate_user_id', user!.id)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Pending steps for my principals (delegate view)
  const principalIds = delegateAssignments.map(da => da.principal_user_id);
  const { data: principalPendingSteps = [] } = useQuery({
    queryKey: ['principal-pending-steps', principalIds],
    queryFn: async () => {
      if (principalIds.length === 0) return [];
      const { data, error } = await supabase
        .from('approval_steps')
        .select('*, memos!inner(id, transmittal_no, subject, from_user_id, created_at)')
        .in('approver_user_id', principalIds)
        .eq('status', 'pending');
      if (error) throw error;
      return data || [];
    },
    enabled: principalIds.length > 0,
  });

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);

  const now = new Date();
  const thisMonth = myMemos.filter(m => new Date(m.created_at).getMonth() === now.getMonth());
  const approved = thisMonth.filter(m => m.status === 'approved').length;
  const rejected = thisMonth.filter(m => m.status === 'rejected').length;

  // Group principal pending steps by principal
  const principalGroups = principalIds.reduce((acc, pid) => {
    const steps = principalPendingSteps.filter(s => s.approver_user_id === pid);
    if (steps.length > 0) {
      acc.push({ principalId: pid, steps });
    }
    return acc;
  }, [] as { principalId: string; steps: typeof principalPendingSteps }[]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-muted-foreground mt-1">Here's an overview of your memo activity</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Memos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{thisMonth.length}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-accent transition-colors" onClick={() => navigate('/approvals')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myPendingSteps.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting your action</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approved}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rejected}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Delegate Section */}
      {principalGroups.length > 0 && (
        <Card className="border-accent/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              Pending for My Principals
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Memos awaiting action from approvers you serve as delegate
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {principalGroups.map(({ principalId, steps }) => {
              const principal = getProfile(principalId);
              return (
                <div key={principalId}>
                  <p className="text-sm font-bold text-foreground mb-2">
                    {principal?.full_name || 'Unknown'} ({principal?.job_title || ''}) — {steps.length} pending
                  </p>
                  <div className="space-y-1 ml-4">
                    {steps.map((step: any) => {
                      const memo = step.memos;
                      const from = getProfile(memo?.from_user_id);
                      return (
                        <div
                          key={step.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border"
                          onClick={() => navigate(`/memos/${memo?.id}`)}
                        >
                          <div>
                            <p className="text-sm font-mono">{memo?.transmittal_no}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">{memo?.subject}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {step.action_type === 'signature' ? 'Signature Req' : step.action_type === 'initial' ? 'Initial Req' : step.action_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              from {from?.full_name?.split(' ')[0] || '—'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {myMemos.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recent activity. Create your first memo to get started.</p>
          ) : (
            <div className="space-y-2">
              {myMemos.slice(0, 5).map(m => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2 hover:bg-muted/50 rounded cursor-pointer"
                  onClick={() => navigate(`/memos/${m.id}`)}
                >
                  <span className="text-sm">Memo created</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize text-xs">{m.status}</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'dd MMM')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
