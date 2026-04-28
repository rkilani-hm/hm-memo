import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Send,
  UserCheck,
  Briefcase,
  TrendingUp,
  PiggyBank,
  Crown,
} from 'lucide-react';

// =====================================================================
// DispatchDialog
//
// Used by Mohammed (or his active delegate) to pick reviewers for a
// memo that has reached a dispatch step. Posts to the dispatch-step
// edge function, which atomically marks the dispatch step approved
// and spawns reviewer steps in parallel.
//
// Rules enforced in the UI (the edge function re-validates):
//   - Reviewer picker shows ONLY finance team members
//     (anyone with finance_dispatcher | ap_accountant |
//      ar_accountant | budget_controller).
//   - At least one reviewer must be picked.
//   - Mohammed can include himself as a reviewer ("Include myself").
//   - Notes are optional.
//
// Visual hint by route_tag (AP / AR / Budget): each reviewer's role
// badges are shown so Mohammed sees what kind of staff each one is.
// He's free to pick any combination — the route_tag just suggests.
// =====================================================================

const FINANCE_REVIEWER_ROLES = [
  'finance_dispatcher',
  'ap_accountant',
  'ar_accountant',
  'budget_controller',
] as const;

type FinanceRole = typeof FINANCE_REVIEWER_ROLES[number];

interface FinanceMember {
  user_id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  is_active: boolean;
  roles: FinanceRole[];
}

interface DispatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memoId: string;
  stepId: string;
  routeTag?: 'AP' | 'AR' | 'Budget' | string | null;
  onDispatched: () => void;
}

const ROLE_META: Record<FinanceRole, { label: string; icon: any; cls: string }> = {
  finance_dispatcher: { label: 'Dispatcher',     icon: Crown,        cls: 'border-amber-500/40 text-amber-700 bg-amber-500/5' },
  ap_accountant:      { label: 'AP',             icon: Briefcase,    cls: 'border-blue-500/40 text-blue-700 bg-blue-500/5' },
  ar_accountant:      { label: 'AR',             icon: TrendingUp,   cls: 'border-emerald-500/40 text-emerald-700 bg-emerald-500/5' },
  budget_controller:  { label: 'Budget',         icon: PiggyBank,    cls: 'border-violet-500/40 text-violet-700 bg-violet-500/5' },
};

