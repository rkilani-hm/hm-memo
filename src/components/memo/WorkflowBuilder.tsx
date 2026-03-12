import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  AlertCircle,
  CheckCircle2,
  Users,
  Plus,
  Trash2,
  GripVertical,
  Save,
  Pen,
  Type,
  Eye,
  Bell,
  Link2,
  CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import type { MemoType } from '@/components/memo/TransmittedForGrid';

export type StepActionType = 'signature' | 'initial';

export interface WorkflowStepDef {
  approver_user_id: string;
  label: string;
  action_type: StepActionType;
  is_required: boolean;
  parallel_group: number | null;
  deadline: string | null;
}

interface WorkflowBuilderProps {
  departmentId: string | null;
  memoTypes: MemoType[];
  selectedTemplateId: string | null;
  onTemplateChange: (templateId: string | null) => void;
  customSteps: WorkflowStepDef[];
  onCustomStepsChange: (steps: WorkflowStepDef[]) => void;
  mode: 'preset' | 'dynamic';
  onModeChange: (mode: 'preset' | 'dynamic') => void;
}

const ACTION_TYPE_META: Record<StepActionType, { label: string; icon: React.ReactNode; desc: string }> = {
  signature: { label: 'Approve', icon: <Pen className="h-3.5 w-3.5" />, desc: 'Full approval with signature image' },
  initial: { label: 'Initial', icon: <Type className="h-3.5 w-3.5" />, desc: 'Quick endorsement with initials stamp' },
};

