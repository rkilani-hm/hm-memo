import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Eye,
  ScanLine,
  Bug,
  Info,
} from 'lucide-react';

// Public types ------------------------------------------------------------
interface FraudSignal {
  id?: string;
  attachment_id: string | null;
  layer: 'forensic' | 'business' | 'cross_doc' | 'ai_visual';
  signal_type: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string | null;
  evidence?: Record<string, unknown> | null;
  detected_at?: string;
}

interface FraudRunRow {
  id: string;
  memo_id: string;
  status: string;
  attachments_scanned: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  overall_risk: 'clean' | 'low' | 'medium' | 'high' | 'critical' | null;
  ai_summary: string | null;
  started_at: string;
  finished_at: string | null;
}

interface AttachmentLite {
  id: string;
  file_name: string;
  file_type: string | null;
}

interface FraudCheckPanelProps {
  memoId: string;
  attachments: AttachmentLite[];
  /** If true, automatically trigger a new check whenever the attachments change. */
  autoRun?: boolean;
}

const riskColor: Record<string, string> = {
  clean:    'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  low:      'bg-blue-500/10 text-blue-600 border-blue-500/30',
  medium:   'bg-amber-500/10 text-amber-600 border-amber-500/30',
  high:     'bg-orange-500/10 text-orange-600 border-orange-500/30',
  critical: 'bg-red-500/10 text-red-600 border-red-500/30',
};

const sevColor: Record<FraudSignal['severity'], string> = {
  high:   'bg-red-500/10 text-red-600 border-red-500/30',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  low:    'bg-blue-500/10 text-blue-600 border-blue-500/30',
  info:   'bg-muted text-muted-foreground border-border',
};

const layerIcon: Record<FraudSignal['layer'], React.ReactNode> = {
  forensic:   <ScanLine  className="h-3.5 w-3.5" />,
  business:   <FileText  className="h-3.5 w-3.5" />,
  cross_doc:  <Bug       className="h-3.5 w-3.5" />,
  ai_visual:  <Eye       className="h-3.5 w-3.5" />,
};

const layerLabel: Record<FraudSignal['layer'], string> = {
  forensic:  'Forensic',
  business:  'Business',
  cross_doc: 'Cross-doc',
  ai_visual: 'AI Visual',
};

const RiskIcon = ({ risk }: { risk: FraudRunRow['overall_risk'] }) => {
  switch (risk) {
    case 'clean':    return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
    case 'low':      return <Shield      className="h-4 w-4 text-blue-500" />;
    case 'medium':   return <ShieldAlert className="h-4 w-4 text-amber-500" />;
    case 'high':     return <ShieldAlert className="h-4 w-4 text-orange-500" />;
    case 'critical': return <ShieldX     className="h-4 w-4 text-red-500" />;
    default:         return <Shield      className="h-4 w-4 text-muted-foreground" />;
  }
};

