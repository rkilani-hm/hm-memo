import { CheckCircle2, Clock, XCircle, RotateCcw, Pen, Type, Eye, Bell, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';

type StepActionType = 'signature' | 'initial' | 'review' | 'acknowledge';

interface ApprovalStep {
  id: string;
  approver_user_id: string;
  status: string;
  step_order: number;
  action_type: StepActionType;
  signed_at: string | null;
  signing_method?: string | null;
  parallel_group?: number | null;
}

interface Profile {
  user_id: string;
  full_name: string;
  job_title: string | null;
}

interface WorkflowTrackerProps {
  steps: ApprovalStep[];
  profiles: Profile[];
  memoStatus: string;
  currentStep: number | null;
}

const stepActionIcons: Record<StepActionType, React.ReactNode> = {
  signature: <Pen className="h-3 w-3" />,
  initial: <Type className="h-3 w-3" />,
  review: <Eye className="h-3 w-3" />,
  acknowledge: <Bell className="h-3 w-3" />,
};

const stepActionLabels: Record<StepActionType, string> = {
  signature: 'Signature',
  initial: 'Initial',
  review: 'Review',
  acknowledge: 'Acknowledge',
};

const WorkflowTracker = ({ steps, profiles, memoStatus, currentStep }: WorkflowTrackerProps) => {
  if (steps.length === 0) return null;

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);
  const completedSteps = steps.filter(s => s.status === 'approved' || s.status === 'skipped').length;
  const progressPercent = (completedSteps / steps.length) * 100;

  const isTerminal = memoStatus === 'rejected' || memoStatus === 'approved';

  return (
    <div className="no-print max-w-4xl mx-auto mt-6">
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Approval Workflow Progress
          </h3>
          <Badge
            variant="outline"
            className={
              memoStatus === 'approved' ? 'border-[hsl(var(--success))] text-[hsl(var(--success))]' :
              memoStatus === 'rejected' ? 'border-destructive text-destructive' :
              memoStatus === 'rework' ? 'border-accent text-accent' :
              'border-muted-foreground text-muted-foreground'
            }
          >
            {completedSteps}/{steps.length} completed
          </Badge>
        </div>

        {/* Progress bar */}
        <Progress value={progressPercent} className="h-2 mb-5" />

        {/* Steps timeline */}
        <div className="space-y-0">
          {steps.map((step, index) => {
            const approver = getProfile(step.approver_user_id);
            const isCurrent = !isTerminal && step.status === 'pending' && 
              (currentStep === step.step_order || 
               (index === 0 && steps.every(s => s.step_order >= step.step_order)));
            const isFirst = index === 0;
            const isLast = index === steps.length - 1;
            const sat = (step as any).action_type || 'signature';

            // Determine if this is the active pending step
            const firstPending = steps.find(s => s.status === 'pending');
            const isActivePending = !isTerminal && step.status === 'pending' && firstPending?.id === step.id;

            return (
              <div key={step.id} className="flex gap-3">
                {/* Vertical line + circle */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      step.status === 'approved' ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' :
                      step.status === 'rejected' ? 'bg-destructive/15 text-destructive' :
                      step.status === 'rework' ? 'bg-accent/15 text-accent' :
                      isActivePending ? 'bg-primary/15 text-primary ring-2 ring-primary/30 animate-pulse' :
                      'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step.status === 'approved' ? <CheckCircle2 className="h-4 w-4" /> :
                     step.status === 'rejected' ? <XCircle className="h-4 w-4" /> :
                     step.status === 'rework' ? <RotateCcw className="h-4 w-4" /> :
                     <Clock className="h-4 w-4" />}
                  </div>
                  {!isLast && (
                    <div className={`w-0.5 flex-1 min-h-[24px] ${
                      step.status === 'approved' ? 'bg-[hsl(var(--success))]/30' : 'bg-border'
                    }`} />
                  )}
                </div>

                {/* Content */}
                <div className={`pb-4 flex-1 ${isLast ? 'pb-0' : ''}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${
                      isActivePending ? 'text-primary' : 'text-foreground'
                    }`}>
                      {approver?.full_name || 'Unknown'}
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                      {stepActionIcons[sat]}
                      {stepActionLabels[sat]}
                    </Badge>
                    {isActivePending && (
                      <Badge className="bg-primary/10 text-primary text-[9px] px-1.5 py-0 h-4 border-0">
                        ← Pending Here
                      </Badge>
                    )}
                    {(step as any).signing_method === 'manual_paper' && step.status === 'approved' && (
                      <Badge className="bg-accent/10 text-accent text-[9px] px-1.5 py-0 h-4 border-0">
                        📄 Manual
                      </Badge>
                    )}
                  </div>
                  {approver?.job_title && (
                    <p className="text-xs text-muted-foreground mt-0.5">{approver.job_title}</p>
                  )}
                  {step.signed_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step.status === 'approved' ? 'Approved' : step.status === 'rejected' ? 'Rejected' : 'Responded'}: {format(new Date(step.signed_at), 'dd MMM yyyy, HH:mm')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WorkflowTracker;