const WorkflowBuilder = ({
  departmentId,
  memoTypes,
  selectedTemplateId,
  onTemplateChange,
  customSteps,
  onCustomStepsChange,
  mode,
  onModeChange,
}: WorkflowBuilderProps) => {
  const { user } = useAuth();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['workflow_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workflow_templates').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, full_name, job_title, department_id');
      if (error) throw error;
      return data;
    },
  });

  // Auto-match logic
  let autoMatchedTemplate: any = null;
  let matchType = '';

  if (departmentId && memoTypes.length > 0) {
    autoMatchedTemplate = templates.find((t) => t.department_id === departmentId && t.memo_type === memoTypes[0]);
    if (autoMatchedTemplate) matchType = 'Auto: Department + Memo Type';
  }
  if (!autoMatchedTemplate && departmentId) {
    autoMatchedTemplate = templates.find((t) => t.department_id === departmentId && t.is_default);
    if (autoMatchedTemplate) matchType = 'Auto: Department default';
  }
  if (!autoMatchedTemplate) {
    autoMatchedTemplate = templates.find((t) => !t.department_id && t.is_default);
    if (autoMatchedTemplate) matchType = 'Auto: Global default';
  }

  const isManual = selectedTemplateId !== null;
  const activeTemplate = isManual
    ? templates.find((t) => t.id === selectedTemplateId) || null
    : autoMatchedTemplate;

  const presetSteps: WorkflowStepDef[] = ((activeTemplate?.steps as any[]) || []).map((s) => ({
    approver_user_id: s.approver_user_id,
    label: s.label || '',
    action_type: s.action_type || 'signature',
    is_required: s.is_required !== false,
    parallel_group: s.parallel_group ?? null,
    deadline: s.deadline || null,
  }));

  // Helpers for dynamic mode
  const addStep = () => {
    onCustomStepsChange([
      ...customSteps,
      { approver_user_id: '', label: '', action_type: 'signature', is_required: true, parallel_group: null, deadline: null },
    ]);
  };

  const updateStep = (index: number, patch: Partial<WorkflowStepDef>) => {
    const updated = customSteps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onCustomStepsChange(updated);
  };

  const removeStep = (index: number) => {
    onCustomStepsChange(customSteps.filter((_, i) => i !== index));
  };

  const toggleParallel = (index: number) => {
    const step = customSteps[index];
    if (step.parallel_group !== null) {
      updateStep(index, { parallel_group: null });
    } else {
      // Find max group number and create new group with next step
      const maxGroup = Math.max(0, ...customSteps.map((s) => s.parallel_group || 0));
      const newGroup = maxGroup + 1;
      updateStep(index, { parallel_group: newGroup });
      // Also link next step if exists
      if (index + 1 < customSteps.length) {
        updateStep(index + 1, { parallel_group: newGroup });
      }
    }
  };

  // Validation
  const validationWarnings: string[] = [];
  const stepsToValidate = mode === 'preset' ? presetSteps : customSteps;
  if (stepsToValidate.length > 0) {
    const hasSignature = stepsToValidate.some((s) => s.action_type === 'signature');
    if (!hasSignature) validationWarnings.push('Every memo should have at least one Signature step.');

    if (memoTypes.includes('payments')) {
      // Check if any step has a finance user (we can't easily check dept here, but warn generically)
      validationWarnings.push('Payment memos: ensure a Finance department approver is included.');
    }

    if (mode === 'dynamic' && user) {
      const selfAdded = customSteps.some((s) => s.approver_user_id === user.id);
      if (selfAdded) validationWarnings.push('You cannot add yourself as an approver.');
    }
  }

  // Save as template
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim() || customSteps.length === 0) return;
    setSavingTemplate(true);
    try {
      const { error } = await supabase.from('workflow_templates').insert({
        name: templateName.trim(),
        department_id: departmentId,
        memo_type: memoTypes[0] || null,
        steps: customSteps as any,
        is_default: false,
      });
      if (error) throw error;
      await refetchTemplates();
      setSaveDialogOpen(false);
      setTemplateName('');
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTemplate(false);
    }
  };

  if (!departmentId) return null;

  return (
    <div className="rounded-md border border-input p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Approval Workflow
          </span>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'preset' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('preset')}
        >
          Preset Template
        </Button>
        <Button
          type="button"
          variant={mode === 'dynamic' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('dynamic')}
        >
          Dynamic Builder
        </Button>
      </div>

      {/* ── MODE A: Preset ── */}
      {mode === 'preset' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {isManual ? 'Manually selected' : 'Auto-matched'} — or choose manually:
            </Label>
            <Select
              value={selectedTemplateId || 'auto'}
              onValueChange={(val) => onTemplateChange(val === 'auto' ? null : val)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Auto-detect workflow..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Auto-detect{autoMatchedTemplate ? ` (${autoMatchedTemplate.name})` : ''}
                </SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.memo_type ? ` — ${t.memo_type}` : ''}
                    {t.is_default ? ' ★' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!activeTemplate ? (
            <div className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">No workflow template found. Memo will be submitted without approval chain.</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{activeTemplate.name}</Badge>
                {!isManual && matchType && <span className="text-xs text-muted-foreground">({matchType})</span>}
              </div>
              {presetSteps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approval steps defined.</p>
              ) : (
                <div className="space-y-2">
                  {presetSteps.map((step, index) => {
                    const approver = profiles.find((p) => p.user_id === step.approver_user_id);
                    const meta = ACTION_TYPE_META[step.action_type];
                    return (
                      <div key={index} className="flex items-center gap-3 p-2 rounded-md bg-muted/30 border border-input">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{approver?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{step.label || approver?.job_title || 'Approver'}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                          {meta.icon}
                          {meta.label}
                        </Badge>
                        {step.parallel_group !== null && (
                          <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                            <Link2 className="h-3 w-3" />
                            Parallel
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── MODE B: Dynamic Builder ── */}
      {mode === 'dynamic' && (
        <div className="space-y-3">
          {customSteps.map((step, index) => {
            const meta = ACTION_TYPE_META[step.action_type];
            return (
              <div key={index} className="rounded-lg border border-input p-3 space-y-3 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-bold text-muted-foreground">Step {index + 1}</span>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStep(index)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>

                {/* Approver Select */}
                <div className="space-y-1">
                  <Label className="text-xs">Approver</Label>
                  <Select value={step.approver_user_id} onValueChange={(v) => updateStep(index, { approver_user_id: v })}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select person..." />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles
                        .filter((p) => p.user_id !== user?.id)
                        .map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>
                            {p.full_name} — {p.job_title || 'No title'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Type */}
                <div className="space-y-1">
                  <Label className="text-xs">Action Type</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                    {(Object.keys(ACTION_TYPE_META) as StepActionType[]).map((type) => {
                      const m = ACTION_TYPE_META[type];
                      const isSelected = step.action_type === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateStep(index, { action_type: type })}
                          className={`flex flex-col items-center gap-1 p-2 rounded-md border text-xs transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary font-medium'
                              : 'border-input text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          {m.icon}
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Label */}
                <div className="space-y-1">
                  <Label className="text-xs">Label (optional)</Label>
                  <Input
                    value={step.label}
                    onChange={(e) => updateStep(index, { label: e.target.value })}
                    placeholder="e.g. Finance Dept., CEO/Chairman"
                    className="h-8 text-sm"
                    maxLength={100}
                  />
                </div>

                {/* Row: Required + Parallel + Deadline */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={step.is_required}
                      onCheckedChange={(v) => updateStep(index, { is_required: v })}
                      id={`req-${index}`}
                    />
                    <Label htmlFor={`req-${index}`} className="text-xs cursor-pointer">Required</Label>
                  </div>

                  <Button
                    type="button"
                    variant={step.parallel_group !== null ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => toggleParallel(index)}
                  >
                    <Link2 className="h-3 w-3" />
                    {step.parallel_group !== null ? `Group ${step.parallel_group}` : 'Make Parallel'}
                  </Button>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {step.deadline ? format(new Date(step.deadline), 'dd/MM/yyyy') : 'Deadline'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={step.deadline ? new Date(step.deadline) : undefined}
                        onSelect={(date) => updateStep(index, { deadline: date?.toISOString() || null })}
                        disabled={(date) => date < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            );
          })}

          <Button type="button" variant="outline" className="w-full" onClick={addStep}>
            <Plus className="h-4 w-4 mr-2" />
            Add Step
          </Button>

          {/* Save as Template */}
          {customSteps.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setSaveDialogOpen(true)}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              Save as Template
            </Button>
          )}
        </div>
      )}

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <div className="space-y-1">
          {validationWarnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-amber-600 text-xs">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Save Template Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Workflow as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Template Name</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Finance Payment Approval"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              This template will be available in Preset mode for your department.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAsTemplate} disabled={savingTemplate || !templateName.trim()}>
              {savingTemplate ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkflowBuilder;
