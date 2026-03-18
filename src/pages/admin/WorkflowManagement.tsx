import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, GitBranch, LayoutGrid } from 'lucide-react';
import { Constants } from '@/integrations/supabase/types';
import type { Tables } from '@/integrations/supabase/types';
import PdfLayoutEditor, { type PdfLayout, DEFAULT_PDF_LAYOUT } from '@/components/memo/PdfLayoutEditor';

type MemoType = Tables<'memos'>['memo_types'][number];
const MEMO_TYPES = Constants.public.Enums.memo_type as readonly string[];

interface WorkflowStep {
  approver_user_id: string;
  label: string;
  stage_level?: string;
  action_type?: string;
  parallel_group?: number | null;
}

const STAGE_LEVELS = ['L1', 'L2a', 'L2b', 'L3', 'L4'] as const;
const STAGE_LABELS: Record<string, string> = {
  L1: 'Department Manager',
  L2a: 'Finance Staff (dual-initials)',
  L2b: 'Finance Manager',
  L3: 'Senior Executive (GM/COO/CAO/CFO)',
  L4: 'CEO / Chairman (final)',
};
const ACTION_TYPES = ['signature', 'initial', 'review', 'acknowledge'] as const;

const WorkflowManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [memoType, setMemoType] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [pdfLayout, setPdfLayout] = useState<PdfLayout>(DEFAULT_PDF_LAYOUT);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workflow_templates').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        department_id: departmentId || null,
        memo_type: (memoType || null) as MemoType | null,
        is_default: isDefault,
        steps: steps as any,
        pdf_layout: pdfLayout as any,
      };
      if (editId) {
        const { error } = await supabase.from('workflow_templates').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('workflow_templates').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      toast({ title: editId ? 'Workflow updated' : 'Workflow created' });
      resetForm();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workflow_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
      toast({ title: 'Workflow deleted' });
    },
  });

  const resetForm = () => {
    setOpen(false);
    setEditId(null);
    setName('');
    setDepartmentId('');
    setMemoType('');
    setIsDefault(false);
    setSteps([]);
    setPdfLayout(DEFAULT_PDF_LAYOUT);
  };

  const openEdit = (wf: typeof workflows[0]) => {
    setEditId(wf.id);
    setName(wf.name);
    setDepartmentId(wf.department_id || '');
    setMemoType(wf.memo_type || '');
    setIsDefault(wf.is_default || false);
    setSteps(Array.isArray(wf.steps) ? (wf.steps as unknown as WorkflowStep[]) : []);
    setOpen(true);
  };

  const addStep = () => setSteps([...steps, { approver_user_id: '', label: '', stage_level: '', action_type: 'signature', parallel_group: null }]);

  const updateStep = (idx: number, field: keyof WorkflowStep, value: string) => {
    const updated = [...steps];
    if (field === 'parallel_group') {
      updated[idx] = { ...updated[idx], parallel_group: value ? parseInt(value) : null };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    if (field === 'approver_user_id') {
      const prof = profiles.find(p => p.user_id === value);
      if (prof && !updated[idx].label) updated[idx].label = prof.full_name;
    }
    setSteps(updated);
  };

  const removeStep = (idx: number) => setSteps(steps.filter((_, i) => i !== idx));

  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    const updated = [...steps];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setSteps(updated);
  };

  const getProfileName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name || userId;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Approval Workflows</h1>
          <p className="text-muted-foreground text-sm">Define approval chains for memo routing</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Workflow</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? 'Edit' : 'New'} Workflow</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Workflow Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Approval" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Department (optional)</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger><SelectValue placeholder="Any department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Memo Type (optional)</Label>
                  <Select value={memoType} onValueChange={setMemoType}>
                    <SelectTrigger><SelectValue placeholder="Any type" /></SelectTrigger>
                    <SelectContent>
                      {MEMO_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                <Label>Set as default workflow</Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Approval Steps</Label>
                  <Button variant="outline" size="sm" onClick={addStep}>
                    <Plus className="h-3 w-3 mr-1" />Add Step
                  </Button>
                </div>
                {steps.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                    No steps added yet. Click "Add Step" to define the approval chain.
                  </p>
                )}
                {steps.map((step, idx) => (
                  <div key={idx} className="p-3 bg-secondary/50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-6 shrink-0">#{idx + 1}</span>
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <Select value={step.approver_user_id} onValueChange={(v) => updateStep(idx, 'approver_user_id', v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Approver" /></SelectTrigger>
                          <SelectContent>
                            {profiles.map((p) => (
                              <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={step.label}
                          onChange={(e) => updateStep(idx, 'label', e.target.value)}
                          placeholder="Step label"
                          className="h-9"
                        />
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStep(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 ml-8">
                      <Select value={step.stage_level || ''} onValueChange={(v) => updateStep(idx, 'stage_level', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Stage level" /></SelectTrigger>
                        <SelectContent>
                          {STAGE_LEVELS.map((sl) => (
                            <SelectItem key={sl} value={sl} className="text-xs">
                              <span className="font-medium">{sl}</span>
                              <span className="text-muted-foreground ml-1">— {STAGE_LABELS[sl]}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={step.action_type || 'signature'} onValueChange={(v) => updateStep(idx, 'action_type', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Action type" /></SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map((at) => (
                            <SelectItem key={at} value={at} className="text-xs capitalize">{at}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={step.parallel_group ?? ''}
                        onChange={(e) => updateStep(idx, 'parallel_group', e.target.value)}
                        placeholder="Parallel group"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save Workflow'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Memo Type</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : workflows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No workflows yet</TableCell></TableRow>
              ) : workflows.map((wf) => {
                const wfSteps = Array.isArray(wf.steps) ? (wf.steps as unknown as WorkflowStep[]) : [];
                return (
                  <TableRow key={wf.id}>
                    <TableCell className="font-medium">{wf.name}</TableCell>
                    <TableCell>{departments.find(d => d.id === wf.department_id)?.name || 'Any'}</TableCell>
                    <TableCell className="capitalize">{wf.memo_type?.replace('_', ' ') || 'Any'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{wfSteps.length} step{wfSteps.length !== 1 ? 's' : ''}</span>
                      </div>
                    </TableCell>
                    <TableCell>{wf.is_default ? <Badge variant="default">Default</Badge> : '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(wf)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(wf.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkflowManagement;
