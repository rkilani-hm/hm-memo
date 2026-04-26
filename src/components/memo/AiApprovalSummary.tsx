import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Building2,
  Paperclip,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  Sparkles,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import FraudCheckPanel from './FraudCheckPanel';

interface AiSummaryData {
  executive_summary?: {
    summary: string;
    purpose: string;
    request_type: string;
  };
  financial_impact?: {
    total_amount: string | null;
    currency: string | null;
    budget_available: string | null;
    payment_terms: string | null;
    cost_breakdown: string[] | null;
  } | null;
  vendor_comparison?: {
    has_vendors: boolean;
    vendors: Array<{
      name: string;
      price: string;
      delivery?: string | null;
      terms?: string | null;
      highlight?: string | null;
    }>;
    ai_insight: string | null;
  } | null;
  attachment_summary?: {
    total_count: number;
    summaries: Array<{
      name: string;
      type: string;
      key_points: string[];
    }>;
  } | null;
  key_points?: Array<{
    point: string;
    severity: 'high' | 'medium' | 'low';
    category: string;
  }> | null;
  suggested_decision?: {
    recommendation: string | null;
    reasoning: string | null;
  } | null;
}

interface AiApprovalSummaryProps {
  memoId: string;
  memoUpdatedAt?: string;
}

const severityColors: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const decisionIcons: Record<string, React.ReactNode> = {
  approve: <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />,
  reject: <XCircle className="h-4 w-4 text-destructive" />,
  clarify: <HelpCircle className="h-4 w-4 text-[hsl(var(--warning))]" />,
};

const requestTypeBadge: Record<string, string> = {
  approval: 'bg-primary/10 text-primary',
  decision: 'bg-accent/10 text-accent-foreground',
  information: 'bg-muted text-muted-foreground',
  action: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
  payment: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
};

