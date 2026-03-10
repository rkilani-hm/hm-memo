import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles } from '@/lib/memo-api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { UserPlus, UserX, Users, Shield } from 'lucide-react';

const DelegateManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [delegateUserId, setDelegateUserId] = useState('');
  const [principalUserId, setPrincipalUserId] = useState('');

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['delegate-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delegate_assignments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('delegate_assignments').insert({
        delegate_user_id: delegateUserId,
        principal_user_id: principalUserId,
        assigned_by_user_id: user.id,
      });
      if (error) throw error;

      // Audit log
      const delegateProfile = profiles.find(p => p.user_id === delegateUserId);
      const principalProfile = profiles.find(p => p.user_id === principalUserId);
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'delegate_assigned',
        details: {
          delegate_name: delegateProfile?.full_name,
          principal_name: principalProfile?.full_name,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegate-assignments'] });
      toast({ title: 'Delegate assigned successfully' });
      setDialogOpen(false);
      setDelegateUserId('');
      setPrincipalUserId('');
    },
    onError: (e: Error) => {
      const msg = e.message.includes('duplicate') ? 'This delegate assignment already exists.' : e.message;
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('delegate_assignments')
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq('id', assignmentId);
      if (error) throw error;

      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'delegate_removed',
        details: { assignment_id: assignmentId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegate-assignments'] });
      toast({ title: 'Delegate assignment revoked' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-accent" />
            Delegate Management
          </h1>
          <p className="text-muted-foreground text-sm">
            Assign secretaries/office managers as delegates who can register manual (paper) signatures on behalf of approvers
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Assign Delegate
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Active Assignments ({assignments.filter(a => a.is_active).length})
          </CardTitle>
          <CardDescription>
            Each delegate can register that their principal signed a physical printed memo
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delegate (Secretary)</TableHead>
                <TableHead>Acts on behalf of (Principal)</TableHead>
                <TableHead>Assigned By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : assignments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No delegate assignments yet</TableCell></TableRow>
              ) : assignments.map((a) => {
                const delegate = getProfile(a.delegate_user_id);
                const principal = getProfile(a.principal_user_id);
                const assignedBy = getProfile(a.assigned_by_user_id);
                return (
                  <TableRow key={a.id} className={!a.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{delegate?.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{delegate?.job_title || ''}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{principal?.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{principal?.job_title || ''}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{assignedBy?.full_name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={a.is_active ? 'default' : 'outline'} className="text-xs">
                        {a.is_active ? 'Active' : 'Revoked'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {a.is_active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => revokeMutation.mutate(a.id)}
                          title="Revoke assignment"
                        >
                          <UserX className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Assignment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Delegate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Delegate (Secretary / Office Manager)</Label>
              <Select value={delegateUserId} onValueChange={setDelegateUserId}>
                <SelectTrigger><SelectValue placeholder="Select delegate..." /></SelectTrigger>
                <SelectContent>
                  {profiles
                    .filter(p => p.user_id !== principalUserId)
                    .map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name} — {p.job_title || 'No title'}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Principal (Approver they serve)</Label>
              <Select value={principalUserId} onValueChange={setPrincipalUserId}>
                <SelectTrigger><SelectValue placeholder="Select principal..." /></SelectTrigger>
                <SelectContent>
                  {profiles
                    .filter(p => p.user_id !== delegateUserId)
                    .map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name} — {p.job_title || 'No title'}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              The delegate will be able to view memos pending for this principal and register manual (paper) signatures on their behalf.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!delegateUserId || !principalUserId || createMutation.isPending}
            >
              {createMutation.isPending ? 'Assigning...' : 'Assign Delegate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DelegateManagement;