export const DispatchDialog: React.FC<DispatchDialogProps> = ({
  open,
  onOpenChange,
  memoId,
  stepId,
  routeTag,
  onDispatched,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeSelf, setIncludeSelf] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ---- Fetch finance team members ---------------------------------------
  // We need: profiles joined with user_roles, filtered to anyone with at
  // least one finance reviewer role. We do two simple queries (one for
  // profiles, one for roles) and join client-side; the team is small so
  // this is cheap.
  const { data: members = [], isLoading: loadingMembers } = useQuery<FinanceMember[]>({
    queryKey: ['finance-reviewer-pool', open],
    enabled: open,
    queryFn: async () => {
      // Step 1: roles
      const { data: roleRows, error: rolesErr } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', FINANCE_REVIEWER_ROLES as readonly any[] as any);
      if (rolesErr) throw rolesErr;
      const userIds = [...new Set((roleRows || []).map((r) => r.user_id))];
      if (userIds.length === 0) return [];

      // Step 2: profiles for those users
      const { data: profileRows, error: profilesErr } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, job_title, is_active')
        .in('user_id', userIds)
        .eq('is_active', true);
      if (profilesErr) throw profilesErr;

      // Roll up roles per user
      const rolesByUser = new Map<string, FinanceRole[]>();
      for (const r of roleRows || []) {
        const arr = rolesByUser.get(r.user_id) || [];
        arr.push(r.role as FinanceRole);
        rolesByUser.set(r.user_id, arr);
      }

      return (profileRows || [])
        .map((p) => ({
          user_id: p.user_id,
          full_name: p.full_name || p.email || 'Unknown',
          email: p.email || '',
          job_title: p.job_title,
          is_active: p.is_active,
          roles: rolesByUser.get(p.user_id) || [],
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  // ---- Effective selected user IDs (incl. self if toggled) -------------
  const effectiveSelected = useMemo(() => {
    const s = new Set(selectedIds);
    if (includeSelf && user) s.add(user.id);
    return s;
  }, [selectedIds, includeSelf, user]);

  const canSubmit = !submitting && effectiveSelected.size > 0;

  // ---- Toggle a user in the selection ----------------------------------
  const toggleUser = (uid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // ---- Submit to the edge function -------------------------------------
  const handleDispatch = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const reviewerIds = [...effectiveSelected];
      const { data, error } = await supabase.functions.invoke('dispatch-step', {
        body: {
          step_id: stepId,
          reviewer_user_ids: reviewerIds,
          notes: notes.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error || 'Dispatch failed');
      }

      toast({
        title: 'Memo dispatched',
        description: `Sent to ${reviewerIds.length} reviewer${reviewerIds.length === 1 ? '' : 's'}. They will be notified shortly.`,
      });
      setSelectedIds(new Set());
      setIncludeSelf(false);
      setNotes('');
      onOpenChange(false);
      onDispatched();
    } catch (e: any) {
      toast({
        title: 'Dispatch failed',
        description: e?.message || 'Could not dispatch this memo.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render ----------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Dispatch Reviewers
            {routeTag && (
              <Badge variant="outline" className="text-[10px] ml-1">
                Route: {routeTag}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Pick the finance team member(s) who should initial this memo. Reviewers will work in parallel — each will get this memo in their queue independently. The memo advances to your sign-off step automatically once all picks complete.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadingMembers ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading finance team…
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm">
              <p className="font-medium text-amber-700">No finance reviewers available.</p>
              <p className="text-xs text-amber-700/80 mt-1">
                No active users hold a finance reviewer role. Ask an admin to assign roles via Admin → User Management.
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Reviewers
                </Label>
                <ScrollArea className="h-[260px] mt-2 pr-2 border rounded-md">
                  <div className="p-1.5 space-y-1">
                    {members
                      .filter((m) => m.user_id !== user?.id) // don't show self in the list — use the toggle
                      .map((m) => {
                        const checked = selectedIds.has(m.user_id);
                        return (
                          <label
                            key={m.user_id}
                            className={`flex items-start gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${
                              checked ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/40'
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleUser(m.user_id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium truncate">{m.full_name}</span>
                                {m.roles.map((r) => {
                                  const meta = ROLE_META[r];
                                  if (!meta) return null;
                                  const Icon = meta.icon;
                                  return (
                                    <Badge
                                      key={r}
                                      variant="outline"
                                      className={`text-[9px] gap-0.5 px-1 py-0 ${meta.cls}`}
                                    >
                                      <Icon className="h-2.5 w-2.5" />
                                      {meta.label}
                                    </Badge>
                                  );
                                })}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {m.job_title || m.email}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    {members.filter((m) => m.user_id !== user?.id).length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">
                        No other finance team members. You can still dispatch to yourself using the toggle below.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Include myself toggle */}
              <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30 transition-colors">
                <Checkbox
                  checked={includeSelf}
                  onCheckedChange={(c) => setIncludeSelf(!!c)}
                />
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Include myself as a reviewer</div>
                  <div className="text-[11px] text-muted-foreground">
                    You'll get an initial step on this memo in addition to your final sign-off.
                  </div>
                </div>
              </label>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="dispatch-notes">Notes (optional)</Label>
                <Textarea
                  id="dispatch-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Sara — please confirm the vendor matches PO 2026-0142."
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleDispatch} disabled={!canSubmit}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            <Send className="h-4 w-4 mr-1.5" />
            Dispatch{effectiveSelected.size > 0 ? ` to ${effectiveSelected.size}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DispatchDialog;
