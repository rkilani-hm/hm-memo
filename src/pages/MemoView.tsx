import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Printer, CheckCircle2, XCircle, Clock, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { MEMO_TYPE_OPTIONS } from '@/components/memo/TransmittedForGrid';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

const statusIcons: Record<string, React.ReactNode> = {
  approved: <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />,
  rejected: <XCircle className="h-4 w-4 text-destructive" />,
  pending: <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />,
  rework: <RotateCcw className="h-4 w-4 text-accent" />,
};

const MemoView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: memo, isLoading: memoLoading } = useQuery({
    queryKey: ['memo', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memos')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: approvalSteps = [] } = useQuery({
    queryKey: ['approval-steps', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_steps')
        .select('*')
        .eq('memo_id', id!)
        .order('step_order');
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['memo-attachments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memo_attachments')
        .select('*')
        .eq('memo_id', id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const getProfile = (userId: string) => profiles.find((p) => p.user_id === userId);
  const getDept = (deptId: string) => departments.find((d) => d.id === deptId);

  const handlePrint = () => window.print();

  if (memoLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading memo...</div>;
  }

  if (!memo) {
    return <div className="p-8 text-center text-muted-foreground">Memo not found.</div>;
  }

  const fromProfile = getProfile(memo.from_user_id);
  const toProfile = memo.to_user_id ? getProfile(memo.to_user_id) : null;
  const dept = getDept(memo.department_id);
  const selectedTypes = MEMO_TYPE_OPTIONS.filter((o) => memo.memo_types.includes(o.value));

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20mm; }
          .no-print { display: none !important; }
          .print-area .print-border { border: 1px solid #000 !important; }
        }
      `}</style>

      {/* Action Bar - hidden on print */}
      <div className="no-print flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Memo Details</h1>
            <p className="text-sm text-muted-foreground">{memo.transmittal_no}</p>
          </div>
        </div>
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print Memo
        </Button>
      </div>

      {/* Printable Area */}
      <div className="print-area max-w-4xl mx-auto">
        <Card className="border-2 print-border">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={alHamraLogo} alt="Al Hamra Logo" className="h-14 w-auto object-contain" />
                <div>
                  <CardTitle className="text-lg">Al Hamra Real Estate Co.</CardTitle>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Internal Transmittal Memorandum
                  </p>
                </div>
              </div>
              <Badge
                className={`no-print capitalize ${
                  memo.status === 'approved'
                    ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
                    : memo.status === 'rejected'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {memo.status.replace('_', ' ')}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Header Table */}
            <div className="border border-input rounded-md overflow-hidden print-border">
              <div className="grid grid-cols-2 divide-x divide-y divide-input">
                <div className="p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">TO</p>
                  <p className="text-sm font-medium">
                    {toProfile ? `${toProfile.full_name} — ${toProfile.job_title || ''}` : '—'}
                  </p>
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Transmittal No</p>
                  <p className="text-sm font-mono font-medium">{memo.transmittal_no}</p>
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Date</p>
                  <p className="text-sm font-medium">{format(new Date(memo.date), "dd/MM/yyyy")}</p>
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground">From</p>
                  <p className="text-sm font-medium">
                    {fromProfile ? `${fromProfile.full_name} — ${fromProfile.job_title || ''}` : '—'}
                  </p>
                  {dept && <p className="text-xs text-muted-foreground">{dept.name}</p>}
                </div>
              </div>
            </div>

            <Separator />

            {/* Transmitted For */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Transmitted For
              </p>
              <div className="grid grid-cols-3 gap-2 p-3 border border-input rounded-md print-border">
                {MEMO_TYPE_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2 text-sm">
                    <span className={`w-4 h-4 border rounded flex items-center justify-center text-xs ${
                      memo.memo_types.includes(opt.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-input'
                    }`}>
                      {memo.memo_types.includes(opt.value) ? '✓' : ''}
                    </span>
                    <span className="font-medium">{opt.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Subject */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1">Subject</p>
              <p className="text-base font-semibold">{memo.subject}</p>
            </div>

            <Separator />

            {/* Description */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</p>
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: memo.description || '<p>No description.</p>' }}
              />
            </div>

            {/* Sender Signature */}
            <div className="pt-4 border-t border-input">
              <div className="text-sm">
                {fromProfile?.signature_image_url ? (
                  <img
                    src={fromProfile.signature_image_url}
                    alt="Sender signature"
                    className="h-16 mb-1"
                  />
                ) : (
                  <p className="border-b border-foreground inline-block w-60 pb-1 mb-1">&nbsp;</p>
                )}
                <p className="font-medium">
                  {fromProfile?.full_name}, {fromProfile?.job_title}
                </p>
              </div>
            </div>

            <Separator />

            {/* Footer Fields */}
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Continuation Pages</p>
                <p>{memo.continuation_pages || 0}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Attachments</p>
                <p>{attachments.length}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Initials</p>
                <p>{memo.initials || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Copies To</p>
                <p>{memo.copies_to?.join(', ') || '—'}</p>
              </div>
            </div>

            {/* Approval Signatures Section */}
            {approvalSteps.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                    Approval Signatures
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {approvalSteps.map((step) => {
                      const approver = getProfile(step.approver_user_id);
                      return (
                        <div
                          key={step.id}
                          className="border border-input rounded-md p-4 print-border"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold uppercase text-muted-foreground">
                              Step {step.step_order}
                            </p>
                            <div className="flex items-center gap-1 text-xs capitalize">
                              {statusIcons[step.status]}
                              <span className={
                                step.status === 'approved' ? 'text-[hsl(var(--success))]' :
                                step.status === 'rejected' ? 'text-destructive' :
                                step.status === 'pending' ? 'text-[hsl(var(--warning))]' :
                                'text-accent'
                              }>
                                {step.status}
                              </span>
                            </div>
                          </div>

                          {/* Signature Image */}
                          <div className="min-h-[64px] mb-2 flex items-end">
                            {step.signature_image_url ? (
                              <img
                                src={step.signature_image_url}
                                alt={`${approver?.full_name || 'Approver'} signature`}
                                className="h-16 object-contain"
                              />
                            ) : step.status === 'approved' ? (
                              <p className="text-xs italic text-muted-foreground">[Digitally Approved]</p>
                            ) : (
                              <p className="border-b border-foreground inline-block w-full pb-1">&nbsp;</p>
                            )}
                          </div>

                          <p className="text-sm font-medium">
                            {approver?.full_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {approver?.job_title || ''}
                          </p>
                          {step.signed_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Signed: {format(new Date(step.signed_at), 'dd MMM yyyy, HH:mm')}
                            </p>
                          )}
                          {step.comments && (
                            <p className="text-xs mt-2 italic border-l-2 border-accent pl-2">
                              {step.comments}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Attachments List */}
            {attachments.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Attachments
                  </p>
                  <ul className="space-y-1 text-sm">
                    {attachments.map((att) => (
                      <li key={att.id} className="flex items-center gap-2">
                        <span>📎</span>
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline no-print"
                        >
                          {att.file_name}
                        </a>
                        <span className="print-only hidden">{att.file_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default MemoView;