export default function AiApprovalSummary({ memoId, memoUpdatedAt }: AiApprovalSummaryProps) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AiSummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ id: string; file_name: string; file_type: string | null }>>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    executive: true,
    financial: true,
    vendor: true,
    attachments: true,
    keyPoints: true,
    decision: true,
  });
  const { toast } = useToast();

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchAttachments = async () => {
    const { data } = await supabase
      .from('memo_attachments')
      .select('id, file_name, file_type')
      .eq('memo_id', memoId);
    setAttachments(data || []);
  };

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memo-ai-summary`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ memo_id: memoId }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${response.status})`);
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (e: any) {
      setError(e.message);
      toast({ title: 'AI Summary Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoId, memoUpdatedAt]);

  if (!panelOpen) {
    return (
      <div className="fixed right-0 top-1/3 z-40 no-print">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPanelOpen(true)}
          className="rounded-l-lg rounded-r-none border-r-0 bg-card shadow-lg px-2 py-6"
        >
          <div className="flex flex-col items-center gap-1">
            <Brain className="h-4 w-4 text-primary" />
            <PanelRightOpen className="h-3 w-3" />
          </div>
        </Button>
      </div>
    );
  }

  return (
    <div className="no-print w-[360px] shrink-0 border-l border-border bg-card sticky top-0 h-screen flex flex-col shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Assistant</h3>
            <p className="text-[10px] text-muted-foreground">Approval Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchSummary}
            disabled={loading}
            title="Regenerate Summary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPanelOpen(false)}
            title="Collapse Panel"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
                <Sparkles className="h-4 w-4 text-primary absolute -top-1 -right-1 animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">Analyzing memo...</p>
              <p className="text-[10px] text-muted-foreground">Reading content & attachments</p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-sm font-medium text-destructive">Analysis Failed</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={fetchSummary}>
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          )}

          {summary && !loading && (
            <>
              {/* Executive Summary */}
              {summary.executive_summary && (
                <SectionCard
                  icon={<ClipboardList className="h-4 w-4" />}
                  title="Executive Summary"
                  open={openSections.executive}
                  onToggle={() => toggleSection('executive')}
                  accent="primary"
                >
                  <div className="space-y-2">
                    {summary.executive_summary.request_type && (
                      <Badge className={`text-[10px] ${requestTypeBadge[summary.executive_summary.request_type] || 'bg-muted text-muted-foreground'}`}>
                        {summary.executive_summary.request_type.toUpperCase()}
                      </Badge>
                    )}
                    <p className="text-xs leading-relaxed text-foreground">
                      {summary.executive_summary.summary}
                    </p>
                    {summary.executive_summary.purpose && (
                      <p className="text-[11px] text-muted-foreground italic">
                        Purpose: {summary.executive_summary.purpose}
                      </p>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* Fraud & Authenticity Check */}
              <FraudCheckPanel memoId={memoId} attachments={attachments} />

              {/* Financial Impact */}
              {summary.financial_impact && summary.financial_impact.total_amount && (
                <SectionCard
                  icon={<DollarSign className="h-4 w-4" />}
                  title="Financial Impact"
                  open={openSections.financial}
                  onToggle={() => toggleSection('financial')}
                  accent="success"
                >
                  <div className="space-y-2">
                    <div className="rounded-md bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Amount</p>
                      <p className="text-lg font-bold text-foreground">
                        {summary.financial_impact.total_amount}
                        {summary.financial_impact.currency && (
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            {summary.financial_impact.currency}
                          </span>
                        )}
                      </p>
                    </div>
                    {summary.financial_impact.budget_available && (
                      <InfoRow label="Budget" value={summary.financial_impact.budget_available} />
                    )}
                    {summary.financial_impact.payment_terms && (
                      <InfoRow label="Payment Terms" value={summary.financial_impact.payment_terms} />
                    )}
                    {summary.financial_impact.cost_breakdown && summary.financial_impact.cost_breakdown.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Cost Breakdown</p>
                        <ul className="space-y-0.5">
                          {summary.financial_impact.cost_breakdown.map((item, i) => (
                            <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                              <span className="text-muted-foreground mt-0.5">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* Vendor Comparison */}
              {summary.vendor_comparison?.has_vendors && summary.vendor_comparison.vendors.length > 0 && (
                <SectionCard
                  icon={<Building2 className="h-4 w-4" />}
                  title="Vendor Comparison"
                  open={openSections.vendor}
                  onToggle={() => toggleSection('vendor')}
                  accent="accent"
                >
                  <div className="space-y-2">
                    {summary.vendor_comparison.vendors.map((v, i) => (
                      <div
                        key={i}
                        className={`rounded-md border p-2.5 text-xs ${
                          v.highlight ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{v.name}</span>
                          <span className="font-bold text-foreground">{v.price}</span>
                        </div>
                        {v.delivery && (
                          <p className="text-[10px] text-muted-foreground mt-1">Delivery: {v.delivery}</p>
                        )}
                        {v.terms && (
                          <p className="text-[10px] text-muted-foreground">Terms: {v.terms}</p>
                        )}
                        {v.highlight && (
                          <Badge variant="outline" className="text-[9px] mt-1 border-primary/30 text-primary">
                            {v.highlight}
                          </Badge>
                        )}
                      </div>
                    ))}
                    {summary.vendor_comparison.ai_insight && (
                      <div className="rounded-md bg-primary/5 border border-primary/20 p-2.5 flex gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <p className="text-[11px] text-foreground italic">{summary.vendor_comparison.ai_insight}</p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* Attachment Summary */}
              {summary.attachment_summary && summary.attachment_summary.total_count > 0 && (
                <SectionCard
                  icon={<Paperclip className="h-4 w-4" />}
                  title={`Attachments (${summary.attachment_summary.total_count})`}
                  open={openSections.attachments}
                  onToggle={() => toggleSection('attachments')}
                  accent="muted"
                >
                  <div className="space-y-2">
                    {summary.attachment_summary.summaries.map((att, i) => (
                      <div key={i} className="rounded-md border border-border bg-muted/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                            {att.type}
                          </Badge>
                          <span className="text-xs font-medium text-foreground truncate">{att.name}</span>
                        </div>
                        <ul className="space-y-0.5">
                          {att.key_points.map((pt, j) => (
                            <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <span className="mt-0.5">•</span>
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Key Points to Review */}
              {summary.key_points && summary.key_points.length > 0 && (
                <SectionCard
                  icon={<AlertTriangle className="h-4 w-4" />}
                  title="Key Points to Review"
                  open={openSections.keyPoints}
                  onToggle={() => toggleSection('keyPoints')}
                  accent="warning"
                >
                  <div className="space-y-1.5">
                    {summary.key_points.map((kp, i) => (
                      <div
                        key={i}
                        className={`rounded-md border p-2 text-xs flex items-start gap-2 ${severityColors[kp.severity] || severityColors.low}`}
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">{kp.point}</p>
                          <div className="flex gap-1 mt-1">
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">
                              {kp.severity}
                            </Badge>
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">
                              {kp.category}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Suggested Decision */}
              {summary.suggested_decision?.recommendation && (
                <SectionCard
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  title="Suggested Decision"
                  open={openSections.decision}
                  onToggle={() => toggleSection('decision')}
                  accent="primary"
                >
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      {decisionIcons[summary.suggested_decision.recommendation] || decisionIcons.clarify}
                      <span className="text-sm font-semibold capitalize text-foreground">
                        {summary.suggested_decision.recommendation === 'clarify'
                          ? 'Request Clarification'
                          : summary.suggested_decision.recommendation}
                      </span>
                    </div>
                    {summary.suggested_decision.reasoning && (
                      <p className="text-[11px] text-muted-foreground">
                        {summary.suggested_decision.reasoning}
                      </p>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* Footer */}
              <div className="pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground text-center">
                  AI-generated summary • Review carefully before deciding
                </p>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ---------- Reusable section card ---------- */

function SectionCard({
  icon,
  title,
  open,
  onToggle,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <div className="text-primary">{icon}</div>
              <span className="text-xs font-semibold text-foreground">{title}</span>
            </div>
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ---------- Info row helper ---------- */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}
