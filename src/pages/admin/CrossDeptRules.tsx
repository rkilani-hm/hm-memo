import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchDepartments } from '@/lib/memo-api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Constants, type Database } from '@/integrations/supabase/types';

type MemoType = Database['public']['Enums']['memo_type'];

const MEMO_TYPES = Constants.public.Enums.memo_type;

interface RuleForm {
  name: string;
  viewer_department_id: string;
  source_department_ids: string[];
  memo_type_filter: Database['public']['Enums']['memo_type'][];
  access_level: string;
  scope: string;
}

const emptyForm: RuleForm = {
  name: '',
  viewer_department_id: '',
  source_department_ids: [],
  memo_type_filter: [],
  access_level: 'view_only',
  scope: 'all_users',
};

const CrossDeptRules = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['cross-dept-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cross_department_rules')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  });

  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name || id;
  const getDeptCode = (id: string) => departments.find(d => d.id === id)?.code || '?';

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.viewer_department_id) throw new Error('Name and viewer department required');

      const payload = {
        name: form.name,
        viewer_department_id: form.viewer_department_id,
        source_department_ids: form.source_department_ids,
        memo_type_filter: form.memo_type_filter,
        access_level: form.access_level,
        scope: form.scope,
      };

      if (editingId) {
        const { error } = await supabase
          .from('cross_department_rules')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cross_department_rules')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross-dept-rules'] });
      toast({ title: editingId ? 'Rule Updated' : 'Rule Created' });
      closeDialog();
    },
    onError: (e: Error) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('cross_department_rules')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cross-dept-rules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cross_department_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross-dept-rules'] });
      toast({ title: 'Rule Deleted' });
    },
  });

  const openEdit = (rule: any) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      viewer_department_id: rule.viewer_department_id,
      source_department_ids: rule.source_department_ids || [],
      memo_type_filter: rule.memo_type_filter || [],
      access_level: rule.access_level,
      scope: rule.scope,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const toggleMemoType = (type: string) => {
    setForm(prev => ({
      ...prev,
      memo_type_filter: prev.memo_type_filter.includes(type)
        ? prev.memo_type_filter.filter(t => t !== type)
        : [...prev.memo_type_filter, type],
    }));
  };

  const toggleSourceDept = (deptId: string) => {
    setForm(prev => ({
      ...prev,
      source_department_ids: prev.source_department_ids.includes(deptId)
        ? prev.source_department_ids.filter(d => d !== deptId)
        : [...prev.source_department_ids, deptId],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cross-Department Permission Rules</h1>
          <p className="text-sm text-muted-foreground">Configure which departments can view memos from other departments</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading rules...</div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No cross-department rules configured.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule Name</TableHead>
                  <TableHead>Viewer Dept</TableHead>
                  <TableHead>Source Depts</TableHead>
                  <TableHead>Memo Types</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule: any) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getDeptCode(rule.viewer_department_id)}</Badge>
                    </TableCell>
                    <TableCell>
                      {rule.source_department_ids?.length > 0
                        ? rule.source_department_ids.map((id: string) => (
                            <Badge key={id} variant="secondary" className="mr-1 text-xs">{getDeptCode(id)}</Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">All Depts</span>
                      }
                    </TableCell>
                    <TableCell>
                      {rule.memo_type_filter?.length > 0
                        ? rule.memo_type_filter.map((t: string) => (
                            <Badge key={t} variant="secondary" className="mr-1 text-xs capitalize">{t.replace('_', ' ')}</Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">All Types</span>
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.access_level === 'view_audit' ? 'default' : 'outline'} className="text-xs">
                        {rule.access_level === 'view_audit' ? '👁 + 📜' : '👁 View'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{rule.scope === 'dept_head_only' ? '👤 Head Only' : '👥 All Users'}</span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(rule.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {editingId ? 'Edit Rule' : 'Create Rule'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Rule Name</Label>
              <Input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Finance sees Payment memos" />
            </div>

            <div className="space-y-1">
              <Label>Viewer Department</Label>
              <Select value={form.viewer_department_id} onValueChange={v => setForm(prev => ({ ...prev, viewer_department_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Source Departments <span className="text-xs text-muted-foreground">(empty = all)</span></Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {departments.map(d => (
                  <label key={d.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.source_department_ids.includes(d.id)}
                      onCheckedChange={() => toggleSourceDept(d.id)}
                    />
                    {d.code}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Memo Type Filter <span className="text-xs text-muted-foreground">(empty = all)</span></Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {MEMO_TYPES.map(t => (
                  <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer capitalize">
                    <Checkbox
                      checked={form.memo_type_filter.includes(t)}
                      onCheckedChange={() => toggleMemoType(t)}
                    />
                    {t.replace('_', ' ')}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Access Level</Label>
                <Select value={form.access_level} onValueChange={v => setForm(prev => ({ ...prev, access_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view_only">View Only</SelectItem>
                    <SelectItem value="view_audit">View + Audit Trail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Scope</Label>
                <Select value={form.scope} onValueChange={v => setForm(prev => ({ ...prev, scope: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_users">All Department Users</SelectItem>
                    <SelectItem value="dept_head_only">Department Head Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CrossDeptRules;
