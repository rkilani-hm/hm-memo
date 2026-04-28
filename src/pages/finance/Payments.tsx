import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { collectDeviceInfo, getClientIp, resolveIpGeolocation } from '@/lib/device-info';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Banknote, Inbox, ClipboardCheck, Eye, ExternalLink, Loader2, Printer, Search, ShieldX,
} from 'lucide-react';
import { format } from 'date-fns';

type HandoffStage = 'awaiting_originals' | 'awaiting_payment' | 'paid';

interface PaymentMemoRow {
  id: string;
  transmittal_no: string;
  subject: string;
  date: string;
  from_user_id: string;
  department_id: string | null;
  memo_types: string[] | null;
  status: string;
  originals_received_at: string | null;
  originals_received_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  updated_at: string;
  handoff_stage: HandoffStage;
}

const stageLabels: Record<HandoffStage, { label: string; color: string }> = {
  awaiting_originals: { label: 'Awaiting Originals', color: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  awaiting_payment:   { label: 'Awaiting Payment',   color: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  paid:               { label: 'Paid',               color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
};

export default function FinancePayments() {
  const { user, hasRole, profile } = useAuth();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<HandoffStage>('awaiting_originals');

  // Dialog state
  const [receiveDialog, setReceiveDialog] = useState<PaymentMemoRow | null>(null);
  const [payDialog,     setPayDialog]     = useState<PaymentMemoRow | null>(null);
  const [receiveNotes,    setReceiveNotes] = useState('');
  const [paymentMethod,   setPaymentMethod] = useState<string>('bank_transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes,     setPaymentNotes] = useState('');

  // Permission gate: explicit Authorization access is enough, even without the finance role.
  const canAccessPayments = hasRole('finance') || hasRole('admin') || hasPermission('finance/payments');

  // Profile + dept lookups
  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments });

  const getProfile = (uid?: string | null) =>
    uid ? profiles.find((p: any) => p.user_id === uid) : null;
  const getDept = (did?: string | null) =>
    did ? departments.find((d: any) => d.id === did) : null;

  // Main query — pulls all approved payment memos and slices into stages
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['payment-handoff-queue'],
    enabled: canAccessPayments,
    queryFn: async (): Promise<PaymentMemoRow[]> => {
      const { data, error } = await supabase
        .from('v_payment_handoff_queue' as any)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as any) as PaymentMemoRow[];
    },
  });

  // ---- Mutations ---------------------------------------------------------
  const markReceivedMutation = useMutation({
    mutationFn: async (params: { row: PaymentMemoRow; notes: string }) => {
      if (!user) return;
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('memos')
        .update({
          originals_received_at: now,
          originals_received_by: user.id,
          originals_received_notes: params.notes || null,
        } as any)
        .eq('id', params.row.id);
      if (error) throw error;

      const deviceInfo = collectDeviceInfo();
      const clientIp = await getClientIp();
      const geo = clientIp ? await resolveIpGeolocation(clientIp) : { city: null, country: null };
      await supabase.from('audit_log').insert({
        memo_id: params.row.id,
        user_id: user.id,
        action: 'finance_originals_received',
        action_detail: 'originals_received',
        signing_method: 'digital',
        transmittal_no: params.row.transmittal_no,
        password_verified: false,
        previous_status: 'awaiting_originals',
        new_status: 'awaiting_payment',
        details: { received_notes: params.notes || null },
        notes: params.notes
          ? `Original documents received by finance. Notes: ${params.notes}`
          : 'Original documents received by finance.',
        ip_address: clientIp,
        ip_geolocation_city: geo.city,
        ip_geolocation_country: geo.country,
        ...deviceInfo,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-handoff-queue'] });
      queryClient.invalidateQueries({ queryKey: ['memo'] });
      toast({ title: 'Originals received', description: 'Memo moved to Awaiting Payment.' });
      setReceiveDialog(null);
      setReceiveNotes('');
    },
    onError: (e: Error) =>
      toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (params: { row: PaymentMemoRow; method: string; reference: string; notes: string }) => {
      if (!user) return;
      if (!params.method) throw new Error('Payment method is required');
      if (!params.reference.trim()) throw new Error('Payment reference (cheque #, transfer ID, etc.) is required');

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('memos')
        .update({
          paid_at: now,
          paid_by: user.id,
          payment_method: params.method,
          payment_reference: params.reference.trim(),
          payment_notes: params.notes || null,
        } as any)
        .eq('id', params.row.id);
      if (error) throw error;

      const deviceInfo = collectDeviceInfo();
      const clientIp = await getClientIp();
      const geo = clientIp ? await resolveIpGeolocation(clientIp) : { city: null, country: null };
      await supabase.from('audit_log').insert({
        memo_id: params.row.id,
        user_id: user.id,
        action: 'finance_payment_released',
        action_detail: 'paid',
        signing_method: 'digital',
        transmittal_no: params.row.transmittal_no,
        password_verified: false,
        previous_status: 'awaiting_payment',
        new_status: 'paid',
        details: {
          payment_method: params.method,
          payment_reference: params.reference,
          payment_notes: params.notes || null,
        },
        notes:
          `Payment released — ${params.method.replace('_', ' ')} ref ${params.reference}` +
          (params.notes ? ` — ${params.notes}` : ''),
        ip_address: clientIp,
        ip_geolocation_city: geo.city,
        ip_geolocation_country: geo.country,
        ...deviceInfo,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-handoff-queue'] });
      queryClient.invalidateQueries({ queryKey: ['memo'] });
      toast({ title: 'Payment recorded', description: 'Memo marked as paid.' });
      setPayDialog(null);
      setPaymentMethod('bank_transfer');
      setPaymentReference('');
      setPaymentNotes('');
    },
    onError: (e: Error) =>
      toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ---- Filtering and slicing --------------------------------------------
  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) => {
      const fromName = getProfile(r.from_user_id)?.full_name?.toLowerCase() || '';
      const deptName = getDept(r.department_id)?.name?.toLowerCase() || '';
      return (
        r.transmittal_no?.toLowerCase().includes(q) ||
        r.subject?.toLowerCase().includes(q) ||
        fromName.includes(q) ||
        deptName.includes(q) ||
        r.payment_reference?.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, profiles, departments]);

  const byStage = useMemo(
    () => ({
      awaiting_originals: filtered.filter((r) => r.handoff_stage === 'awaiting_originals'),
      awaiting_payment:   filtered.filter((r) => r.handoff_stage === 'awaiting_payment'),
      paid:               filtered.filter((r) => r.handoff_stage === 'paid'),
    }),
    [filtered],
  );

  // ---- Render -------------------------------------------------------------
  if (!canAccessPayments) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <ShieldX className="h-5 w-5 mr-2" />
        You don't have access to the finance payments queue.
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" /> Payments — Finance Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Approved payment memos awaiting physical-original handoff and payment release.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by transmittal, subject, vendor, dept…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-72"
          />
        </div>
      </div>

      {/* Headline counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['awaiting_originals', 'awaiting_payment', 'paid'] as HandoffStage[]).map((stage) => (
          <Card
            key={stage}
            className={`cursor-pointer transition-colors ${activeTab === stage ? 'border-primary' : ''}`}
            onClick={() => setActiveTab(stage)}
          >
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {stageLabels[stage].label}
                  </p>
                  <p className="text-2xl font-semibold mt-0.5">{byStage[stage].length}</p>
                </div>
                {stage === 'awaiting_originals' && <Inbox className="h-7 w-7 text-amber-500/70" />}
                {stage === 'awaiting_payment'   && <ClipboardCheck className="h-7 w-7 text-blue-500/70" />}
                {stage === 'paid'                && <Banknote className="h-7 w-7 text-emerald-500/70" />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as HandoffStage)}>
            <TabsList>
              <TabsTrigger value="awaiting_originals">Awaiting Originals ({byStage.awaiting_originals.length})</TabsTrigger>
              <TabsTrigger value="awaiting_payment">Awaiting Payment ({byStage.awaiting_payment.length})</TabsTrigger>
              <TabsTrigger value="paid">Paid ({byStage.paid.length})</TabsTrigger>
            </TabsList>

            {(['awaiting_originals', 'awaiting_payment', 'paid'] as HandoffStage[]).map((stage) => (
              <TabsContent key={stage} value={stage} className="mt-4">
                <PaymentTable
                  rows={byStage[stage]}
                  stage={stage}
                  isLoading={isLoading}
                  getProfile={getProfile}
                  getDept={getDept}
                  onView={(r) => navigate(`/memos/${r.id}`)}
                  onPrintCoverSheet={(r) => printCoverSheet(r, getProfile, getDept)}
                  onMarkReceived={(r) => { setReceiveDialog(r); setReceiveNotes(''); }}
                  onMarkPaid={(r) => {
                    setPayDialog(r);
                    setPaymentMethod('bank_transfer');
                    setPaymentReference('');
                    setPaymentNotes('');
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Mark-received dialog */}
      <Dialog open={!!receiveDialog} onOpenChange={(o) => !o && setReceiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm receipt of original documents</DialogTitle>
            <DialogDescription>
              {receiveDialog && (
                <>Memo <strong>{receiveDialog.transmittal_no}</strong> — {receiveDialog.subject}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Compare the physical bundle to the scanned attachments before confirming. If anything is missing or doesn't match,
              note it below — the memo will still move to "Awaiting Payment" but the discrepancy is recorded permanently in the audit log.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="receive-notes">Notes (optional)</Label>
              <Textarea
                id="receive-notes"
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="e.g. Missing original PO, vendor will deliver tomorrow"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialog(null)}>Cancel</Button>
            <Button
              onClick={() => receiveDialog && markReceivedMutation.mutate({ row: receiveDialog, notes: receiveNotes })}
              disabled={markReceivedMutation.isPending}
            >
              {markReceivedMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Confirm receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark-paid dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment release</DialogTitle>
            <DialogDescription>
              {payDialog && (
                <>Memo <strong>{payDialog.transmittal_no}</strong> — {payDialog.subject}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Payment method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="wire">Wire transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Reference *</Label>
              <Input
                id="pay-ref"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder={
                  paymentMethod === 'cheque' ? 'e.g. Cheque # 4537'
                  : paymentMethod === 'bank_transfer' ? 'e.g. Transfer ID 9281443'
                  : paymentMethod === 'wire' ? 'e.g. SWIFT MT103 ref'
                  : 'Payment reference'
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-notes">Notes (optional)</Label>
              <Textarea
                id="pay-notes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
            <Button
              onClick={() => payDialog && markPaidMutation.mutate({
                row: payDialog,
                method: paymentMethod,
                reference: paymentReference,
                notes: paymentNotes,
              })}
              disabled={markPaidMutation.isPending}
            >
              {markPaidMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================================
// Sub-component: payment table
// =====================================================================
function PaymentTable({
  rows,
  stage,
  isLoading,
  getProfile,
  getDept,
  onView,
  onPrintCoverSheet,
  onMarkReceived,
  onMarkPaid,
}: {
  rows: PaymentMemoRow[];
  stage: HandoffStage;
  isLoading: boolean;
  getProfile: (uid?: string | null) => any;
  getDept: (did?: string | null) => any;
  onView: (r: PaymentMemoRow) => void;
  onPrintCoverSheet: (r: PaymentMemoRow) => void;
  onMarkReceived: (r: PaymentMemoRow) => void;
  onMarkPaid: (r: PaymentMemoRow) => void;
}) {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No memos in this stage.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Transmittal #</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Submitter</TableHead>
          <TableHead>Approved on</TableHead>
          {stage !== 'awaiting_originals' && <TableHead>Originals received</TableHead>}
          {stage === 'paid' && <TableHead>Payment</TableHead>}
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const dept = getDept(r.department_id);
          const submitter = getProfile(r.from_user_id);
          return (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">{r.transmittal_no}</TableCell>
              <TableCell className="max-w-xs truncate">{r.subject}</TableCell>
              <TableCell>{dept?.name || '—'}</TableCell>
              <TableCell>{submitter?.full_name || '—'}</TableCell>
              <TableCell>
                <span className="text-xs">{format(new Date(r.updated_at), 'dd MMM yyyy')}</span>
              </TableCell>
              {stage !== 'awaiting_originals' && (
                <TableCell>
                  <span className="text-xs">
                    {r.originals_received_at ? format(new Date(r.originals_received_at), 'dd MMM yyyy') : '—'}
                  </span>
                </TableCell>
              )}
              {stage === 'paid' && (
                <TableCell>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {r.payment_method?.replace('_', ' ') || '—'}
                  </Badge>
                  <span className="ml-1.5 text-[11px] font-mono">{r.payment_reference}</span>
                </TableCell>
              )}
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  <Button size="sm" variant="ghost" onClick={() => onView(r)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
                  {stage === 'awaiting_originals' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onPrintCoverSheet(r)}>
                        <Printer className="h-3.5 w-3.5 mr-1" /> Cover sheet
                      </Button>
                      <Button size="sm" onClick={() => onMarkReceived(r)}>
                        <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Received
                      </Button>
                    </>
                  )}
                  {stage === 'awaiting_payment' && (
                    <Button size="sm" onClick={() => onMarkPaid(r)}>
                      <Banknote className="h-3.5 w-3.5 mr-1" /> Mark paid
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// =====================================================================
// Cover-sheet print: builds a printable HTML page in a new window with the
// memo summary, attachment checklist, and a finance-receipt block. The
// department brings this stamped sheet back as proof of physical delivery.
// =====================================================================
function printCoverSheet(
  row: PaymentMemoRow,
  getProfile: (uid?: string | null) => any,
  getDept: (did?: string | null) => any,
) {
  const submitter = getProfile(row.from_user_id);
  const dept = getDept(row.department_id);
  const today = format(new Date(), 'dd MMM yyyy');
  const url = `${window.location.origin}/memos/${row.id}`;
  const qrUrl =
    `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(url)}`;

  // Pull attachments synchronously via fetch on a Supabase signed url? Skip — we
  // can't await inside printCoverSheet without making it async. The cover sheet
  // simply asks finance to tick attachments seen; the canonical list is on the
  // memo page that the QR points to.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cover Sheet — ${row.transmittal_no}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      color: #111;
      margin: 0;
      font-size: 12pt;
    }
    h1 { font-size: 18pt; margin: 0 0 4mm 0; }
    h2 { font-size: 13pt; margin: 8mm 0 3mm 0; border-bottom: 1px solid #999; padding-bottom: 1mm; }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 6mm;
    }
    .header .left { flex: 1; }
    .meta { font-size: 10pt; line-height: 1.55; }
    .meta strong { display: inline-block; min-width: 30mm; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
    th, td { border: 1px solid #666; padding: 2mm 3mm; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; }
    .receipt-block {
      margin-top: 8mm;
      border: 2px solid #111;
      padding: 5mm;
      page-break-inside: avoid;
    }
    .signature-row {
      display: flex;
      gap: 6mm;
      margin-top: 5mm;
    }
    .signature-cell {
      flex: 1;
      border: 1px solid #999;
      padding: 3mm;
      min-height: 22mm;
    }
    .signature-cell .label {
      font-size: 9pt;
      color: #555;
      margin-bottom: 1.5mm;
    }
    .small { font-size: 9pt; color: #555; }
    .qr-area { text-align: right; }
    .qr-area img { width: 32mm; height: 32mm; border: 1px solid #ddd; padding: 1mm; }
    .qr-area .small { margin-top: 1mm; }
    .checklist td.tick { width: 8mm; text-align: center; }
    @media print {
      .no-print { display: none; }
    }
    .no-print {
      margin-top: 6mm;
      padding: 3mm;
      background: #fffbe6;
      border: 1px dashed #cc8;
      font-size: 10pt;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="left">
      <h1>Payment Memo — Cover Sheet</h1>
      <div class="meta">
        <div><strong>Transmittal No:</strong> <code>${row.transmittal_no}</code></div>
        <div><strong>Subject:</strong> ${escapeHtml(row.subject)}</div>
        <div><strong>Memo Date:</strong> ${row.date ? format(new Date(row.date), 'dd MMM yyyy') : '—'}</div>
        <div><strong>Department:</strong> ${escapeHtml(dept?.name || '—')}</div>
        <div><strong>Submitted by:</strong> ${escapeHtml(submitter?.full_name || '—')}${submitter?.job_title ? ` (${escapeHtml(submitter.job_title)})` : ''}</div>
        <div><strong>Printed on:</strong> ${today}</div>
      </div>
    </div>
    <div class="qr-area">
      <img src="${qrUrl}" alt="QR code linking to memo" />
      <div class="small">Scan to open memo<br/>${url}</div>
    </div>
  </div>

  <h2>Physical Bundle Checklist</h2>
  <p class="small">Tick each item as it is received and verified against the digital scan attached to the memo.</p>
  <table class="checklist">
    <thead>
      <tr><th class="tick">✓</th><th>Document type</th><th>Notes</th></tr>
    </thead>
    <tbody>
      <tr><td class="tick">☐</td><td>Original supplier invoice (stamped)</td><td>&nbsp;</td></tr>
      <tr><td class="tick">☐</td><td>Original delivery note(s)</td><td>&nbsp;</td></tr>
      <tr><td class="tick">☐</td><td>Goods received note (GRN)</td><td>&nbsp;</td></tr>
      <tr><td class="tick">☐</td><td>Purchase order copy</td><td>&nbsp;</td></tr>
      <tr><td class="tick">☐</td><td>Quotation(s)</td><td>&nbsp;</td></tr>
      <tr><td class="tick">☐</td><td>Vendor bank-account confirmation</td><td>&nbsp;</td></tr>
      <tr><td class="tick">☐</td><td>Other (specify):</td><td>&nbsp;</td></tr>
    </tbody>
  </table>

  <div class="receipt-block">
    <h2 style="margin-top:0;">Finance Reception — Receipt of Originals</h2>
    <p class="small">
      The bearer is delivering the original documents listed above for memo
      <strong>${row.transmittal_no}</strong>. Please verify against the digital scans (scan QR or visit the URL above) and stamp this section. Hand the stamped copy back to the bearer as proof of receipt.
    </p>
    <div class="signature-row">
      <div class="signature-cell">
        <div class="label">Received by (finance) — Name &amp; signature</div>
      </div>
      <div class="signature-cell">
        <div class="label">Date / time received</div>
      </div>
      <div class="signature-cell">
        <div class="label">Stamp</div>
      </div>
    </div>
  </div>

  <div class="no-print">
    <strong>Finance team:</strong> after marking the documents received in the system, file
    this stamped sheet with the original bundle. The bearer should keep the
    counterpart copy as proof of delivery.
  </div>

  <script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=820,height=1100');
  if (!w) {
    alert('Please allow popups to print the cover sheet.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
