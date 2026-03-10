import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchProfiles, fetchDepartments, getAttachmentSignedUrl } from '@/lib/memo-api';
import { notifyMemoStatus, notifyApprover } from '@/lib/email-notifications';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Printer, CheckCircle2, XCircle, Clock, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { MEMO_TYPE_OPTIONS } from '@/components/memo/TransmittedForGrid';
import SignaturePad from '@/components/memo/SignaturePad';
import SignedImage from '@/components/memo/SignedImage';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

type ActionType = 'approved' | 'rejected' | 'rework';

const statusIcons: Record<string, React.ReactNode> = {
  approved: <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />,
  rejected: <XCircle className="h-4 w-4 text-destructive" />,
  pending: <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />,
  rework: <RotateCcw className="h-4 w-4 text-accent" />,
};

const actionLabel: Record<ActionType, string> = {
  approved: 'Approve',
  rejected: 'Reject',
  rework: 'Request Rework',
};

const actionColor: Record<ActionType, string> = {
  approved: 'bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))]',
  rejected: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
  rework: 'bg-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/90 text-[hsl(var(--warning-foreground))]',
};

const MemoView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    stepId: string;
    action: ActionType;
  } | null>(null);
  const [comments, setComments] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'saved' | 'draw'>('saved');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

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

  // Find current user's pending step
  const myPendingStep = user
    ? approvalSteps.find((s) => s.approver_user_id === user.id && s.status === 'pending')
    : null;

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!actionDialog || !user || !id) return;
      const { stepId, action } = actionDialog;

      // Verify password
      const myProfile = getProfile(user.id);
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: myProfile?.email || user.email || '',
        password,
      });
      if (authError) {
        setPasswordError('Incorrect password. Please try again.');
        throw new Error('Password verification failed');
      }
      setPasswordError('');

      // Handle signature
      let signatureUrl: string | null = null;
      if (signatureDataUrl) {
        if (signatureDataUrl.startsWith('data:')) {
          const blob = await (await fetch(signatureDataUrl)).blob();
          const path = `${user.id}/${stepId}-approval.png`;
          const { error: uploadError } = await supabase.storage
            .from('signatures')
            .upload(path, blob, { upsert: true, contentType: 'image/png' });
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(path);
          signatureUrl = urlData.publicUrl;
        } else {
          signatureUrl = signatureDataUrl;
        }
      }

      // Update approval step
      const { error: stepError } = await supabase
        .from('approval_steps')
        .update({
          status: action,
          comments: comments || null,
          signed_at: new Date().toISOString(),
          password_verified: true,
          signature_image_url: signatureUrl,
        })
        .eq('id', stepId);
      if (stepError) throw stepError;

      // Update memo status
      if (action === 'approved') {
        const { data: allSteps } = await supabase
          .from('approval_steps')
          .select('*')
          .eq('memo_id', id)
          .order('step_order');

        const currentStep = allSteps?.find((s) => s.id === stepId);
        const nextStep = allSteps?.find(
          (s) => s.step_order > (currentStep?.step_order || 0) && s.status === 'pending'
        );

        if (nextStep) {
          await supabase
            .from('memos')
            .update({ current_step: nextStep.step_order, status: 'in_review' })
            .eq('id', id);

          // Notify next approver
          const nextProfile = getProfile(nextStep.approver_user_id);
          const creatorProfile = memo ? getProfile(memo.from_user_id) : null;
          if (nextProfile && memo) {
            notifyApprover({
              approverEmail: nextProfile.email,
              approverName: nextProfile.full_name,
              memoSubject: memo.subject,
              transmittalNo: memo.transmittal_no,
              fromName: creatorProfile?.full_name || 'Unknown',
              memoId: id,
            }).catch(console.warn);

            supabase.from('notifications').insert({
              user_id: nextStep.approver_user_id,
              memo_id: id,
              type: 'approval_request',
              message: `Memo ${memo.transmittal_no} — "${memo.subject}" requires your approval.`,
            }).then(({ error }) => { if (error) console.warn(error); });
          }
        } else {
          await supabase.from('memos').update({ status: 'approved' }).eq('id', id);
        }
      } else {
        const newStatus = action === 'rejected' ? 'rejected' : 'rework';
        await supabase.from('memos').update({ status: newStatus as any }).eq('id', id);
      }

      // Notify creator
      if (memo) {
        const creatorProfile = getProfile(memo.from_user_id);
        const approverProfile = getProfile(user.id);
        if (creatorProfile) {
          notifyMemoStatus({
            creatorEmail: creatorProfile.email,
            creatorName: creatorProfile.full_name,
            memoSubject: memo.subject,
            transmittalNo: memo.transmittal_no,
            status: action,
            approverName: approverProfile?.full_name || 'An approver',
            memoId: id,
          }).catch(console.warn);
        }
      }

      // Audit log
      await supabase.from('audit_log').insert({
        memo_id: id,
        user_id: user.id,
        action: `memo_${action}`,
        details: { comments: comments || null },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memo', id] });
      queryClient.invalidateQueries({ queryKey: ['approval-steps', id] });
      queryClient.invalidateQueries({ queryKey: ['my-approval-steps'] });
      toast({
        title: actionDialog?.action === 'approved' ? 'Memo Approved' :
               actionDialog?.action === 'rejected' ? 'Memo Rejected' : 'Rework Requested',
      });
      resetDialog();
    },
    onError: (e: Error) => {
      if (e.message !== 'Password verification failed') {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      }
    },
  });

  const resetDialog = () => {
    setActionDialog(null);
    setComments('');
    setSignatureDataUrl(null);
    setPassword('');
    setPasswordError('');
    setSignatureMode('saved');
  };

  const openApproveDialog = (stepId: string) => {
    const myProfile = user ? getProfile(user.id) : null;
    if (myProfile?.signature_image_url) {
      setSignatureMode('saved');
      setSignatureDataUrl(myProfile.signature_image_url);
    } else {
      setSignatureMode('draw');
      setSignatureDataUrl(null);
    }
    setActionDialog({ stepId, action: 'approved' });
  };

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

      {/* Action Bar */}
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
        <div className="flex items-center gap-2">
          {/* Approval Action Buttons */}
          {myPendingStep && (
            <>
              <Button
                size="sm"
                className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))]"
                onClick={() => openApproveDialog(myPendingStep.id)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setActionDialog({ stepId: myPendingStep.id, action: 'rejected' })}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActionDialog({ stepId: myPendingStep.id, action: 'rework' })}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Rework
              </Button>
            </>
          )}
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Printable Area */}
      <div className="print-area max-w-4xl mx-auto">
        {/* Status badge - only on screen */}
        <div className="no-print flex justify-end mb-2">
          <Badge
            className={`capitalize ${
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

        <div className="border border-foreground/30 bg-card print-border">
          {/* ── HEADER: Logo + Title ── */}
          <div className="flex items-end justify-between px-6 pt-6 pb-4">
            <img src={alHamraLogo} alt="Al Hamra Logo" className="h-20 w-auto object-contain" />
            <div className="text-right">
              <h2 className="text-3xl font-bold tracking-wide text-foreground">INTERNAL MEMO</h2>
              <div className="h-0.5 bg-destructive mt-1" />
            </div>
          </div>

          {/* ── TO / TRANSMITTAL NO / DATE / FROM + TRANSMITTED FOR ── */}
          <div className="border-t border-foreground/30">
            {/* Row 1: TO | TRANSMITTAL NO */}
            <div className="grid grid-cols-2">
              <div className="border-r border-b border-foreground/30 p-3">
                <p className="text-xs text-muted-foreground">TO:</p>
                <p className="text-sm font-bold mt-1">
                  {toProfile?.full_name || '—'}
                </p>
                {toProfile?.job_title && (
                  <p className="text-sm">{toProfile.job_title}</p>
                )}
              </div>
              <div className="border-b border-foreground/30">
                <div className="grid grid-cols-[auto_1fr]">
                  <div className="bg-destructive text-destructive-foreground px-3 py-3 text-xs font-bold flex items-center">
                    TRANSMITTAL NO:
                  </div>
                  <div className="px-3 py-3 flex items-center">
                    <p className="text-sm font-bold font-mono">{memo.transmittal_no}</p>
                  </div>
                </div>
                <div className="grid grid-cols-[auto_1fr] border-t border-foreground/30">
                  <div className="bg-destructive text-destructive-foreground px-3 py-3 text-xs font-bold flex items-center">
                    DATE:
                  </div>
                  <div className="px-3 py-3 flex items-center">
                    <p className="text-sm font-medium">{format(new Date(memo.date), "do MMMM yyyy")}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: FROM | TRANSMITTED FOR */}
            <div className="grid grid-cols-2">
              <div className="border-r border-b border-foreground/30 p-3">
                <p className="text-xs text-muted-foreground">FROM:</p>
                <p className="text-sm font-bold mt-2">
                  {fromProfile?.full_name || '—'}
                </p>
                {fromProfile?.job_title && (
                  <p className="text-sm">{fromProfile.job_title}</p>
                )}
                {dept && <p className="text-xs text-muted-foreground">{dept.name}</p>}
              </div>
              <div className="border-b border-foreground/30 p-3">
                <p className="text-xs font-bold text-center uppercase tracking-wider mb-2">Transmitted For</p>
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                  {MEMO_TYPE_OPTIONS.map((opt) => (
                    <div key={opt.value} className="flex items-center gap-1.5 text-xs">
                      <span className={`w-3.5 h-3.5 border flex items-center justify-center text-[10px] shrink-0 ${
                        memo.memo_types.includes(opt.value)
                          ? 'border-foreground'
                          : 'border-foreground/40'
                      }`}>
                        {memo.memo_types.includes(opt.value) ? '✕' : ''}
                      </span>
                      <span className="uppercase text-[11px]">{opt.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── SUBJECT ── */}
          <div className="border-b border-foreground/30 px-4 py-2.5">
            <p className="text-sm">
              <span className="font-bold">Subject: </span>
              <span className="font-bold">{memo.subject}</span>
            </p>
          </div>

          {/* ── DESCRIPTION ── */}
          <div className="border-b border-foreground/30 px-4 py-3">
            <p className="text-xs font-bold uppercase mb-2">Description:</p>
            <div
              className="prose prose-sm max-w-none text-foreground"
              dangerouslySetInnerHTML={{ __html: memo.description || '<p>No description.</p>' }}
            />

            {/* Sender Signature - right aligned */}
            <div className="flex justify-end mt-8 mb-4">
              <div className="text-center">
                {fromProfile?.signature_image_url ? (
                  <SignedImage
                    storagePath={fromProfile.signature_image_url}
                    alt="Sender signature"
                    className="h-16 mb-1 object-contain mx-auto"
                    fallback={<p className="border-b border-foreground inline-block w-48 pb-1 mb-1">&nbsp;</p>}
                  />
                ) : (
                  <p className="border-b border-foreground inline-block w-48 pb-1 mb-1">&nbsp;</p>
                )}
                <p className="text-sm font-bold">
                  {fromProfile?.full_name}, {fromProfile?.job_title}
                </p>
              </div>
            </div>

            {/* Continuation pages / Attachments / Initials row */}
            <div className="flex items-center justify-center gap-8 text-xs mt-4 pt-2 border-t border-foreground/20">
              <span>No. of Continuation Pages: <strong>{String(memo.continuation_pages || 0).padStart(2, '0')}</strong></span>
              <span>No. of Attachments: <strong>{String(attachments.length).padStart(2, '0')}</strong></span>
              <span className="font-bold">{memo.initials || ''}</span>
            </div>
          </div>

          {/* ── COPIES TO ── */}
          <div className="grid grid-cols-[140px_1fr] border-b border-foreground/30">
            <div className="px-3 py-2 text-xs font-bold border-r border-foreground/30">COPIES TO:</div>
            <div className="px-3 py-2 text-sm">{memo.copies_to?.join(', ') || ''}</div>
          </div>

          {/* ── ACTION REQUIRED / COMMENTS ── */}
          <div className="grid grid-cols-[140px_1fr] border-b border-foreground/30">
            <div className="px-3 py-2 text-xs font-bold border-r border-foreground/30">
              <p>ACTION REQUIRED:</p>
              <p className="mt-1">COMMENTS IF ANY:</p>
            </div>
            <div className="px-3 py-2 text-sm">
              {approvalSteps
                .filter((s) => s.comments)
                .map((s) => {
                  const approver = getProfile(s.approver_user_id);
                  return (
                    <p key={s.id} className="text-xs mb-1">
                      <span className="font-medium">{approver?.full_name}:</span> {s.comments}
                    </p>
                  );
                })}
            </div>
          </div>

          {/* ── APPROVALS ── */}
          {approvalSteps.length > 0 && (
            <div className="mt-4 mx-4 mb-4">
              {/* Red header bar */}
              <div className="bg-destructive text-destructive-foreground text-center py-2 font-bold text-lg tracking-widest uppercase">
                Approvals
              </div>
              {/* Signature columns */}
              <div className="grid grid-cols-3 border border-t-0 border-foreground/30">
                {approvalSteps.map((step) => {
                  const approver = getProfile(step.approver_user_id);
                  return (
                    <div
                      key={step.id}
                      className="border-r last:border-r-0 border-foreground/30 p-3 flex flex-col justify-between min-h-[120px]"
                    >
                      {/* Status indicator - screen only */}
                      <div className="no-print flex items-center gap-1 text-[10px] capitalize mb-1">
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

                      {/* Signature area */}
                      <div className="flex-1 flex items-center justify-center">
                        {step.signature_image_url ? (
                          <SignedImage
                            storagePath={step.signature_image_url}
                            alt={`${approver?.full_name || 'Approver'} signature`}
                            className="h-14 object-contain"
                            fallback={
                              step.status === 'approved'
                                ? <p className="text-[10px] italic text-muted-foreground">[Digitally Approved]</p>
                                : null
                            }
                          />
                        ) : step.status === 'approved' ? (
                          <p className="text-[10px] italic text-muted-foreground">[Digitally Approved]</p>
                        ) : null}
                      </div>

                      {/* Label & Date */}
                      <div className="border-t border-foreground/20 pt-1 mt-2">
                        <p className="text-xs font-bold break-words leading-tight">
                          {approver?.full_name || 'Unknown'}{approver?.job_title ? ` – ${approver.job_title}` : ''}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">– SIGNATURE</p>
                        <p className="text-xs mt-0.5">
                          <span className="font-bold">Date: </span>
                          {step.signed_at ? format(new Date(step.signed_at), 'dd/MM/yyyy') : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── RECEIVING PARTY STAMP ── */}
          <div className="mx-4 mb-4">
            <div className="grid grid-cols-[120px_1fr] border border-foreground/30 bg-secondary/30">
              <div className="px-3 py-6 text-xs font-bold text-center border-r border-foreground/30">
                <p>RECEIVING</p>
                <p>PARTY</p>
                <p>STAMP</p>
              </div>
              <div className="min-h-[80px]" />
            </div>
          </div>

          {/* ── Attachments (screen only) ── */}
          {attachments.length > 0 && (
            <div className="no-print px-4 pb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Attachments
              </p>
              <ul className="space-y-1 text-sm">
                {attachments.map((att) => (
                  <li key={att.id} className="flex items-center gap-2">
                    <span>📎</span>
                    <button
                      onClick={async () => {
                        try {
                          const url = await getAttachmentSignedUrl(att.file_url);
                          window.open(url, '_blank');
                        } catch (e) {
                          toast({ title: 'Error opening attachment', variant: 'destructive' });
                        }
                      }}
                      className="text-primary underline text-left hover:text-primary/80"
                    >
                      {att.file_name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Document Footer ── */}
          <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-foreground/10">
            <p>HRA 09/00/T/I/01</p>
            <p>Version 1.3</p>
            <p>For Internal Use</p>
          </div>
        </div>
      </div>

      {/* Action Confirmation Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) resetDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionDialog && actionLabel[actionDialog.action]} Memo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {actionDialog && (
              <p className="text-sm text-muted-foreground">
                {actionDialog.action === 'approved'
                  ? 'You are about to approve this memo. Please sign below.'
                  : actionDialog.action === 'rejected'
                  ? 'You are about to reject this memo. Please provide a reason below.'
                  : 'You are requesting the sender to rework this memo. Please explain what needs to change.'}
              </p>
            )}

            {/* Signature section for approve */}
            {actionDialog?.action === 'approved' && (() => {
              const myProfile = user ? getProfile(user.id) : null;
              const hasSavedSig = !!myProfile?.signature_image_url;
              return (
                <div className="space-y-3">
                  <Label>Your Signature <span className="text-destructive">*</span></Label>
                  {hasSavedSig && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={signatureMode === 'saved' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSignatureMode('saved');
                          setSignatureDataUrl(myProfile!.signature_image_url);
                        }}
                      >
                        Use Saved Signature
                      </Button>
                      <Button
                        type="button"
                        variant={signatureMode === 'draw' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSignatureMode('draw');
                          setSignatureDataUrl(null);
                        }}
                      >
                        Draw Signature
                      </Button>
                    </div>
                  )}
                  {signatureMode === 'saved' && hasSavedSig ? (
                    <div className="border border-input rounded-md p-4 bg-white flex items-center justify-center">
                      <SignedImage
                        storagePath={myProfile!.signature_image_url!}
                        alt="Your saved signature"
                        className="max-h-24 object-contain"
                      />
                    </div>
                  ) : (
                    <SignaturePad onSignatureChange={setSignatureDataUrl} />
                  )}
                </div>
              );
            })()}

            {/* Password */}
            <div className="space-y-2">
              <Label>Login Password <span className="text-destructive">*</span></Label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                placeholder="Enter your login password to confirm"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <Label>
                Comments{' '}
                {actionDialog?.action !== 'approved' && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={
                  actionDialog?.action === 'approved'
                    ? 'Optional comments...'
                    : 'Provide reason or feedback...'
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancel</Button>
            <Button
              className={actionDialog ? actionColor[actionDialog.action] : ''}
              disabled={
                actionMutation.isPending ||
                !password.trim() ||
                (actionDialog?.action === 'approved' && !signatureDataUrl) ||
                (actionDialog?.action !== 'approved' && !comments.trim())
              }
              onClick={() => actionMutation.mutate()}
            >
              {actionMutation.isPending ? 'Processing...' : actionDialog ? actionLabel[actionDialog.action] : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MemoView;
