import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CalendarClock, UserPlus, X, Briefcase, TrendingUp, PiggyBank, Crown } from 'lucide-react';

// =====================================================================
// FinanceDispatchDelegationCard
//
// Visible only to users who hold the finance_dispatcher role
// (typically just Mohammed). Lets him pick a delegate from finance
// team members for a defined date range. During the active window,
// the delegate temporarily acts as the dispatcher — receives dispatch
// steps and can perform dispatches via the regular UI.
//
// Backed by delegate_assignments with scope='finance_dispatcher' +
// valid_from/valid_to columns added in commit 1's migration.
// The effective_finance_dispatcher() RPC honors these at runtime.
// =====================================================================

const FINANCE_REVIEWER_ROLES = [
  'finance_dispatcher',
  'ap_accountant',
  'ar_accountant',
  'budget_controller',
] as const;

type FinanceRole = typeof FINANCE_REVIEWER_ROLES[number];

const ROLE_META: Record<FinanceRole, { label: string; icon: any; cls: string }> = {
  finance_dispatcher: { label: 'Dispatcher', icon: Crown,      cls: 'border-amber-500/40 text-amber-700 bg-amber-500/5' },
  ap_accountant:      { label: 'AP',         icon: Briefcase,  cls: 'border-blue-500/40 text-blue-700 bg-blue-500/5' },
  ar_accountant:      { label: 'AR',         icon: TrendingUp, cls: 'border-emerald-500/40 text-emerald-700 bg-emerald-500/5' },
  budget_controller:  { label: 'Budget',     icon: PiggyBank,  cls: 'border-violet-500/40 text-violet-700 bg-violet-500/5' },
};

export const FinanceDispatchDelegationCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [delegateUserId, setDelegateUserId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');

  // ---- Verify the current user has finance_dispatcher role -----------
  const { data: callerRoles = [] } = useQuery({
    queryKey: ['my-roles', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data || []).map((r) => r.role);
    },
  });

  const isDispatcher = callerRoles.includes('finance_dispatcher');

  // ---- Eligible delegates (other finance team members) ---------------
  const { data: candidates = [] } = useQuery({
    queryKey: ['finance-delegate-candidates', user?.id],
    enabled: !!user && isDispatcher,
    queryFn: async () => {
      const { data: roleRows, error: rolesErr } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', FINANCE_REVIEWER_ROLES as unknown as string[]);
      if (rolesErr) throw rolesErr;

      const userIds = [...new Set((roleRows || []).map((r) => r.user_id))]
        .filter((id) => id !== user!.id);
      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, job_title, is_active')
        .in('user_id', userIds)
        .eq('is_active', true);
      if (profilesErr) throw profilesErr;

      const rolesByUser = new Map<string, FinanceRole[]>();
      for (const r of roleRows || []) {
        const arr = rolesByUser.get(r.user_id) || [];
        arr.push(r.role as FinanceRole);
        rolesByUser.set(r.user_id, arr);
      }

      return (profiles || [])
        .map((p) => ({
          ...p,
          roles: rolesByUser.get(p.user_id) || [],
        }))
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    },
  });

  // ---- Existing delegations for me as principal ----------------------
  const { data: existingDelegations = [] } = useQuery({
    queryKey: ['my-finance-delegations', user?.id],
    enabled: !!user && isDispatcher,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delegate_assignments')
        .select('*')
        .eq('principal_user_id', user!.id)
        .eq('scope', 'finance_dispatcher')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const delegateProfilesMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of candidates) m.set(c.user_id, c);
    return m;
  }, [candidates]);

  // ---- Save mutation -------------------------------------------------
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      if (!delegateUserId) throw new Error('Pick a delegate');
      if (!validFrom || !validTo) throw new Error('Both From and To dates are required');

      const fromDate = new Date(validFrom);
      const toDate = new Date(validTo);
      if (toDate < fromDate) throw new Error('To date must be on or after From date');

      // Use end-of-day for valid_to so the delegation covers the whole final day
      const validToEod = new Date(toDate);
      validToEod.setHours(23, 59, 59, 999);

      const { error } = await supabase.from('delegate_assignments').insert({
        delegate_user_id: delegateUserId,
        principal_user_id: user.id,
        assigned_by_user_id: user.id,
        scope: 'finance_dispatcher',
        valid_from: fromDate.toISOString(),
        valid_to: validToEod.toISOString(),
        is_active: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-finance-delegations', user?.id] });
      toast({
        title: 'Delegation created',
        description: 'Dispatch steps will route to your delegate during the chosen window.',
      });
      setDelegateUserId('');
      setValidFrom('');
      setValidTo('');
    },
    onError: (e: Error) => {
      toast({ title: 'Could not create delegation', description: e.message, variant: 'destructive' });
    },
  });

  // ---- Revoke mutation -----------------------------------------------
  const revokeMutation = useMutation({
    mutationFn: async (delegationId: string) => {
      const { error } = await supabase
        .from('delegate_assignments')
        .update({ is_active: false, revoked_at: new Date().toISOString() } as any)
        .eq('id', delegationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-finance-delegations', user?.id] });
      toast({ title: 'Delegation revoked' });
    },
    onError: (e: Error) => {
      toast({ title: 'Could not revoke delegation', description: e.message, variant: 'destructive' });
    },
  });

  // Hide the entire card if the user isn't a finance dispatcher.
  if (!isDispatcher) return null;

  // ---- Render --------------------------------------------------------
  const now = new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-accent" />
          Finance Dispatch Delegation
        </CardTitle>
        <CardDescription>
          Pick another finance team member to act as dispatcher during your absence. The delegation is automatically active during the chosen window — outside it, dispatch steps return to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Existing delegations */}
        {existingDelegations.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Active and recent delegations
            </Label>
            <div className="space-y-1.5">
              {existingDelegations.map((d: any) => {
                const delegate = delegateProfilesMap.get(d.delegate_user_id);
                const fromTs = d.valid_from ? new Date(d.valid_from) : null;
                const toTs = d.valid_to ? new Date(d.valid_to) : null;
                const isActive = d.is_active && !d.revoked_at && (!fromTs || fromTs <= now) && (!toTs || toTs >= now);
                const isFuture = d.is_active && !d.revoked_at && fromTs && fromTs > now;
                const isRevoked = !d.is_active || !!d.revoked_at;
                const isPast = !!toTs && toTs < now && !isRevoked;

                let statusLabel = 'Past';
                let statusCls = 'border-muted text-muted-foreground';
                if (isActive) { statusLabel = 'Active now'; statusCls = 'border-emerald-500/40 text-emerald-700 bg-emerald-500/5'; }
                else if (isFuture) { statusLabel = 'Scheduled'; statusCls = 'border-blue-500/40 text-blue-700 bg-blue-500/5'; }
                else if (isRevoked) { statusLabel = 'Revoked'; statusCls = 'border-red-500/40 text-red-700 bg-red-500/5'; }

                return (
                  <div key={d.id} className="flex items-start gap-3 p-2.5 rounded-md border bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {delegate?.full_name || 'Unknown user'}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${statusCls}`}>
                          {statusLabel}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {fromTs ? format(fromTs, 'dd MMM yyyy') : '—'}
                        <span className="mx-1.5">→</span>
                        {toTs ? format(toTs, 'dd MMM yyyy') : 'open-ended'}
                      </div>
                    </div>
                    {(isActive || isFuture) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revokeMutation.mutate(d.id)}
                        title="Revoke this delegation"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create new */}
        <div className="space-y-3 pt-2 border-t">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Create a new delegation
          </Label>

          <div className="space-y-1.5">
            <Label htmlFor="delegate">Delegate</Label>
            <Select value={delegateUserId} onValueChange={setDelegateUserId}>
              <SelectTrigger id="delegate">
                <SelectValue placeholder="Pick a finance team member…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No other finance team members found.
                  </div>
                )}
                {candidates.map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    <div className="flex items-center gap-2">
                      <span>{c.full_name}</span>
                      {(c.roles as FinanceRole[]).map((r) => {
                        const meta = ROLE_META[r];
                        if (!meta) return null;
                        const Icon = meta.icon;
                        return (
                          <Badge key={r} variant="outline" className={`text-[9px] gap-0.5 px-1 py-0 ${meta.cls}`}>
                            <Icon className="h-2.5 w-2.5" />
                            {meta.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from">From (date)</Label>
              <Input
                id="from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To (date, inclusive)</Label>
              <Input
                id="to"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
          </div>

          <Button
            onClick={() => createMutation.mutate()}
            disabled={
              createMutation.isPending ||
              !delegateUserId ||
              !validFrom ||
              !validTo
            }
            variant="outline"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            {createMutation.isPending ? 'Saving…' : 'Create delegation'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Tip: the delegate sees nothing different in their normal queue until a memo arrives at a dispatch step during the active window — at which point it routes to them automatically. Outside the window, dispatch returns to you.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FinanceDispatchDelegationCard;
