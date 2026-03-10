import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { MemoType } from '@/components/memo/TransmittedForGrid';

interface WorkflowPreviewProps {
  departmentId: string | null;
  memoTypes: MemoType[];
  selectedTemplateId: string | null;
  onTemplateChange: (templateId: string | null) => void;
}

interface WorkflowStep {
  approver_user_id: string;
  label: string;
}

const WorkflowPreview = ({ departmentId, memoTypes, selectedTemplateId, onTemplateChange }: WorkflowPreviewProps) => {
  const { data: templates = [] } = useQuery({
    queryKey: ['workflow_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, job_title');
      if (error) throw error;
      return data;
    },
  });

  // Auto-match logic (same as submit-memo edge function)
  let autoMatchedTemplate = null;
  let matchType = '';

  if (departmentId && memoTypes.length > 0) {
    autoMatchedTemplate = templates.find(
      (t) => t.department_id === departmentId && t.memo_type === memoTypes[0]
    );
    if (autoMatchedTemplate) matchType = 'Auto: Department + Memo Type';
  }

  if (!autoMatchedTemplate && departmentId) {
    autoMatchedTemplate = templates.find(
      (t) => t.department_id === departmentId && t.is_default
    );
    if (autoMatchedTemplate) matchType = 'Auto: Department default';
  }

  if (!autoMatchedTemplate) {
    autoMatchedTemplate = templates.find(
      (t) => !t.department_id && t.is_default
    );
    if (autoMatchedTemplate) matchType = 'Auto: Global default';
  }

  // Determine active template: manual override or auto-matched
  const isManual = selectedTemplateId !== null;
  const activeTemplate = isManual
    ? templates.find((t) => t.id === selectedTemplateId) || null
    : autoMatchedTemplate;

  const steps: WorkflowStep[] = (activeTemplate?.steps as WorkflowStep[]) || [];

  if (!departmentId) return null;

  return (
    <div className="rounded-md border border-input p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Approval Workflow
          </span>
        </div>
        {isManual && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => onTemplateChange(null)}
          >
            Reset to auto
          </Button>
        )}
      </div>

      {/* Manual selector */}
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

      {/* Preview */}
      {!activeTemplate ? (
        <div className="flex items-center gap-2 text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">
            No workflow template found. Memo will be submitted without an approval chain.
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {activeTemplate.name}
            </Badge>
            {!isManual && matchType && (
              <span className="text-xs text-muted-foreground">({matchType})</span>
            )}
          </div>

          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approval steps defined in this template.</p>
          ) : (
            <div className="space-y-2">
              {steps.map((step, index) => {
                const approver = profiles.find((p) => p.user_id === step.approver_user_id);
                return (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {approver?.full_name || 'Unknown user'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.label || approver?.job_title || 'Approver'}
                      </p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground/30" />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WorkflowPreview;
