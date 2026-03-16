import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-info/10 text-info',
  in_review: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  rework: 'bg-accent/10 text-accent',
};

const Dashboard = () => {
  const { user, profile, hasRole } = useAuth();
  const navigate = useNavigate();

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  // My memos with full info for recent activity
  const { data: myMemos = [] } = useQuery({
    queryKey: ['my-memos-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memos')
        .select('id, status, created_at, transmittal_no, subject')
        .eq('from_user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // All approval steps for my memos (to find pending approvers)
  const memoIds = myMemos.map(m => m.id);
  const { data: myMemoApprovalSteps = [] } = useQuery({
    queryKey: ['my-memo-approval-steps', memoIds],
    queryFn: async () => {
      if (memoIds.length === 0) return [];
      const { data, error } = await supabase
        .from('approval_steps')
        .select('memo_id, approver_user_id, status, step_order, parallel_group')
        .in('memo_id', memoIds)
        .order('step_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: memoIds.length > 0,
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

  // Build pending approver map for my memos
  const pendingApproverMap = useMemo(() => {
    const map: Record<string, string> = {};
    const grouped: Record<string, typeof myMemoApprovalSteps> = {};
    for (const s of myMemoApprovalSteps) {
      if (!grouped[s.memo_id]) grouped[s.memo_id] = [];
      grouped[s.memo_id].push(s);
    }
    for (const [memoId, steps] of Object.entries(grouped)) {
      const pending = steps.filter(s => s.status === 'pending');
      if (pending.length === 0) continue;
      const first = pending.reduce((a, b) => a.step_order < b.step_order ? a : b);
      const active = first.parallel_group != null
        ? pending.filter(s => s.parallel_group === first.parallel_group)
        : [first];
      const names = active.map(s => {
        const p = profiles.find(pr => pr.user_id === s.approver_user_id);
        return p?.full_name || 'Unknown';
      });
      map[memoId] = names.join(', ');
    }
    return map;
  }, [myMemoApprovalSteps, profiles]);

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

      {/* My Memos - Recent Activity with Status & Waiting For */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My Recent Memos</CardTitle>
        </CardHeader>
        <CardContent>
          {myMemos.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recent activity. Create your first memo to get started.</p>
          ) : (
            <div className="space-y-2">
              {myMemos.slice(0, 8).map(m => {
                const pendingName = pendingApproverMap[m.id];
                const showWaiting = m.status !== 'draft' && m.status !== 'approved' && m.status !== 'rejected' && pendingName;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg cursor-pointer border border-transparent hover:border-border transition-colors"
                    onClick={() => navigate(`/memos/${m.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium text-foreground">{m.transmittal_no}</span>
                        <Badge className={`${statusColors[m.status] || ''} capitalize text-[10px] px-1.5 py-0 h-4`}>
                          {m.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-[350px] mt-0.5">{m.subject}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {showWaiting ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-[hsl(var(--warning))] shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate max-w-[140px]">{pendingName}</span>
                        </div>
                      ) : null}
                      <span className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'dd MMM')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
