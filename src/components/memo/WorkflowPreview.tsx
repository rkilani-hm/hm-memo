import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Users } from 'lucide-react';
import type { MemoType } from '@/components/memo/TransmittedForGrid';

interface WorkflowPreviewProps {
  departmentId: string | null;
  memoTypes: MemoType[];
}

interface WorkflowStep {
  approver_user_id: string;
  label: string;
}

const WorkflowPreview = ({ departmentId, memoTypes }: WorkflowPreviewProps) => {
  // Fetch all workflow templates
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

  // Fetch profiles for approver names
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

  // Replicate the same matching logic as submit-memo edge function
  let matchedTemplate = null;
  let matchType = '';

  if (departmentId && memoTypes.length > 0) {
    matchedTemplate = templates.find(
      (t) => t.department_id === departmentId && t.memo_type === memoTypes[0]
    );
    if (matchedTemplate) matchType = 'Department + Memo Type match';
  }

  if (!matchedTemplate && departmentId) {
    matchedTemplate = templates.find(
      (t) => t.department_id === departmentId && t.is_default
    );
    if (matchedTemplate) matchType = 'Department default workflow';
  }

  if (!matchedTemplate) {
    matchedTemplate = templates.find(
      (t) => !t.department_id && t.is_default
    );
    if (matchedTemplate) matchType = 'Global default workflow';
  }

  const steps: WorkflowStep[] = (matchedTemplate?.steps as WorkflowStep[]) || [];

  if (!departmentId) return null;

  return (
    <div className="rounded-md border border-input p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Approval Workflow
        </span>
      </div>

      {!matchedTemplate ? (
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
              {matchedTemplate.name}
            </Badge>
            <span className="text-xs text-muted-foreground">({matchType})</span>
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