export default function FraudCheckPanel({ memoId, attachments, autoRun = false }: FraudCheckPanelProps) {
  const [running, setRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<FraudRunRow | null>(null);
  const [signals, setSignals] = useState<FraudSignal[]>([]);
  const [openSection, setOpenSection] = useState(true);
  const [activeAttId, setActiveAttId] = useState<string>('all');
  const { toast } = useToast();

  const fetchLatest = async () => {
    const { data: runs } = await supabase
      .from('memo_fraud_runs' as any)
      .select('*')
      .eq('memo_id', memoId)
      .order('started_at', { ascending: false })
      .limit(1);
    const run = (runs as any)?.[0] || null;
    setLatestRun(run);
    if (run) {
      const { data: sigs } = await supabase
        .from('memo_fraud_signals' as any)
        .select('*')
        .eq('memo_id', memoId)
        .eq('run_id', run.id)
        .order('severity', { ascending: true });
      setSignals(((sigs as any) || []) as FraudSignal[]);
    } else {
      setSignals([]);
    }
  };

  const runCheck = async () => {
    setRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memo-fraud-check`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ memo_id: memoId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Check failed (${res.status})`);
      }
      await fetchLatest();
      toast({ title: 'Fraud check complete', description: 'Findings updated below.' });
    } catch (e: any) {
      toast({ title: 'Fraud check failed', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  // Initial load + optional autoRun
  useEffect(() => {
    fetchLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoId]);

  useEffect(() => {
    if (autoRun && attachments.length > 0 && !latestRun) {
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, attachments.length]);

  const grouped = useMemo(() => {
    const m: Record<string, FraudSignal[]> = { _memo: [] };
    for (const s of signals) {
      const k = s.attachment_id || '_memo';
      (m[k] = m[k] || []).push(s);
    }
    return m;
  }, [signals]);

  const visibleSignals = useMemo(() => {
    if (activeAttId === 'all') return signals;
    if (activeAttId === '_memo') return grouped['_memo'] || [];
    return grouped[activeAttId] || [];
  }, [activeAttId, signals, grouped]);

  const risk = latestRun?.overall_risk;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Collapsible open={openSection} onOpenChange={setOpenSection}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/20">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 hover:text-primary transition-colors">
              <RiskIcon risk={risk} />
              <span className="text-sm font-semibold text-foreground">Fraud & Authenticity</span>
              {risk && (
                <Badge variant="outline" className={`text-[10px] capitalize ${riskColor[risk]}`}>
                  {risk}
                </Badge>
              )}
              {latestRun && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  {latestRun.high_count} high · {latestRun.medium_count} med · {latestRun.low_count} low
                </span>
              )}
              {openSection ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] px-2"
            onClick={runCheck}
            disabled={running || attachments.length === 0}
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            {latestRun ? 'Re-scan' : 'Run scan'}
          </Button>
        </div>

        <CollapsibleContent>
          <div className="p-3 space-y-3">
            {!latestRun && !running && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {attachments.length === 0
                  ? 'No attachments to scan.'
                  : 'No scan has been run for this memo yet. Click "Run scan" to begin.'}
              </div>
            )}

            {running && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                Inspecting attachments — forensic + visual + cross-document checks…
              </div>
            )}

            {latestRun && !running && (
              <>
                {latestRun.ai_summary && (
                  <div className="rounded-md bg-primary/5 border border-primary/20 p-2.5 text-[11px] text-foreground italic">
                    {latestRun.ai_summary}
                  </div>
                )}

                {signals.length === 0 ? (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                    <ShieldCheck className="h-6 w-6 text-emerald-600 mx-auto mb-1" />
                    <p className="text-xs font-medium text-emerald-700">No fraud indicators detected</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Scanned {latestRun.attachments_scanned} attachment(s).
                    </p>
                  </div>
                ) : (
                  <Tabs value={activeAttId} onValueChange={setActiveAttId}>
                    <TabsList className="w-full justify-start h-8 overflow-x-auto">
                      <TabsTrigger value="all" className="text-[11px] h-6">
                        All ({signals.length})
                      </TabsTrigger>
                      {(grouped['_memo']?.length || 0) > 0 && (
                        <TabsTrigger value="_memo" className="text-[11px] h-6">
                          Memo-level ({grouped['_memo'].length})
                        </TabsTrigger>
                      )}
                      {attachments
                        .filter((a) => grouped[a.id]?.length)
                        .map((a) => (
                          <TabsTrigger
                            key={a.id}
                            value={a.id}
                            className="text-[11px] h-6 max-w-[140px]"
                          >
                            <span className="truncate">{a.file_name}</span>
                            <span className="ml-1 text-muted-foreground">
                              ({grouped[a.id].length})
                            </span>
                          </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value={activeAttId} className="mt-3">
                      <div className="space-y-1.5">
                        {visibleSignals.map((s, i) => (
                          <SignalCard key={s.id || i} signal={s} attachments={attachments} />
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                )}

                <div className="pt-2 border-t border-border text-[10px] text-muted-foreground text-center">
                  Last scanned {latestRun.finished_at
                    ? new Date(latestRun.finished_at).toLocaleString()
                    : 'just now'}
                  {' · '}
                  {latestRun.attachments_scanned} attachment(s)
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// --- Signal card (collapsible evidence) -----------------------------------

function SignalCard({
  signal,
  attachments,
}: {
  signal: FraudSignal;
  attachments: AttachmentLite[];
}) {
  const [open, setOpen] = useState(false);
  const att = attachments.find((a) => a.id === signal.attachment_id);

  return (
    <div className={`rounded-md border p-2 text-xs ${sevColor[signal.severity]}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold">{signal.title}</span>
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 capitalize">
              {signal.severity}
            </Badge>
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 flex items-center gap-0.5">
              {layerIcon[signal.layer]}
              {layerLabel[signal.layer]}
            </Badge>
          </div>
          {signal.description && (
            <p className="text-[11px] mt-1 leading-relaxed">{signal.description}</p>
          )}
          {att && (
            <p className="text-[10px] text-muted-foreground mt-0.5 italic">
              Attachment: {att.file_name}
            </p>
          )}
          {signal.evidence && Object.keys(signal.evidence as object).length > 0 && (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-[10px] mt-1 underline-offset-2 hover:underline">
                  <Info className="h-3 w-3" />
                  {open ? 'Hide evidence' : 'Show evidence'}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1">
                <pre className="text-[10px] bg-background/50 rounded p-1.5 overflow-x-auto">
                  {JSON.stringify(signal.evidence, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}
