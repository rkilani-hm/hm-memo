import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchProfiles, fetchDepartments, getAttachmentSignedUrl } from '@/lib/memo-api';
import { notifyMemoStatus, notifyApprover } from '@/lib/email-notifications';
import { collectDeviceInfo, getClientIp, resolveIpGeolocation } from '@/lib/device-info';
import { generateMemoPdf, prepareMemoData, type PrintPreferences, DEFAULT_PRINT_PREFERENCES } from '@/lib/memo-pdf';
import { buildMemoHtml } from '@/lib/memo-pdf-html';
import { saveApprovedMemoToSharePoint } from '@/lib/sharepoint-save';
import { buildAuthFactors } from '@/lib/audit-auth-factors';
import PrintPreviewDialog from '@/components/memo/PrintPreviewDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Printer, CheckCircle2, XCircle, Clock, RotateCcw, Pen, Type, FileDown, Edit, Undo2, Trash2, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { MEMO_TYPE_OPTIONS } from '@/components/memo/TransmittedForGrid';
import SignaturePad from '@/components/memo/SignaturePad';
import SignedImage from '@/components/memo/SignedImage';
import MfaStepUp from '@/components/memo/MfaStepUp';
import AuditTrailTab from '@/components/memo/AuditTrailTab';
import VersionHistory from '@/components/memo/VersionHistory';
import ManualRegistrationPanel from '@/components/memo/ManualRegistrationPanel';
import WorkflowTracker from '@/components/memo/WorkflowTracker';
import AiApprovalSummary from '@/components/memo/AiApprovalSummary';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';



type ActionType = 'approved' | 'rejected' | 'rework';
type StepActionType = 'signature' | 'initial';

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

const stepActionIcons: Record<StepActionType, React.ReactNode> = {
  signature: <Pen className="h-3 w-3" />,
  initial: <Type className="h-3 w-3" />,
};

const stepActionLabels: Record<StepActionType, string> = {
  signature: 'Approve',
  initial: 'Initial',
};

