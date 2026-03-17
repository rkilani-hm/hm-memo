import { CheckCircle2, Clock, XCircle, RotateCcw, Pen, Type, Users, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format, differenceInDays } from 'date-fns';

type StepActionType = 'signature' | 'initial';

interface ApprovalStep {
  id: string;
  approver_user_id: string;
  status: string;
  step_order: number;
  action_type: StepActionType;
  signed_at: string | null;
  signing_method?: string | null;
  parallel_group?: number | null;
  stage_level?: string | null;
  created_at?: string;
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

const stageLevelLabels: Record<string, string> = {
  L1: 'Level 1 — Department Manager',
  L2a: 'Level 2a — Finance Staff Initials',
  L2b: 'Level 2b — Finance Manager',
  L3: 'Level 3 — Senior Executive',
  L4: 'Level 4 — CEO / Chairman',
};

const stageLevelColors: Record<string, string> = {
  L1: 'bg-blue-500/10 text-blue-600 border-blue-300',
  L2a: 'bg-amber-500/10 text-amber-600 border-amber-300',
  L2b: 'bg-amber-600/10 text-amber-700 border-amber-400',
  L3: 'bg-purple-500/10 text-purple-600 border-purple-300',
  L4: 'bg-red-500/10 text-red-600 border-red-300',
};

const stepActionIcons: Record<StepActionType, React.ReactNode> = {
  signature: <Pen className="h-3 w-3" />,
  initial: <Type className="h-3 w-3" />,
};

const stepActionLabels: Record<StepActionType, string> = {
  signature: 'Approve',
  initial: 'Initial',
};

const WorkflowTracker = ({ steps, profiles, memoStatus, currentStep }: WorkflowTrackerProps) => {
  if (steps.length === 0) return null;

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);
  const completedSteps = steps.filter(s => s.status === 'approved' || s.status === 'skipped').length;
  const progressPercent = (completedSteps / steps.length) * 100;

  const isTerminal = memoStatus === 'rejected' || memoStatus === 'approved';

  // Group steps by stage_level for contextual display
  const hasStages = steps.some(s => s.stage_level);

  // Check if any steps are parallel (Finance dual-initials)
  const parallelGroups = new Map<number, ApprovalStep[]>();
  steps.forEach(s => {
    if (s.parallel_group != null) {
      if (!parallelGroups.has(s.parallel_group)) parallelGroups.set(s.parallel_group, []);
      parallelGroups.get(s.parallel_group)!.push(s);
    }
  });

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
            const isFirst = index === 0;
            const isLast = index === steps.length - 1;
            const sat = (step as any).action_type || 'signature';

            // Determine if this is the active pending step
            const firstPending = steps.find(s => s.status === 'pending');
            const isActivePending = !isTerminal && step.status === 'pending' && firstPending?.id === step.id;
            
            // Also mark parallel siblings as active
            const isParallelActive = !isTerminal && step.status === 'pending' && firstPending?.parallel_group != null && step.parallel_group === firstPending.parallel_group;
            const isActive = isActivePending || isParallelActive;

            // Days pending calculation
            const daysPending = step.status === 'pending' && step.created_at
              ? differenceInDays(new Date(), new Date(step.created_at))
              : 0;

            // Check parallel group siblings status (Finance dual-initial)
            const parallelSiblings = step.parallel_group != null ? parallelGroups.get(step.parallel_group) : null;
            const isInParallelGroup = parallelSiblings && parallelSiblings.length > 1;
            const siblingsDone = parallelSiblings?.filter(s => s.status === 'approved').length || 0;
            const siblingsTotal = parallelSiblings?.length || 0;

            return (
              <div key={step.id} className="flex gap-3">
                {/* Vertical line + circle */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      step.status === 'approved' ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]' :
                      step.status === 'rejected' ? 'bg-destructive/15 text-destructive' :
                      step.status === 'rework' ? 'bg-accent/15 text-accent' :
                      isActive ? 'bg-primary/15 text-primary ring-2 ring-primary/30 animate-pulse' :
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
                      isActive ? 'text-primary' : 'text-foreground'
                    }`}>
                      {approver?.full_name || 'Unknown'}
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                      {stepActionIcons[sat]}
                      {stepActionLabels[sat]}
                    </Badge>
                    {/* Stage level badge */}
                    {step.stage_level && stageLevelLabels[step.stage_level] && (
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${stageLevelColors[step.stage_level] || ''}`}>
                        {step.stage_level}
                      </Badge>
                    )}
                    {isActive && (
                      <Badge className="bg-primary/10 text-primary text-[9px] px-1.5 py-0 h-4 border-0">
                        ← Pending Here
                      </Badge>
                    )}
                    {/* Days pending indicator */}
                    {isActive && daysPending >= 2 && (
                      <Badge className={`text-[9px] px-1.5 py-0 h-4 border-0 ${
                        daysPending >= 5 ? 'bg-destructive/10 text-destructive' : 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]'
                      }`}>
                        {daysPending}d pending
                      </Badge>
                    )}
                    {/* Parallel group indicator */}
                    {isInParallelGroup && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                        <Users className="h-2.5 w-2.5" />
                        {siblingsDone}/{siblingsTotal} done
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
                  {/* Stage description */}
                  {step.stage_level && stageLevelLabels[step.stage_level] && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {stageLevelLabels[step.stage_level]}
                      {step.stage_level === 'L3' && ' — Any one of GM / COO / CAO / CFO may approve'}
                    </p>
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

        {/* Senior Executive note if L3 stage exists */}
        {steps.some(s => s.stage_level === 'L3') && !isTerminal && (
          <div className="mt-3 px-3 py-2 bg-muted/50 rounded text-xs text-muted-foreground flex items-center gap-2">
            <UserCheck className="h-3.5 w-3.5" />
            Level 3: Any one of GM / COO / CAO / CFO may approve this memo. First to act closes this level.
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowTracker;
