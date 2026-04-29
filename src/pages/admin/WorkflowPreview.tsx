import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  ArrowRightCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  Send,
} from 'lucide-react';

// =====================================================================
// Workflow Chain Preview (admin tool)
//
// Shows admins what approval chain a memo using a given workflow
// template would generate AT THIS MOMENT, given the current state of:
//   - the template's stored steps
//   - which users hold the finance_dispatcher role
//   - any active in-window finance_dispatcher delegations
//
// Useful for:
//   - Catching misconfigurations before users encounter them
//     (e.g., the role assignment bug that affected memos 0046/0047)
//   - Verifying a delegation is correctly routing dispatch steps
//   - Comparing what the template says vs what actually happens at submission
//
// Backed by the simulate_workflow_chain() RPC (admin-only, SECURITY
// DEFINER, returns the same chain submit-memo would build but doesn't
// persist anything).
// =====================================================================

interface SimulatedStep {
  step_order: number;
  template_approver_id: string | null;
  template_approver_name: string | null;
  effective_approver_id: string | null;
  effective_approver_name: string | null;
  is_dispatcher: boolean;
  was_rewritten: boolean;
  rewrite_reason: string | null;
  action_type: string;
  label: string;
  warnings: string[];
}

const WorkflowPreview = () => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Templates list
  const { data: templates = [], isLoading: tLoading } = useQuery({
    queryKey: ['admin-workflow-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('id, name, department_id, memo_type, is_default')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Simulation result
  const {
    data: simulation = [],
    isLoading: sLoading,
    error: sError,
    refetch,
  } = useQuery<SimulatedStep[]>({
    queryKey: ['simulate-workflow-chain', selectedTemplateId],
    enabled: !!selectedTemplateId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('simulate_workflow_chain', {
        p_template_id: selectedTemplateId,
      });
      if (error) throw error;
      return (data || []) as SimulatedStep[];
    },
  });

  const totalWarnings = simulation.reduce(
    (sum, s) => sum + (s.warnings?.length || 0),
    0,
  );
  const hasRewrites = simulation.some((s) => s.was_rewritten);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" />
          Workflow Chain Preview
        </h1>
        <p className="text-muted-foreground mt-1">
          Pick a workflow template to see exactly what approval chain a memo using it would
          produce right now. Mirrors submit-memo's logic without persisting anything.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select template</CardTitle>
          <CardDescription>
            All workflow templates in the system, including auto-generated dynamic ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="template">Workflow template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger id="template">
                  <SelectValue placeholder={tLoading ? 'Loading...' : 'Pick a template…'} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.memo_type && ` — ${t.memo_type}`}
                      {t.is_default && ' ★'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedTemplateId && (
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedTemplateId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Computed chain
              {totalWarnings > 0 && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-700 bg-amber-500/5">
                  {totalWarnings} warning{totalWarnings === 1 ? '' : 's'}
                </Badge>
              )}
              {hasRewrites && (
                <Badge variant="outline" className="border-blue-500/40 text-blue-700 bg-blue-500/5">
                  Rewrites in effect
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              The template column shows what's stored in the template. The effective column
              shows who would actually be on the chain after submit-memo applies role detection
              and delegation rules.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sError ? (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                Could not load simulation: {(sError as Error).message}
              </div>
            ) : sLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Computing…</div>
            ) : simulation.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Template has no approval steps.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Template approver</TableHead>
                    <TableHead className="w-8 text-center">→</TableHead>
                    <TableHead>Effective approver</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simulation.map((s) => {
                    return (
                      <TableRow key={s.step_order}>
                        <TableCell className="text-muted-foreground">{s.step_order}</TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {s.template_approver_name || (
                              <span className="text-destructive italic">No name found</span>
                            )}
                          </div>
                          {s.template_approver_id && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {s.template_approver_id.slice(0, 8)}…
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {s.was_rewritten ? (
                            <ArrowRightCircle className="h-4 w-4 text-blue-600 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">=</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={`font-medium ${s.was_rewritten ? 'text-blue-700' : ''}`}>
                            {s.effective_approver_name || s.template_approver_name || '—'}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {s.is_dispatcher && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-700 bg-amber-500/5">
                                <Send className="h-2.5 w-2.5 mr-0.5" /> Dispatch
                              </Badge>
                            )}
                            {s.was_rewritten && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/40 text-blue-700 bg-blue-500/5">
                                Delegated
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{s.action_type}</TableCell>
                        <TableCell className="text-xs">
                          {s.rewrite_reason && (
                            <div className="text-blue-700">{s.rewrite_reason}</div>
                          )}
                          {s.warnings && s.warnings.length > 0 && (
                            <div className="space-y-0.5 mt-0.5">
                              {s.warnings.map((w, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-1 text-amber-700"
                                >
                                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                  <span>{w}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {!s.rewrite_reason && (!s.warnings || s.warnings.length === 0) && (
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> ok
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {selectedTemplateId && simulation.length > 0 && (
        <div className="text-xs text-muted-foreground rounded-md border p-3 bg-muted/20">
          <p className="font-medium text-foreground mb-1">How to read this</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>If the template approver and effective approver are the same, no rewrite happens at submission.</li>
            <li>A rewrite happens when the template approver holds <code>finance_dispatcher</code> AND has an active delegation to someone else right now.</li>
            <li>The Dispatch badge means MemoView will show that step a "Dispatch Reviewers" button instead of the regular Approve.</li>
            <li>Warnings indicate template misconfigurations (missing approvers, inactive profiles) that should be fixed in the workflow template itself.</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default WorkflowPreview;