const MemoView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [actionDialog, setActionDialog] = useState<{
    stepId: string;
    action: ActionType;
    stepActionType: StepActionType;
  } | null>(null);
  const [comments, setComments] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'saved' | 'draw'>('saved');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);

  // Fetch fraud-settings to know if MFA is required for payment memos
  const { data: fraudPolicy } = useQuery({
    queryKey: ['fraud-policy'],
    queryFn: async () => {
      const { data } = await supabase
        .from('fraud_settings' as any)
        .select('mfa_required_for_payments, mfa_required_for_high_risk, block_high_severity')
        .eq('id', 1)
        .maybeSingle();
      return (data as any) || {
        mfa_required_for_payments: false,
        mfa_required_for_high_risk: false,
        block_high_severity: false,
      };
    },
  });

  const { data: memo, isLoading: memoLoading } = useQuery({
    queryKey: ['memo', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('memos').select('*').eq('id', id!).single();
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
      const { data, error } = await supabase.from('memo_attachments').select('*').eq('memo_id', id!);
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

  // Fetch workflow template pdf_layout for this memo
  // If memo has a direct template_id, use it; otherwise fallback to department's template
  const { data: workflowTemplate } = useQuery({
    queryKey: ['memo-workflow-template', (memo as any)?.workflow_template_id, memo?.department_id],
    queryFn: async () => {
      const templateId = (memo as any)?.workflow_template_id;
      if (templateId) {
        const { data, error } = await supabase
          .from('workflow_templates')
          .select('*')
          .eq('id', templateId)
          .maybeSingle();
        if (error) throw error;
        if (data) return data;
      }
      // Fallback: find template by department
      if (memo?.department_id) {
        const { data, error } = await supabase
          .from('workflow_templates')
          .select('*')
          .eq('department_id', memo.department_id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      }
      return null;
    },
    enabled: !!memo,
  });

  const { data: delegateAssignments = [] } = useQuery({
    queryKey: ['my-delegate-assignments', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delegate_assignments')
        .select('*')
        .eq('delegate_user_id', user!.id)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const getProfile = (userId: string) => profiles.find((p) => p.user_id === userId);
  const getDept = (deptId: string) => departments.find((d) => d.id === deptId);

  const myPendingStep = user
    ? approvalSteps.find((s) => s.approver_user_id === user.id && s.status === 'pending')
    : null;

  const getStepActionType = (step: any): StepActionType => {
    return (step as any).action_type || 'signature';
  };

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!actionDialog || !user || !id) return;
      const { stepId, action, stepActionType } = actionDialog;

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

      // MFA gate: for payment memos with MFA policy, refuse to apply signature
      // unless the verify-mfa-and-sign edge function has already set
      // mfa_verified=true on this step (which the MfaStepUp UI does).
      const isPayment = !!memo?.memo_types?.includes('payments');
      const mfaRequired = isPayment && !!fraudPolicy?.mfa_required_for_payments;
      if (action === 'approved' && mfaRequired && !mfaVerified) {
        throw new Error('Microsoft Authenticator MFA is required before signing this payment memo.');
      }

      // Handle signature/initials based on step action type
      let signatureUrl: string | null = null;
      if (stepActionType === 'signature' && signatureDataUrl) {
        if (signatureDataUrl.startsWith('data:')) {
          const blob = await (await fetch(signatureDataUrl)).blob();
          const path = `${user.id}/${stepId}-approval.png`;
          const { error: uploadError } = await supabase.storage
            .from('signatures')
            .upload(path, blob, { upsert: true, contentType: 'image/png' });
          if (uploadError) throw uploadError;
          signatureUrl = path;
        } else {
          signatureUrl = signatureDataUrl;
        }
      } else if (stepActionType === 'initial' && signatureDataUrl) {
        if (signatureDataUrl.startsWith('data:')) {
          const blob = await (await fetch(signatureDataUrl)).blob();
          const path = `${user.id}/${stepId}-initials.png`;
          const { error: uploadError } = await supabase.storage
            .from('signatures')
            .upload(path, blob, { upsert: true, contentType: 'image/png' });
          if (uploadError) throw uploadError;
          signatureUrl = path;
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
          signing_method: signatureUrl ? 'digital' : null,
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
        const currentGroup = (currentStep as any)?.parallel_group;

        // Treat the step we just approved as approved for the purposes of the
        // "is the memo done?" check (the SELECT above may not yet reflect our
        // own UPDATE because of read-after-write timing).
        const stepsAfterUpdate = (allSteps || []).map((s) =>
          s.id === stepId ? { ...s, status: 'approved' } : s,
        );

        // Memo is fully approved ONLY when no required step is still pending.
        // Without this check, a later-step approver clicking before earlier
        // approvers would prematurely mark the memo as approved.
        const anyRequiredPending = stepsAfterUpdate.some(
          (s) => s.is_required && s.status === 'pending',
        );

        // Check if all parallel group members are done
        let groupComplete = true;
        if (currentGroup !== null && currentGroup !== undefined) {
          const groupSteps = allSteps?.filter((s) => (s as any).parallel_group === currentGroup) || [];
          groupComplete = groupSteps.every((s) => s.id === stepId || s.status !== 'pending');
        }

        if (groupComplete) {
          const nextStep = allSteps?.find(
            (s) => s.step_order > (currentStep?.step_order || 0) && s.status === 'pending'
            && ((s as any).parallel_group === null || (s as any).parallel_group !== currentGroup)
          );

          // Decide: are there *any* required steps still pending? If yes, the
          // memo cannot be finalised — even if no later step exists (out-of-
          // order approval case).
          if (anyRequiredPending) {
            // Find the lowest pending step to surface as current_step
            const lowestPending = stepsAfterUpdate
              .filter((s) => s.status === 'pending')
              .sort((a, b) => a.step_order - b.step_order)[0];
            const advanceTo = nextStep || lowestPending;

            // Find all steps in the next group (if grouped)
            const nextGroup = (advanceTo as any)?.parallel_group;
            const nextSteps = nextGroup !== null && nextGroup !== undefined
              ? allSteps?.filter((s) => (s as any).parallel_group === nextGroup && s.status === 'pending') || (advanceTo ? [advanceTo] : [])
              : (advanceTo ? [advanceTo] : []);

            await supabase
              .from('memos')
              .update({
                current_step: advanceTo?.step_order ?? currentStep?.step_order ?? null,
                status: 'in_review',
              })
              .eq('id', id);

            const completedCount = allSteps?.filter(s => s.status === 'approved' || s.id === stepId).length || 0;
            const totalCount = allSteps?.length || 0;

            // Notify next-step approver(s) only when this approval moved the
            // workflow forward (i.e. nextStep exists). If the user approved
            // out of order, the lowest pending step was already notified
            // earlier — don't re-notify.
            const shouldNotifyNext = !!nextStep;
            const notifyTargets = shouldNotifyNext ? nextSteps : [];

            // Notify all next step approvers
            for (const ns of notifyTargets) {
              const nextProfile = getProfile(ns.approver_user_id);
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
                  user_id: ns.approver_user_id,
                  memo_id: id,
                  type: 'approval_request',
                  message: `Memo ${memo.transmittal_no} — "${memo.subject}" requires your ${stepActionLabels[getStepActionType(ns)].toLowerCase()}.`,
                }).then(({ error }) => { if (error) console.warn(error); });
              }

              // Notify creator: new approver reached
              if (memo && memo.from_user_id !== user.id) {
                supabase.from('notifications').insert({
                  user_id: memo.from_user_id,
                  memo_id: id,
                  type: 'step_update',
                  message: `Your memo ${memo.transmittal_no} is now with ${nextProfile?.full_name || 'next approver'} for review (Step ${ns.step_order} of ${totalCount}).`,
                }).then(({ error }) => { if (error) console.warn(error); });
              }
            }

            // Notify creator: step approved
            if (memo && memo.from_user_id !== user.id) {
              const approverProfile = getProfile(user.id);
              supabase.from('notifications').insert({
                user_id: memo.from_user_id,
                memo_id: id,
                type: 'step_update',
                message: `Your memo ${memo.transmittal_no} — "${memo.subject}" was approved by ${approverProfile?.full_name || 'An approver'} on ${format(new Date(), 'dd MMM yyyy HH:mm')}. ${completedCount} of ${totalCount} approvers have signed off.`,
              }).then(({ error }) => { if (error) console.warn(error); });
            }
          } else {
            await supabase.from('memos').update({ status: 'approved' }).eq('id', id);

            // Notify creator: fully approved
            if (memo) {
              supabase.from('notifications').insert({
                user_id: memo.from_user_id,
                memo_id: id,
                type: 'step_update',
                message: `Your memo ${memo.transmittal_no} — "${memo.subject}" has been fully approved by all approvers on ${format(new Date(), 'dd MMM yyyy HH:mm')}. You may now proceed.`,
              }).then(({ error }) => { if (error) console.warn(error); });

              // Auto-save approved memo PDF to SharePoint (non-blocking)
              (async () => {
                try {
                  const logoResponse = await fetch(alHamraLogo);
                  const logoBlob = await logoResponse.blob();
                  const logoDataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(logoBlob);
                  });

                  // Re-fetch fresh approval steps (with all signatures)
                  const { data: freshSteps } = await supabase
                    .from('approval_steps')
                    .select('*')
                    .eq('memo_id', id)
                    .order('step_order');

                  const memoData = {
                    memo, fromProfile: profiles.find(p => p.user_id === memo.from_user_id),
                    toProfile: memo.to_user_id ? profiles.find(p => p.user_id === memo.to_user_id) : undefined,
                    department: departments.find(d => d.id === memo.department_id),
                    approvalSteps: freshSteps || approvalSteps,
                    attachments, profiles, departments, logoDataUrl,
                  };

                  const templatePdfLayout = (workflowTemplate as any)?.pdf_layout || null;
                  const result = await saveApprovedMemoToSharePoint(memoData, templatePdfLayout);

                  if (result.success) {
                    toast({ title: 'Saved to SharePoint', description: `${memo.transmittal_no}.pdf archived successfully.` });
                  } else {
                    console.warn('[SharePoint] Auto-save failed:', result.error);
                  }
                } catch (err) {
                  console.warn('[SharePoint] Auto-save error:', err);
                }
              })();
            }
          }
        }
      } else {
        const newStatus = action === 'rejected' ? 'rejected' : 'rework';
        await supabase.from('memos').update({ status: newStatus as any }).eq('id', id);

        // Notify creator: rejected or rework
        if (memo) {
          const approverProfile = getProfile(user.id);
          const actionWord = action === 'rejected' ? 'rejected' : 'returned for rework';
          const commentText = comments ? ` Reason: ${comments}.` : '';
          const followUp = action === 'rejected'
            ? ' Please review and resubmit.'
            : ' Please review the feedback and resubmit.';

          // Notify memo creator
          if (memo.from_user_id !== user.id) {
            supabase.from('notifications').insert({
              user_id: memo.from_user_id,
              memo_id: id,
              type: 'step_update',
              message: `Your memo ${memo.transmittal_no} — "${memo.subject}" was ${actionWord} by ${approverProfile?.full_name || 'An approver'} on ${format(new Date(), 'dd MMM yyyy HH:mm')}.${commentText}${followUp}`,
            }).then(({ error }) => { if (error) console.warn(error); });
          }

          // CC department manager on rework requests
          if (action === 'rework') {
            const memoDept = departments.find(d => d.id === memo.department_id);
            const deptHeadId = memoDept?.head_user_id;
            if (deptHeadId && deptHeadId !== user.id && deptHeadId !== memo.from_user_id) {
              const deptHeadProfile = getProfile(deptHeadId);
              supabase.from('notifications').insert({
                user_id: deptHeadId,
                memo_id: id,
                type: 'step_update',
                message: `[CC] Memo ${memo.transmittal_no} — "${memo.subject}" was returned for rework by ${approverProfile?.full_name || 'An approver'}.${commentText} Creator: ${getProfile(memo.from_user_id)?.full_name || 'Unknown'}.`,
              }).then(({ error }) => { if (error) console.warn(error); });

              // Send email to dept manager
              if (deptHeadProfile) {
                notifyMemoStatus({
                  creatorEmail: deptHeadProfile.email,
                  creatorName: deptHeadProfile.full_name,
                  memoSubject: memo.subject,
                  transmittalNo: memo.transmittal_no,
                  status: 'rework',
                  approverName: approverProfile?.full_name || 'An approver',
                  memoId: id!,
                  comments: comments || undefined,
                }).catch(console.warn);
              }
            }
          }
        }
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
            comments: comments || undefined,
          }).catch(console.warn);
        }
      }

      const deviceInfo = collectDeviceInfo();
      const clientIp = await getClientIp();
      const geo = clientIp ? await resolveIpGeolocation(clientIp) : { city: null, country: null };

      // Fetch the just-updated step so we can capture the mfa_* columns the
      // verify-mfa-and-sign edge function wrote earlier in this approval.
      const { data: signedStep } = await supabase
        .from('approval_steps')
        .select('mfa_verified, mfa_verified_at, mfa_method, mfa_provider')
        .eq('id', stepId)
        .maybeSingle();

      const myProfileForAudit = user ? getProfile(user.id) : null;
      const authFactors = buildAuthFactors({
        signatureApplied: action === 'approved' && !!signatureUrl,
        passwordVerified: true,
        mfaVerified: !!(signedStep as any)?.mfa_verified,
        mfaMethod: (signedStep as any)?.mfa_method,
        mfaProvider: (signedStep as any)?.mfa_provider,
        mfaVerifiedAt: (signedStep as any)?.mfa_verified_at,
        mfaUpn: (myProfileForAudit as any)?.azure_ad_upn || (myProfileForAudit as any)?.email,
      });

      await supabase.from('audit_log').insert({
        memo_id: id,
        user_id: user.id,
        action: action === 'approved'
          ? (stepActionType === 'signature' ? 'digital_signature_applied' : stepActionType === 'initial' ? 'digital_initial_applied' : `digital_${stepActionType}_completed`)
          : `memo_${action}`,
        action_detail: action,
        signing_method: 'digital',
        transmittal_no: memo?.transmittal_no,
        password_verified: true,
        previous_status: 'pending',
        new_status: action,
        details: {
          comments: comments || null,
          step_action_type: stepActionType,
          auth_factors: authFactors.details,
        },
        notes: authFactors.notes,
        ip_address: clientIp,
        ip_geolocation_city: geo.city,
        ip_geolocation_country: geo.country,
        ...deviceInfo,
      } as any);
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
    setMfaVerified(false);
  };

  const recallMutation = useMutation({
    mutationFn: async () => {
      if (!memo || !user || !id) return;

      // Delete all approval steps for this memo
      const { error: deleteErr } = await supabase
        .from('approval_steps')
        .delete()
        .eq('memo_id', id);
      // RLS may prevent delete; admin can delete. If user can't delete, we skip.

      // Update memo back to draft
      const { error: updateErr } = await supabase
        .from('memos')
        .update({ status: 'draft' as any, current_step: 0 })
        .eq('id', id);
      if (updateErr) throw updateErr;

      // Audit log
      const deviceInfo = collectDeviceInfo();
      const clientIp = await getClientIp();
      const geo = clientIp ? await resolveIpGeolocation(clientIp) : { city: null, country: null };
      await supabase.from('audit_log').insert({
        memo_id: id,
        user_id: user.id,
        action: 'memo_recalled',
        action_detail: 'Memo recalled to draft by creator',
        transmittal_no: memo.transmittal_no,
        previous_status: memo.status,
        new_status: 'draft',
        ip_address: clientIp,
        ip_geolocation_city: geo.city,
        ip_geolocation_country: geo.country,
        ...deviceInfo,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memo', id] });
      queryClient.invalidateQueries({ queryKey: ['approval-steps', id] });
      toast({ title: 'Memo Recalled', description: 'Memo has been returned to draft status.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Recall Failed', description: e.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!memo || !user || !id) return;
      if (!isAdmin) {
        throw new Error('Only administrators can delete memos.');
      }
      await supabase.from('approval_steps').delete().eq('memo_id', id);
      await supabase.from('memo_attachments').delete().eq('memo_id', id);
      await supabase.from('memo_versions').delete().eq('memo_id', id);
      await supabase.from('notifications').delete().eq('memo_id', id);
      await supabase.from('audit_log').delete().eq('memo_id', id);

      // Delete the memo itself
      const { error } = await supabase.from('memos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memos'] });
      toast({ title: 'Memo Deleted', description: 'The memo has been permanently deleted.' });
      navigate('/memos');
    },
    onError: (e: Error) => {
      toast({ title: 'Delete Failed', description: e.message, variant: 'destructive' });
    },
  });

  const openApproveDialog = (stepId: string) => {
    const step = approvalSteps.find((s) => s.id === stepId);
    const sat = getStepActionType(step);
    const myProfile = user ? getProfile(user.id) : null;

    if (sat === 'signature') {
      if (myProfile?.signature_image_url) {
        setSignatureMode('saved');
        setSignatureDataUrl(myProfile.signature_image_url);
      } else {
        setSignatureMode('draw');
        setSignatureDataUrl(null);
      }
    } else if (sat === 'initial') {
      const initialsImg = (myProfile as any)?.initials_image_url;
      if (initialsImg) {
        setSignatureMode('saved');
        setSignatureDataUrl(initialsImg);
      } else if (myProfile?.initials) {
        // Generate image from text initials
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 300, 100);
          ctx.fillStyle = '#1B3A5C';
          ctx.font = 'bold italic 48px "Century Gothic", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(myProfile.initials, 150, 50);
        }
        const dataUrl = canvas.toDataURL('image/png');
        setSignatureMode('saved');
        setSignatureDataUrl(dataUrl);
      } else {
        setSignatureMode('draw');
        setSignatureDataUrl(null);
      }
    }

    setActionDialog({ stepId, action: 'approved', stepActionType: sat });
  };

  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const myProfile = user ? getProfile(user.id) : null;
  const savedPrintPrefs: Partial<PrintPreferences> = {
    duplexMode: ((myProfile as any)?.print_duplex_mode as any) || 'long_edge',
    blankBackPages: (myProfile as any)?.print_blank_back_pages ?? true,
    watermark: (myProfile as any)?.print_watermark ?? false,
    includeAttachments: (myProfile as any)?.print_include_attachments ?? false,
    colorMode: ((myProfile as any)?.print_color_mode as any) || 'color',
    pageNumberStyle: ((myProfile as any)?.print_page_number_style as any) || 'bottom_center',
    confidentialityLine: (myProfile as any)?.print_confidentiality_line || null,
  };

  const getLogoDataUrl = async () => {
    const logoResponse = await fetch(alHamraLogo);
    const logoBlob = await logoResponse.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
  };

  // Extract pdf_layout from the workflow template
  const pdfLayout = (workflowTemplate as any)?.pdf_layout || null;

  const handleOpenPrintPreview = async () => {
    if (!memo) return;
    setPdfGenerating(true);
    try {
      const logoDataUrl = await getLogoDataUrl();
      const memoData = {
        memo, fromProfile, toProfile, department: dept,
        approvalSteps, attachments, profiles, departments, logoDataUrl,
      };
      const prepared = await prepareMemoData(memoData);
      const html = buildMemoHtml(memoData, prepared, { ...DEFAULT_PRINT_PREFERENCES, ...savedPrintPrefs }, pdfLayout);
      setPreviewHtml(html);
      setPrintPreviewOpen(true);
    } catch (error: any) {
      toast({ title: 'Preview Failed', description: error.message, variant: 'destructive' });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handlePrintFromPreview = async (prefs: PrintPreferences) => {
    if (!memo) return;
    try {
      const logoDataUrl = await getLogoDataUrl();
      await generateMemoPdf({
        memo, fromProfile, toProfile, department: dept,
        approvalSteps, attachments, profiles, departments, logoDataUrl,
      }, prefs, pdfLayout);
    } catch (error: any) {
      toast({ title: 'PDF Export Failed', description: error.message, variant: 'destructive' });
    }
  };

  if (memoLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading memo...</div>;
  }

  if (!memo) {
    return <div className="p-8 text-center text-muted-foreground">Memo not found.</div>;
  }

  const fromProfile = getProfile(memo.from_user_id);
  const toProfile = memo.to_user_id ? getProfile(memo.to_user_id) : null;
  const dept = getDept(memo.department_id);

  // Determine if signature/initials are needed for approval dialog
  const needsSigningAsset = actionDialog?.action === 'approved' && 
    (actionDialog.stepActionType === 'signature' || actionDialog.stepActionType === 'initial');

  const isApprover = !!myPendingStep || approvalSteps.some(s => s.approver_user_id === user?.id);
  const showAiPanel = isApprover && memo.status !== 'draft';

  return (
    <div className="flex">
      <div className="flex-1 min-w-0">
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
          {myPendingStep && (
            <>
              <Button
                size="sm"
                className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))]"
                onClick={() => openApproveDialog(myPendingStep.id)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {stepActionLabels[getStepActionType(myPendingStep)]}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setActionDialog({ stepId: myPendingStep.id, action: 'rejected', stepActionType: getStepActionType(myPendingStep) })}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActionDialog({ stepId: myPendingStep.id, action: 'rework', stepActionType: getStepActionType(myPendingStep) })}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Rework
              </Button>
            </>
          )}
          {['draft', 'submitted', 'in_review', 'rejected', 'rework'].includes(memo.status) && 
           (memo.from_user_id === user?.id || isAdmin || (profile?.department_id === memo.department_id && memo.status !== 'approved')) && (
            <Button variant="outline" onClick={() => navigate(`/memos/${memo.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              {memo.status === 'draft' ? 'Edit Draft' : 'Edit & Resubmit'}
            </Button>
          )}
          {(memo.status === 'submitted' || memo.status === 'in_review') && memo.from_user_id === user?.id && (
            <Button
              variant="outline"
              className="border-[hsl(var(--warning))] text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10"
              onClick={() => {
                if (confirm('Are you sure you want to recall this memo? All approval progress will be lost.')) {
                  recallMutation.mutate();
                }
              }}
              disabled={recallMutation.isPending}
            >
              <Undo2 className="h-4 w-4 mr-2" />
              {recallMutation.isPending ? 'Recalling...' : 'Recall'}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          )}
          <Button variant="outline" onClick={handleOpenPrintPreview} disabled={pdfGenerating}>
            <FileDown className="h-4 w-4 mr-2" />
            {pdfGenerating ? 'Generating...' : 'Print / Export PDF'}
          </Button>
        </div>
      </div>

      {/* Pending Approval Banner */}
      {memo.status !== 'draft' && memo.status !== 'approved' && memo.status !== 'rejected' && (() => {
        const pendingSteps = approvalSteps.filter(s => s.status === 'pending');
        if (pendingSteps.length === 0) return null;
        // Find the first pending step (active one)
        const firstPending = pendingSteps.reduce((a, b) => a.step_order < b.step_order ? a : b);
        // Get all steps in the same parallel group if applicable
        const activeSteps = firstPending.parallel_group != null
          ? pendingSteps.filter(s => s.parallel_group === firstPending.parallel_group)
          : [firstPending];
        const names = activeSteps.map(s => {
          const p = getProfile(s.approver_user_id);
          return p?.full_name || 'Unknown';
        });
        const remainingCount = pendingSteps.length - activeSteps.length;
        return (
          <div className="no-print max-w-4xl mx-auto mb-4">
            <div className="rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--warning))]/15 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-[hsl(var(--warning))]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Waiting for: <span className="text-primary">{names.join(', ')}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Step {firstPending.step_order} of {approvalSteps.length}
                  {remainingCount > 0 && ` • ${remainingCount} more step${remainingCount > 1 ? 's' : ''} after this`}
                </p>
              </div>
              <Badge variant="outline" className="border-[hsl(var(--warning))] text-[hsl(var(--warning))] text-xs">
                In Progress
              </Badge>
            </div>
          </div>
        );
      })()}

      {/* Printable Area */}
      <div className="print-area max-w-4xl mx-auto">
        <div className="no-print flex justify-end mb-2 gap-2">
          {(memo as any).revision_count > 0 && (
            <Badge variant="outline" className="text-xs">
              Revision #{(memo as any).revision_count}
            </Badge>
          )}
          <Badge
            className={`capitalize ${
              memo.status === 'approved'
                ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
                : memo.status === 'rejected'
                ? 'bg-destructive/10 text-destructive'
                : memo.status === 'rework'
                ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {memo.status === 'rework' ? 'Changes Requested' : memo.status.replace('_', ' ')}
          </Badge>

          {/* Payment-handoff status (only for approved payment memos) */}
          {memo.status === 'approved' && (memo as any).memo_types?.includes('payments') && (() => {
            const m = memo as any;
            if (m.paid_at) {
              return (
                <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-700 bg-emerald-500/5 capitalize">
                  Paid · {m.payment_method?.replace('_', ' ') || 'recorded'}{m.payment_reference ? ` · ${m.payment_reference}` : ''}
                </Badge>
              );
            }
            if (m.originals_received_at) {
              return (
                <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-700 bg-blue-500/5">
                  Awaiting Payment
                </Badge>
              );
            }
            return (
              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-700 bg-amber-500/5">
                Awaiting Originals
              </Badge>
            );
          })()}
        </div>

        {/* Originals-handoff prompt — visible to memo creator (and to finance / admin),
            shown only on payment memos that are approved but originals not yet received. */}
        {memo.status === 'approved'
          && (memo as any).memo_types?.includes('payments')
          && !(memo as any).originals_received_at
          && (memo.from_user_id === user?.id || isAdmin || hasRole('finance'))
          && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 mb-3 print:hidden">
            <div className="flex items-start gap-2">
              <Banknote className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="font-medium text-amber-700">Next step: send original documents to Finance</p>
                <p className="text-amber-700/80 mt-0.5">
                  This payment memo has been fully approved. Please deliver the original supplier invoice, delivery notes, GRN, and any supporting paperwork to the Finance Cashier desk during business hours.
                  {' '}Bring the printed cover sheet (button on the right) — Finance will stamp it as your delivery receipt and process the payment from there.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Inline cover-sheet generation, mirrors finance/Payments.tsx
                  const url = window.location.href;
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(url)}`;
                  const submitter = getProfile(memo.from_user_id);
                  const dept = getDept(memo.department_id);
                  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  const memoDate = memo.date ? new Date(memo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                  const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Cover Sheet — ${memo.transmittal_no}</title>
<style>@page{size:A4;margin:18mm}body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;font-size:12pt;margin:0}h1{font-size:18pt;margin:0 0 4mm}h2{font-size:13pt;margin:8mm 0 3mm;border-bottom:1px solid #999;padding-bottom:1mm}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6mm}.meta{font-size:10pt;line-height:1.55}.meta strong{display:inline-block;min-width:30mm}table{width:100%;border-collapse:collapse;font-size:10.5pt}th,td{border:1px solid #666;padding:2mm 3mm;text-align:left;vertical-align:top}th{background:#f0f0f0}.receipt-block{margin-top:8mm;border:2px solid #111;padding:5mm;page-break-inside:avoid}.signature-row{display:flex;gap:6mm;margin-top:5mm}.signature-cell{flex:1;border:1px solid #999;padding:3mm;min-height:22mm}.signature-cell .label{font-size:9pt;color:#555;margin-bottom:1.5mm}.small{font-size:9pt;color:#555}.qr-area{text-align:right}.qr-area img{width:32mm;height:32mm;border:1px solid #ddd;padding:1mm}.checklist td.tick{width:8mm;text-align:center}</style>
</head><body>
<div class="header"><div><h1>Payment Memo — Cover Sheet</h1><div class="meta"><div><strong>Transmittal No:</strong> <code>${escape(memo.transmittal_no || '')}</code></div><div><strong>Subject:</strong> ${escape(memo.subject || '')}</div><div><strong>Memo Date:</strong> ${memoDate}</div><div><strong>Department:</strong> ${escape(dept?.name || '—')}</div><div><strong>Submitted by:</strong> ${escape(submitter?.full_name || '—')}</div><div><strong>Printed on:</strong> ${today}</div></div></div><div class="qr-area"><img src="${qrUrl}" /><div class="small">Scan to open memo<br/>${escape(url)}</div></div></div>
<h2>Physical Bundle Checklist</h2><table class="checklist"><thead><tr><th class="tick">✓</th><th>Document type</th><th>Notes</th></tr></thead><tbody><tr><td class="tick">☐</td><td>Original supplier invoice (stamped)</td><td>&nbsp;</td></tr><tr><td class="tick">☐</td><td>Original delivery note(s)</td><td>&nbsp;</td></tr><tr><td class="tick">☐</td><td>Goods received note (GRN)</td><td>&nbsp;</td></tr><tr><td class="tick">☐</td><td>Purchase order copy</td><td>&nbsp;</td></tr><tr><td class="tick">☐</td><td>Quotation(s)</td><td>&nbsp;</td></tr><tr><td class="tick">☐</td><td>Vendor bank-account confirmation</td><td>&nbsp;</td></tr><tr><td class="tick">☐</td><td>Other (specify):</td><td>&nbsp;</td></tr></tbody></table>
<div class="receipt-block"><h2 style="margin-top:0">Finance Reception — Receipt of Originals</h2><p class="small">Bearer is delivering the originals listed above for memo <strong>${escape(memo.transmittal_no || '')}</strong>. Verify against the digital scans (scan QR) and stamp this section. Hand stamped copy back to bearer.</p><div class="signature-row"><div class="signature-cell"><div class="label">Received by (finance) — Name &amp; signature</div></div><div class="signature-cell"><div class="label">Date / time received</div></div><div class="signature-cell"><div class="label">Stamp</div></div></div></div>
<script>window.onload=()=>setTimeout(()=>window.print(),200)</script>
</body></html>`;
                  const w = window.open('', '_blank', 'width=820,height=1100');
                  if (!w) { alert('Please allow popups to print the cover sheet.'); return; }
                  w.document.open(); w.document.write(html); w.document.close();
                }}
              >
                <Printer className="h-3.5 w-3.5 mr-1" /> Print cover sheet
              </Button>
            </div>
          </div>
        )}

        <div className="border border-foreground/30 bg-card print-border">
          {/* HEADER */}
          <div className="flex items-end justify-between px-6 pt-6 pb-4">
            <img src={alHamraLogo} alt="Al Hamra Logo" className="h-28 w-auto object-contain" />
            <div className="text-right">
              <h2 className="text-3xl font-bold tracking-wide text-foreground">INTERNAL MEMO</h2>
              <div className="h-0.5 bg-destructive mt-1" />
            </div>
          </div>

          {/* TO / TRANSMITTAL / DATE / FROM + TRANSMITTED FOR */}
          <div className="border-t border-foreground/30">
            <div className="grid grid-cols-2">
              <div className="border-r border-b border-foreground/30 p-3">
                <p className="text-xs text-muted-foreground">TO:</p>
                <p className="text-sm font-bold mt-1">{toProfile?.full_name || '—'}</p>
                {toProfile?.job_title && <p className="text-sm">{toProfile.job_title}</p>}
              </div>
              <div className="border-b border-foreground/30">
                <div className="grid grid-cols-[auto_1fr]">
                  <div className="bg-background text-destructive px-3 py-3 text-xs font-bold flex items-center border-r border-foreground/30">TRANSMITTAL NO:</div>
                  <div className="px-3 py-3 flex items-center">
                    <p className="text-sm font-bold font-mono">{memo.transmittal_no}</p>
                  </div>
                </div>
                <div className="grid grid-cols-[auto_1fr] border-t border-foreground/30">
                  <div className="bg-background text-destructive px-3 py-3 text-xs font-bold flex items-center border-r border-foreground/30">DATE:</div>
                  <div className="px-3 py-3 flex items-center">
                    <p className="text-sm font-medium">{format(new Date(memo.date), "do MMMM yyyy")}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2">
              <div className="border-r border-b border-foreground/30 p-3">
                <p className="text-xs text-muted-foreground">FROM:</p>
                <p className="text-sm font-bold mt-2">{fromProfile?.full_name || '—'}</p>
                {fromProfile?.job_title && <p className="text-sm">{fromProfile.job_title}</p>}
                {dept && <p className="text-xs text-muted-foreground">{dept.name}</p>}
              </div>
              <div className="border-b border-foreground/30 p-3">
                <p className="text-xs font-bold text-center uppercase tracking-wider mb-2">Transmitted For</p>
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                  {MEMO_TYPE_OPTIONS.map((opt) => (
                    <div key={opt.value} className="flex items-center gap-1.5 text-xs">
                      <span className={`w-3.5 h-3.5 border flex items-center justify-center text-[10px] shrink-0 ${
                        memo.memo_types.includes(opt.value) ? 'border-foreground' : 'border-foreground/40'
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

          {/* SUBJECT */}
          <div className="border-b border-foreground/30 px-4 py-2.5">
            <p className="text-sm">
              <span className="font-bold">Subject: </span>
              <span className="font-bold">{memo.subject}</span>
            </p>
          </div>

          {/* DESCRIPTION */}
          <div className="border-b border-foreground/30 px-4 py-3">
            <p className="text-xs font-bold uppercase mb-2">Description:</p>
            <div
              className="prose prose-sm max-w-none text-foreground memo-body-preview"
              dangerouslySetInnerHTML={{ __html: memo.description || '<p>No description.</p>' }}
            />

            {/* Sender Signature / Sign-off block */}
            <div className="flex justify-end mt-8 mb-4">
              <div className="text-center">
                {(() => {
                  const pdfLayout = workflowTemplate?.pdf_layout as any;
                  const signoffIdx = pdfLayout?.signoff_step;
                  if (signoffIdx !== null && signoffIdx !== undefined) {
                    const signoffStep = approvalSteps.find(s => s.step_order === signoffIdx + 1);
                    if (signoffStep) {
                      const signoffProfile = getProfile(signoffStep.approver_user_id);
                      const sat = getStepActionType(signoffStep);
                      return (
                        <>
                          {signoffStep.signature_image_url ? (
                            <SignedImage
                              storagePath={signoffStep.signature_image_url}
                              alt={`${signoffProfile?.full_name || 'Approver'} signature`}
                              className="h-16 mb-1 object-contain mx-auto"
                              fallback={<p className="border-b border-foreground inline-block w-48 pb-1 mb-1">&nbsp;</p>}
                            />
                          ) : signoffStep.status === 'approved' ? (
                            <p className="text-[10px] italic text-muted-foreground mb-1">[Digitally Approved]</p>
                          ) : (
                            <p className="border-b border-foreground inline-block w-48 pb-1 mb-1">&nbsp;</p>
                          )}
                          <p className="text-sm font-bold">
                            {signoffProfile?.full_name}{signoffProfile?.job_title ? `, ${signoffProfile.job_title}` : ''}
                          </p>
                          {signoffStep.signed_at && (
                            <p className="text-xs text-muted-foreground">
                              Date: {format(new Date(signoffStep.signed_at), 'dd/MM/yyyy')}
                            </p>
                          )}
                          <div className="no-print flex items-center justify-center gap-1 mt-1">
                            {statusIcons[signoffStep.status]}
                            <span className="text-[10px] capitalize">{signoffStep.status}</span>
                          </div>
                        </>
                      );
                    }
                  }
                  // Default: sender signature
                  return (
                    <>
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
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Footer row */}
            <div className="flex items-center justify-center gap-8 text-xs mt-4 pt-2 border-t border-foreground/20">
              <span>No. of Continuation Pages: <strong>{String(memo.continuation_pages || 0).padStart(2, '0')}</strong></span>
              <span>No. of Attachments: <strong>{String(attachments.length).padStart(2, '0')}</strong></span>
              <span className="font-bold">{(() => {
                if (memo.initials) return memo.initials;
                const reviewerId = (memo as any).reviewer_user_id;
                if (!reviewerId) return '--';
                const rp = profiles.find(p => p.user_id === reviewerId);
                if (!rp) return '--';
                const parts = rp.full_name.trim().split(' ');
                if (parts.length === 1) return parts[0][0].toUpperCase();
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
              })()}</span>
            </div>
          </div>

          {/* COPIES TO */}
          <div className="grid grid-cols-[140px_1fr] border-b border-foreground/30">
            <div className="px-3 py-2 text-xs font-bold border-r border-foreground/30">COPIES TO:</div>
            <div className="px-3 py-2 text-sm">
              {memo.copies_to?.map((uid: string) => {
                const p = getProfile(uid);
                return p ? p.full_name : uid;
              }).join(', ') || ''}
            </div>
          </div>

          {/* ACTION REQUIRED / COMMENTS */}
          <div className="grid grid-cols-[140px_1fr] border-b border-foreground/30">
            <div className="px-3 py-2 text-xs font-bold border-r border-foreground/30">
              <p>ACTION REQUIRED:</p>
              <p className="mt-1">COMMENTS IF ANY:</p>
            </div>
            <div className="px-3 py-2 text-sm">
              {(memo as any)?.action_comments && (
                <p className="text-xs mb-2 whitespace-pre-wrap">{(memo as any).action_comments}</p>
              )}
            </div>
          </div>

          {/* APPROVALS */}
          {approvalSteps.length > 0 && (() => {
            const pdfLayout = workflowTemplate?.pdf_layout as any;
            const signoffIdx = pdfLayout?.signoff_step;
            const hasLayout = pdfLayout?.grid?.some?.((row: any[]) => row?.some?.((cell: any) => cell !== null));

            // Helper to render a single approval cell
            const renderApprovalCell = (step: typeof approvalSteps[0]) => {
              const approver = getProfile(step.approver_user_id);
              const sat = getStepActionType(step);
              const isParallel = (step as any).parallel_group !== null && (step as any).parallel_group !== undefined;

              return (
                <div className="p-3 flex flex-col justify-between min-h-[120px]">
                  {/* Status + action type indicator */}
                  <div className="no-print flex items-center gap-1 text-[10px] capitalize mb-1 flex-wrap">
                    {statusIcons[step.status]}
                    <span className={
                      step.status === 'approved' ? 'text-[hsl(var(--success))]' :
                      step.status === 'rejected' ? 'text-destructive' :
                      step.status === 'pending' ? 'text-[hsl(var(--warning))]' :
                      'text-accent'
                    }>
                      {step.status}
                    </span>
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 ml-1 gap-0.5">
                      {stepActionIcons[sat]}
                      {stepActionLabels[sat]}
                    </Badge>
                    {isParallel && (
                      <Badge variant="secondary" className="text-[8px] px-1 py-0 h-4 ml-1">∥</Badge>
                    )}
                  </div>

                  {/* Signature/Initials area */}
                  <div className="flex-1 flex items-center justify-center">
                    {(step as any).signing_method === 'manual_paper' && step.status === 'approved' ? (
                      <div className="text-center">
                        <p className="text-xs font-bold text-accent">📄 SIGNED ON PAPER</p>
                        {(step as any).registered_by_user_id && (
                          <p className="text-[9px] text-muted-foreground mt-1">
                            Registered by: {getProfile((step as any).registered_by_user_id)?.full_name || 'Delegate'}
                          </p>
                        )}
                        <Badge className="text-[8px] bg-accent/20 text-accent mt-1">Manual</Badge>
                      </div>
                    ) : sat === 'signature' && step.signature_image_url ? (
                      <div className="text-center">
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
                        {step.status === 'approved' && <Badge variant="outline" className="text-[8px] mt-1">🔐 Digital</Badge>}
                      </div>
                    ) : sat === 'initial' && step.signature_image_url ? (
                      <div className="text-center">
                        <SignedImage
                          storagePath={step.signature_image_url}
                          alt={`${approver?.full_name || 'Approver'} initials`}
                          className="h-10 object-contain"
                          fallback={
                            step.status === 'approved'
                              ? <span className="text-lg font-bold italic text-primary">{approver?.initials || '✓'}</span>
                              : null
                          }
                        />
                        {step.status === 'approved' && <Badge variant="outline" className="text-[8px] mt-1">🔐 Digital</Badge>}
                      </div>
                    ) : sat === 'initial' && step.status === 'approved' ? (
                      <span className="text-lg font-bold italic text-primary">{approver?.initials || '✓'}</span>
                    ) : sat === 'signature' && step.status === 'approved' ? (
                      <p className="text-[10px] italic text-muted-foreground">[Digitally Approved]</p>
                    ) : null}
                  </div>

                  {/* Label & Date */}
                  <div className="border-t border-foreground/20 pt-1 mt-2">
                    <p className="text-xs font-bold break-words leading-tight">
                      {approver?.full_name || 'Unknown'}{approver?.job_title ? ` – ${approver.job_title}` : ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">
                      – {sat === 'signature' ? 'APPROVE' : 'INITIALS'}
                    </p>
                    <p className="text-xs mt-0.5">
                      <span className="font-bold">Date: </span>
                      {step.signed_at ? format(new Date(step.signed_at), 'dd/MM/yyyy') : ''}
                    </p>
                    {(step as any).signing_method === 'manual_paper' && (step as any).date_of_physical_signing && (
                      <p className="text-[9px] text-muted-foreground">
                        Paper signed: {format(new Date((step as any).date_of_physical_signing), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              );
            };

            if (hasLayout) {
              // Layout-based rendering: use the 3×3 grid from pdf_layout
              const stepsByOrder = new Map(approvalSteps.map(s => [s.step_order, s]));
              const grid: (any | null)[][] = pdfLayout.grid;

              return (
                <div className="mt-4 mx-4 mb-4">
                  <div className="bg-destructive text-destructive-foreground text-center py-2 font-bold text-lg tracking-widest uppercase">
                    Approvals
                  </div>
                  <div className="border border-t-0 border-foreground/30">
                    {grid.map((row: any[], rowIdx: number) => (
                      <div key={rowIdx} className="grid grid-cols-3">
                        {row.map((cell: any, colIdx: number) => {
                          const isLastCol = colIdx === row.length - 1;
                          const isLastRow = rowIdx === grid.length - 1;
                          const borderClasses = `${!isLastCol ? 'border-r' : ''} ${!isLastRow ? 'border-b' : ''} border-foreground/30`;

                          if (!cell || !cell.step_indices || cell.step_indices.length === 0) {
                            return <div key={colIdx} className={`min-h-[120px] ${borderClasses}`} />;
                          }

                          // Find steps for this cell
                          const cellSteps = cell.step_indices
                            .map((idx: number) => stepsByOrder.get(idx + 1))
                            .filter(Boolean);

                          if (cellSteps.length === 0) {
                            return <div key={colIdx} className={`min-h-[120px] ${borderClasses}`} />;
                          }

                          if (cell.stacked && cellSteps.length > 1) {
                            // Stacked: multiple steps in one cell
                            return (
                              <div key={colIdx} className={`${borderClasses} divide-y divide-foreground/20`}>
                                {cellSteps.map((step: any) => (
                                  <div key={step.id}>{renderApprovalCell(step)}</div>
                                ))}
                              </div>
                            );
                          }

                          // Single step (or first of non-stacked)
                          return (
                            <div key={colIdx} className={borderClasses}>
                              {renderApprovalCell(cellSteps[0])}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            // Fallback: flat grid (legacy behavior) — exclude signoff step if configured
            const gridSteps = signoffIdx !== null && signoffIdx !== undefined
              ? approvalSteps.filter(s => s.step_order !== signoffIdx + 1)
              : approvalSteps;

            if (gridSteps.length === 0) return null;

            return (
              <div className="mt-4 mx-4 mb-4">
                <div className="bg-destructive text-destructive-foreground text-center py-2 font-bold text-lg tracking-widest uppercase">
                  Approvals
                </div>
                <div className="grid grid-cols-3 border border-t-0 border-foreground/30">
                  {gridSteps.map((step) => (
                    <div
                      key={step.id}
                      className="border-r last:border-r-0 border-foreground/30"
                    >
                      {renderApprovalCell(step)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Attachments (screen only) */}
          {attachments.length > 0 && (
            <div className="no-print px-4 pb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Attachments</p>
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

          {/* Footer */}
          <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-foreground/10">
            <p>HRA 09/00/T/I/01</p>
            <p>Version 1.3</p>
            <p>For Internal Use</p>
          </div>
        </div>
      </div>

      {/* Workflow Progress Tracker */}
      {approvalSteps.length > 0 && (
        <WorkflowTracker
          steps={approvalSteps as any}
          profiles={profiles}
          memoStatus={memo.status}
          currentStep={memo.current_step}
        />
      )}

      {/* Delegate Manual Registration Panel */}
      {memo && user && (() => {
        // Find pending steps for principals this user is a delegate for
        const delegateSteps = approvalSteps.filter(s =>
          s.status === 'pending' &&
          delegateAssignments.some(da => da.principal_user_id === s.approver_user_id)
        );

        if (delegateSteps.length === 0) return null;

        return (
          <div className="no-print max-w-4xl mx-auto mt-6 space-y-4">
            {delegateSteps.map(step => {
              const principal = getProfile(step.approver_user_id);
              return (
                <ManualRegistrationPanel
                  key={step.id}
                  step={step as any}
                  principalName={principal?.full_name || 'Unknown'}
                  principalTitle={principal?.job_title || ''}
                  memoTransmittalNo={memo.transmittal_no}
                />
              );
            })}
          </div>
        );
      })()}

      {/* Audit Trail Tab */}
      {memo && id && (
        <div className="no-print max-w-4xl mx-auto mt-6">
          <Tabs defaultValue="comments">
            <TabsList>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="audit-trail">Audit Trail</TabsTrigger>
              <TabsTrigger value="versions">Version History</TabsTrigger>
            </TabsList>
            <TabsContent value="comments" className="mt-4">
              {approvalSteps.filter(s => s.comments).length > 0 ? (
                <div className="space-y-2">
                  {approvalSteps.filter(s => s.comments).map(s => {
                    const approver = getProfile(s.approver_user_id);
                    return (
                      <div key={s.id} className="border rounded-md p-3">
                        <p className="text-sm font-medium">{approver?.full_name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{s.comments}</p>
                        {s.signed_at && (
                          <p className="text-xs text-muted-foreground mt-1">{format(new Date(s.signed_at), 'dd MMM yyyy, HH:mm')}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
            </TabsContent>
            <TabsContent value="audit-trail" className="mt-4">
              <AuditTrailTab memoId={id} />
            </TabsContent>
            <TabsContent value="versions" className="mt-4">
              <VersionHistory memoId={id} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) resetDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionDialog && actionLabel[actionDialog.action]} Memo
              {actionDialog?.action === 'approved' && actionDialog.stepActionType !== 'signature' && (
                <Badge variant="outline" className="ml-2 text-xs gap-1">
                  {stepActionIcons[actionDialog.stepActionType]}
                  {stepActionLabels[actionDialog.stepActionType]}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {actionDialog && (
              <p className="text-sm text-muted-foreground">
                {actionDialog.action === 'approved'
                  ? actionDialog.stepActionType === 'signature'
                    ? 'You are about to approve this memo. Please sign below.'
                    : actionDialog.stepActionType === 'initial'
                    ? 'You are about to initial this memo as an endorsement.'
                    : actionDialog.stepActionType === 'review'
                    ? 'You are marking this memo as reviewed. Add any comments below.'
                    : 'You are acknowledging receipt of this memo.'
                  : actionDialog.action === 'rejected'
                  ? 'You are about to reject this memo. Please provide a reason below.'
                  : 'You are requesting the sender to rework this memo. Please explain what needs to change.'}
              </p>
            )}

            {/* Signature section for signature/initial action types */}
            {needsSigningAsset && (() => {
              const myProfile = user ? getProfile(user.id) : null;
              const isInitial = actionDialog?.stepActionType === 'initial';
              const savedAsset = isInitial
                ? ((myProfile as any)?.initials_image_url || (myProfile?.initials ? '__text_initials__' : null))
                : myProfile?.signature_image_url;
              const hasSaved = !!savedAsset;
              // For text initials, signatureDataUrl is already a data URL from openApproveDialog
              const isTextInitials = isInitial && !((myProfile as any)?.initials_image_url) && !!myProfile?.initials;

              return (
                <div className="space-y-3">
                  <Label>
                    {isInitial ? 'Your Initials' : 'Your Signature'} <span className="text-destructive">*</span>
                  </Label>
                  {hasSaved && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={signatureMode === 'saved' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSignatureMode('saved');
                          if (isTextInitials) {
                            // Re-generate text initials image
                            const canvas = document.createElement('canvas');
                            canvas.width = 300;
                            canvas.height = 100;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              ctx.fillStyle = '#ffffff';
                              ctx.fillRect(0, 0, 300, 100);
                              ctx.fillStyle = '#1B3A5C';
                              ctx.font = 'bold italic 48px "Century Gothic", sans-serif';
                              ctx.textAlign = 'center';
                              ctx.textBaseline = 'middle';
                              ctx.fillText(myProfile!.initials!, 150, 50);
                            }
                            setSignatureDataUrl(canvas.toDataURL('image/png'));
                          } else {
                            setSignatureDataUrl(savedAsset);
                          }
                        }}
                      >
                        Use Saved {isInitial ? 'Initials' : 'Signature'}
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
                        Draw {isInitial ? 'Initials' : 'Signature'}
                      </Button>
                    </div>
                  )}
                  {signatureMode === 'saved' && hasSaved ? (
                    <div className="border border-input rounded-md p-4 bg-white flex items-center justify-center">
                      {isTextInitials && signatureDataUrl?.startsWith('data:') ? (
                        <img src={signatureDataUrl} alt="Your text initials" className="max-h-16 object-contain" />
                      ) : (
                        <SignedImage
                          storagePath={isTextInitials ? null : savedAsset!}
                          alt={isInitial ? 'Your saved initials' : 'Your saved signature'}
                          className={isInitial ? 'max-h-16 object-contain' : 'max-h-24 object-contain'}
                        />
                      )}
                    </div>
                  ) : (
                    <SignaturePad
                      onSignatureChange={setSignatureDataUrl}
                      width={isInitial ? 300 : 400}
                      height={isInitial ? 100 : 150}
                    />
                  )}
                </div>
              );
            })()}

            {/* MFA step-up — required for payment memos when policy is enabled.
                On every payment memo we show one of: the MFA component (if
                policy on), or a small banner explaining MFA is currently
                disabled. */}
            {actionDialog?.action === 'approved' && (() => {
              const isPayment = !!memo?.memo_types?.includes('payments');
              if (!isPayment) return null;
              const policyOn = !!fraudPolicy?.mfa_required_for_payments;
              const myProfile = user ? getProfile(user.id) : null;
              if (!policyOn) {
                return (
                  <div className="rounded-md border border-muted bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                    <strong>Note:</strong> this is a payment memo, but Microsoft
                    Authenticator step-up MFA is currently disabled in
                    Admin → Fraud & MFA settings. Approval will proceed with
                    password + signature only.
                  </div>
                );
              }
              return (
                <MfaStepUp
                  memoId={id!}
                  stepId={actionDialog.stepId}
                  loginHint={(myProfile as any)?.email || user?.email}
                  onVerified={() => setMfaVerified(true)}
                  onReset={() => setMfaVerified(false)}
                />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancel</Button>
            <Button
              className={actionDialog ? actionColor[actionDialog.action] : ''}
              disabled={(() => {
                if (actionMutation.isPending) return true;
                if (!password.trim()) return true;
                if (needsSigningAsset && !signatureDataUrl) return true;
                if (actionDialog?.action !== 'approved' && !comments.trim()) return true;
                // MFA gate for payment memos
                if (actionDialog?.action === 'approved' && fraudPolicy?.mfa_required_for_payments) {
                  const isPayment = !!memo?.memo_types?.includes('payments');
                  if (isPayment && !mfaVerified) return true;
                }
                return false;
              })()}
              onClick={() => actionMutation.mutate()}
            >
              {actionMutation.isPending ? 'Processing...' : actionDialog ? actionLabel[actionDialog.action] : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      <PrintPreviewDialog
        open={printPreviewOpen}
        onClose={() => setPrintPreviewOpen(false)}
        htmlContent={previewHtml}
        onPrint={handlePrintFromPreview}
        savedPreferences={savedPrintPrefs}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Memo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-foreground">
              Are you sure you want to permanently delete memo <strong>{memo.transmittal_no}</strong>?
            </p>
            <p className="text-sm text-muted-foreground">
              This will remove the memo and all associated data including approval steps, attachments, version history, notifications, and audit logs. This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteDialogOpen(false);
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      {/* AI Approval Summary Panel */}
      {showAiPanel && (
        <AiApprovalSummary memoId={id!} memoUpdatedAt={memo.updated_at} />
      )}
    </div>
  );
};

export default MemoView;
