import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { notifyMemoStatus, notifyApprover } from '@/lib/email-notifications';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
                  <SignedImage
                    storagePath={fromProfile.signature_image_url}
                    alt="Sender signature"
                    className="h-16 mb-1 object-contain"
                    fallback={<p className="border-b border-foreground inline-block w-60 pb-1 mb-1">&nbsp;</p>}
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
                              <SignedImage
                                storagePath={step.signature_image_url}
                                alt={`${approver?.full_name || 'Approver'} signature`}
                                className="h-16 object-contain"
                                fallback={
                                  step.status === 'approved'
                                    ? <p className="text-xs italic text-muted-foreground">[Digitally Approved]</p>
                                    : <p className="border-b border-foreground inline-block w-full pb-1">&nbsp;</p>
                                }
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
                              Signed: {format(new Date(step.signed_at), 'dd/MM/yyyy, HH:mm')}
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
