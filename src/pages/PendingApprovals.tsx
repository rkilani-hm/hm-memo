import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchProfiles, fetchDepartments } from '@/lib/memo-api';
import { notifyMemoStatus, notifyApprover } from '@/lib/email-notifications';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import SignaturePad from '@/components/memo/SignaturePad';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Eye,
  Clock,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';

type ActionType = 'approved' | 'rejected' | 'rework';

const PendingApprovals = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [actionDialog, setActionDialog] = useState<{
    stepId: string;
    memoId: string;
    action: ActionType;
  } | null>(null);
  const [comments, setComments] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'saved' | 'draw'>('saved');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  // Fetch approval steps assigned to current user
  const { data: mySteps = [], isLoading } = useQuery({
    queryKey: ['my-approval-steps', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_steps')
        .select('*')
        .eq('approver_user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch memos for these steps
  const memoIds = [...new Set(mySteps.map((s) => s.memo_id))];
  const { data: memos = [] } = useQuery({
    queryKey: ['approval-memos', memoIds],
    queryFn: async () => {
      if (memoIds.length === 0) return [];
      const { data, error } = await supabase
        .from('memos')
        .select('*')
        .in('id', memoIds);
      if (error) throw error;
      return data;
    },
    enabled: memoIds.length > 0,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const getMemo = (memoId: string) => memos.find((m) => m.id === memoId);
  const getProfile = (userId: string) => profiles.find((p) => p.user_id === userId);
  const getDept = (deptId: string) => departments.find((d) => d.id === deptId);

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!actionDialog || !user) return;

      const { stepId, memoId, action } = actionDialog;

      // Verify password by re-authenticating
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

      // Handle signature: use saved URL directly or upload drawn signature
      let signatureUrl: string | null = null;
      if (signatureDataUrl) {
        if (signatureDataUrl.startsWith('data:')) {
          // Drawn signature - upload to storage
          const blob = await (await fetch(signatureDataUrl)).blob();
          const path = `${user.id}/${stepId}-approval.png`;
          const { error: uploadError } = await supabase.storage
            .from('signatures')
            .upload(path, blob, { upsert: true, contentType: 'image/png' });
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(path);
          signatureUrl = urlData.publicUrl;
        } else {
          // Saved profile signature URL
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

      const memo = getMemo(memoId);
      let nextApproverStep: any = null;

      // Update memo status based on action
      if (action === 'approved') {
        const { data: allSteps } = await supabase
          .from('approval_steps')
          .select('*')
          .eq('memo_id', memoId)
          .order('step_order');

        const currentStep = allSteps?.find((s) => s.id === stepId);
        const nextStep = allSteps?.find(
          (s) => s.step_order > (currentStep?.step_order || 0) && s.status === 'pending'
        );

        if (nextStep) {
          await supabase
            .from('memos')
            .update({ current_step: nextStep.step_order, status: 'in_review' })
            .eq('id', memoId);
          nextApproverStep = nextStep;
        } else {
          await supabase
            .from('memos')
            .update({ status: 'approved' })
            .eq('id', memoId);
        }
      } else {
        const newMemoStatus = action === 'rejected' ? 'rejected' : 'rework';
        await supabase
          .from('memos')
          .update({ status: newMemoStatus as any })
          .eq('id', memoId);
      }

      // Audit log
      await supabase.from('audit_log').insert({
        memo_id: memoId,
        user_id: user.id,
        action: `memo_${action}`,
        details: { comments: comments || null },
      });

      // Send email notifications (non-blocking)
      if (memo) {
        const approverProfile = getProfile(user.id);
        const creatorProfile = getProfile(memo.from_user_id);

        // Notify memo creator of approval/rejection/rework
        if (creatorProfile) {
          notifyMemoStatus({
            creatorEmail: creatorProfile.email,
            creatorName: creatorProfile.full_name,
            memoSubject: memo.subject,
            transmittalNo: memo.transmittal_no,
            status: action,
            approverName: approverProfile?.full_name || 'An approver',
            memoId,
          }).catch((err) => console.warn('Email to creator failed:', err));
        }

        // If approved and there's a next approver, notify them
        if (action === 'approved' && nextApproverStep) {
          const nextProfile = getProfile(nextApproverStep.approver_user_id);
          if (nextProfile) {
            notifyApprover({
              approverEmail: nextProfile.email,
              approverName: nextProfile.full_name,
              memoSubject: memo.subject,
              transmittalNo: memo.transmittal_no,
              fromName: creatorProfile?.full_name || 'Unknown',
              memoId,
            }).catch((err) => console.warn('Email to next approver failed:', err));

            // Also create in-app notification for next approver
            supabase.from('notifications').insert({
              user_id: nextApproverStep.approver_user_id,
              memo_id: memoId,
              type: 'approval_request',
              message: `Memo ${memo.transmittal_no} — "${memo.subject}" requires your approval.`,
            }).then(({ error }) => { if (error) console.warn('Notification insert failed:', error); });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-approval-steps'] });
      queryClient.invalidateQueries({ queryKey: ['approval-memos'] });
      toast({
        title: actionDialog?.action === 'approved' ? 'Memo Approved' :
               actionDialog?.action === 'rejected' ? 'Memo Rejected' : 'Rework Requested',
      });
      setActionDialog(null);
      setComments('');
      setSignatureDataUrl(null);
    },
    onError: (e: Error) =>
      toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const pendingSteps = mySteps.filter((s) => s.status === 'pending');
  const completedSteps = mySteps.filter((s) => s.status !== 'pending');

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pending Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review and take action on memos assigned to you
        </p>
      </div>

      {/* Pending Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
            Awaiting Your Action ({pendingSteps.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : pendingSteps.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No pending approvals. You're all caught up! 🎉
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transmittal No.</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSteps.map((step) => {
                  const memo = getMemo(step.memo_id);
                  if (!memo) return null;
                  const from = getProfile(memo.from_user_id);
                  const dept = getDept(memo.department_id);
                  return (
                    <TableRow key={step.id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {memo.transmittal_no}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {memo.subject}
                      </TableCell>
                      <TableCell>{from?.full_name || '—'}</TableCell>
                      <TableCell>{dept?.name || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(memo.created_at), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View memo"
                            onClick={() => navigate(`/memos/${memo.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))] h-8"
                            onClick={() => {
                              const myProfile = user ? getProfile(user.id) : null;
                              if (myProfile?.signature_image_url) {
                                setSignatureMode('saved');
                                setSignatureDataUrl(myProfile.signature_image_url);
                              } else {
                                setSignatureMode('draw');
                                setSignatureDataUrl(null);
                              }
                              setActionDialog({
                                stepId: step.id,
                                memoId: step.memo_id,
                                action: 'approved',
                              });
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8"
                            onClick={() =>
                              setActionDialog({
                                stepId: step.id,
                                memoId: step.memo_id,
                                action: 'rejected',
                              })
                            }
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() =>
                              setActionDialog({
                                stepId: step.id,
                                memoId: step.memo_id,
                                action: 'rework',
                              })
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Rework
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Completed History */}
      {completedSteps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Your Previous Actions ({completedSteps.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transmittal No.</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Your Action</TableHead>
                  <TableHead>Date Signed</TableHead>
                  <TableHead>Comments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedSteps.map((step) => {
                  const memo = getMemo(step.memo_id);
                  return (
                    <TableRow
                      key={step.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => memo && navigate(`/memos/${memo.id}`)}
                    >
                      <TableCell className="font-mono text-sm">
                        {memo?.transmittal_no || '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {memo?.subject || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`capitalize ${
                            step.status === 'approved'
                              ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
                              : step.status === 'rejected'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]'
                          }`}
                        >
                          {step.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {step.signed_at
                          ? format(new Date(step.signed_at), 'dd MMM yyyy, HH:mm')
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {step.comments || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Action Confirmation Dialog */}
      <Dialog
        open={!!actionDialog}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog(null);
            setComments('');
            setSignatureDataUrl(null);
          }
        }}
      >
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

            {/* Signature - shown for approve action */}
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
                      <img
                        src={myProfile!.signature_image_url!}
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

            {/* Password Verification */}
            <div className="space-y-2">
              <Label>
                Login Password <span className="text-destructive">*</span>
              </Label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Enter your login password to confirm"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Comments{' '}
                {actionDialog?.action !== 'approved' && (
                  <span className="text-destructive">*</span>
                )}
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
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog(null);
                setComments('');
                setSignatureDataUrl(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className={actionDialog ? actionColor[actionDialog.action] : ''}
              disabled={
                actionMutation.isPending ||
                (actionDialog?.action === 'approved' && !signatureDataUrl) ||
                (actionDialog?.action !== 'approved' && !comments.trim())
              }
              onClick={() => actionMutation.mutate()}
            >
              {actionMutation.isPending
                ? 'Processing...'
                : actionDialog
                ? actionLabel[actionDialog.action]
                : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingApprovals;
