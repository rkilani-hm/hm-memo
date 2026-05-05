import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collectDeviceInfo, getClientIp, resolveIpGeolocation } from '@/lib/device-info';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles, fetchDepartments, uploadAttachment } from '@/lib/memo-api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TransmittedForGrid from '@/components/memo/TransmittedForGrid';
import RichTextEditor from '@/components/memo/RichTextEditor';
import FileUpload from '@/components/memo/FileUpload';
import WorkflowBuilder from '@/components/memo/WorkflowBuilder';
import UserMultiSelect from '@/components/memo/UserMultiSelect';
import type { WorkflowStepDef } from '@/components/memo/WorkflowBuilder';
import type { FileAttachment } from '@/components/memo/FileUpload';
import type { MemoType } from '@/components/memo/TransmittedForGrid';
import { DEFAULT_PDF_LAYOUT, type PdfLayout } from '@/components/memo/PdfLayoutEditor';
import { format } from 'date-fns';
import { Save, Send, ArrowLeft, FileDown, RotateCcw } from 'lucide-react';
import { buildMemoHtml } from '@/lib/memo-pdf-html';
import { generateMemoPdf, prepareMemoData, type PrintPreferences, DEFAULT_PRINT_PREFERENCES } from '@/lib/memo-pdf';
import PrintPreviewDialog from '@/components/memo/PrintPreviewDialog';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

const MemoEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { user, profile, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const navigate = useNavigate();
  const { toast } = useToast();

  // Form state
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [actionComments, setActionComments] = useState('');
  const [memoTypes, setMemoTypes] = useState<MemoType[]>([]);
  const [continuationPages, setContinuationPages] = useState(0);
  const [initials, setInitials] = useState('');
  const [reviewerUserId, setReviewerUserId] = useState('');
  const [copiesTo, setCopiesTo] = useState<string[]>([]);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Workflow builder state
  const [workflowMode, setWorkflowMode] = useState<'preset' | 'dynamic'>('preset');
  const [customSteps, setCustomSteps] = useState<WorkflowStepDef[]>([]);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [dynamicPdfLayout, setDynamicPdfLayout] = useState<PdfLayout>(DEFAULT_PDF_LAYOUT);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');


  // Fetch memo
  const { data: memo, isLoading: memoLoading } = useQuery({
    queryKey: ['memo', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('memos').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch existing attachments
  const { data: existingAttachments = [] } = useQuery({
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

  // Fetch existing approval steps for pre-loading into Dynamic Builder
  const { data: existingSteps = [] } = useQuery({
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

  // Fetch workflow template pdf_layout for this memo
  const { data: workflowTemplate } = useQuery({
    queryKey: ['memo-workflow-template-edit', memo?.workflow_template_id],
    queryFn: async () => {
      if (!memo?.workflow_template_id) return null;
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('pdf_layout')
        .eq('id', memo.workflow_template_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!memo?.workflow_template_id,
  });

  // Load memo data into form
  useEffect(() => {
    if (memo && !loaded) {
      setFromUserId(memo.from_user_id);
      setToUserId(memo.to_user_id || '');
      setSubject(memo.subject);
      setDescription(memo.description || '');
      setActionComments((memo as any).action_comments || '');
      setMemoTypes((memo.memo_types || []) as MemoType[]);
      setContinuationPages(memo.continuation_pages || 0);
      setInitials(memo.initials || '');
      setReviewerUserId((memo as any).reviewer_user_id || '');
      setCopiesTo(memo.copies_to || []);

      // Pre-load existing approval steps into Dynamic Builder
      if (existingSteps.length > 0) {
        const steps: WorkflowStepDef[] = existingSteps.map((s) => ({
          approver_user_id: s.approver_user_id,
          label: s.stage_level || '',
          action_type: s.action_type as 'signature' | 'initial',
          is_required: s.is_required,
          parallel_group: s.parallel_group,
          deadline: s.deadline,
          stage_level: s.stage_level,
        }));
        setCustomSteps(steps);
        setWorkflowMode('dynamic');

        // Load existing pdf_layout from workflow template
        if (workflowTemplate?.pdf_layout) {
          setDynamicPdfLayout(workflowTemplate.pdf_layout as unknown as PdfLayout);
        }
      }

      setLoaded(true);
    }
  }, [memo, loaded, existingSteps]);

  // Edit-and-resubmit policy
  // ========================
  // Creators (and admins) may edit memos in any non-final status —
  // 'draft', 'submitted', 'in_review', 'rejected', 'rework'.
  // 'approved' is final and locked. Saving an edit on a non-draft memo
  // resets the entire approval chain (Option A): all collected
  // signatures are invalidated and approvers must re-sign on the new
  // content. The chain reset is implemented in saveMemo below by
  // deleting approval_steps before re-running submit-memo.
  const editableStatuses = ['draft', 'submitted', 'in_review', 'rejected', 'rework'];
  const wasAlreadySubmitted = memo && ['submitted', 'in_review', 'rejected', 'rework'].includes(memo.status);
  const isEditable = memo && (
    editableStatuses.includes(memo.status) &&
    (memo.from_user_id === user?.id || memo.created_by_user_id === user?.id || isAdmin)
  );

  // Redirect if not editable
  useEffect(() => {
    if (memo && !isEditable) {
      // Be specific about WHY edit is blocked so users (and admins
      // debugging) understand. Three reasons we'd block:
      //   - Memo is in a final state (approved)
      //   - User isn't the creator (neither from_user_id nor
      //     created_by_user_id matches) and isn't an admin
      //   - Status is somehow outside the editable list
      let reason = 'This memo cannot be edited in its current state.';
      if (memo.status === 'approved') {
        reason = 'This memo has been fully approved and is now locked. Approved memos cannot be edited.';
      } else if (
        memo.from_user_id !== user?.id &&
        memo.created_by_user_id !== user?.id &&
        !isAdmin
      ) {
        reason = 'Only the memo\'s creator or an admin can edit this memo. If you created it but are seeing this message, please contact the system administrator — the memo may be missing creator information.';
      }
      toast({ title: 'Cannot Edit', description: reason, variant: 'destructive' });
      navigate(`/memos/${id}`);
    }
  }, [memo, isEditable]);

  // Count signatures that will be invalidated by saving an edit, so we
  // can warn the editor in the banner. Recompute on every render — fast.
  const signedCount = (existingSteps || []).filter(
    (s: any) => s.status === 'approved' && s.signed_at,
  ).length;

  const currentDate = memo ? format(new Date(memo.date), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy');

  // Helper used by the re-sign notification email below: render a
  // diff value as short HTML-safe text. Object/array values become
  // truncated JSON; null/undefined become an italic "(empty)" marker.
  const formatDiff = (v: any): string => {
    if (v === null || v === undefined || v === '') return '<em>(empty)</em>';
    const text = typeof v === 'string' ? v : JSON.stringify(v);
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.length > 80 ? escaped.slice(0, 80) + '…' : escaped;
  };

  const saveMemo = async (status: 'draft' | 'submitted') => {
    if (!user || !memo || !profile?.department_id) {
      toast({ title: 'Error', description: 'User profile not configured.', variant: 'destructive' });
      return;
    }

    if (status === 'submitted') {
      if (!toUserId) {
        toast({ title: 'Validation Error', description: 'Please select a recipient (TO).', variant: 'destructive' });
        return;
      }
      if (!subject.trim()) {
        toast({ title: 'Validation Error', description: 'Subject is required.', variant: 'destructive' });
        return;
      }
      if (memoTypes.length === 0) {
        toast({ title: 'Validation Error', description: 'Select at least one "Transmitted For" type.', variant: 'destructive' });
        return;
      }
      if (workflowMode === 'dynamic') {
        if (customSteps.length > 0 && !customSteps.some((s) => s.action_type === 'signature')) {
          toast({ title: 'Validation Error', description: 'At least one step must require a Signature.', variant: 'destructive' });
          return;
        }
        if (customSteps.some((s) => !s.approver_user_id)) {
          toast({ title: 'Validation Error', description: 'All workflow steps must have an approver selected.', variant: 'destructive' });
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const copiesArray = copiesTo;

      // Edit-and-resubmit chain reset (Option A — full reset)
      // -----------------------------------------------------
      // Before deleting the existing approval_steps, snapshot the list
      // of approvers who had already signed so we can email them after
      // the resubmit goes through. They'll need to re-sign on the new
      // content. existingSteps comes from the React Query above and is
      // a fresh read of the current chain.
      const wasSubmitted = ['submitted', 'in_review', 'rejected', 'rework'].includes(memo.status);
      const previouslySignedApproverIds: string[] = [];
      if (wasSubmitted) {
        for (const s of (existingSteps || []) as any[]) {
          if (s.status === 'approved' && s.signed_at && s.approver_user_id) {
            previouslySignedApproverIds.push(s.approver_user_id);
          }
        }
        // Delete existing approval steps (submit-memo also does this on
        // its own, but doing it here ensures a clean state regardless
        // of which path runs).
        await supabase.from('approval_steps').delete().eq('memo_id', memo.id);
      }

      // Derive initials from reviewer
      const reviewerProfile = reviewerUserId ? profiles.find(p => p.user_id === reviewerUserId) : null;
      const derivedInitials = reviewerProfile
        ? (() => {
            const parts = reviewerProfile.full_name.trim().split(' ');
            if (parts.length === 1) return parts[0][0].toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          })()
        : '--';

      // Increment revision_count on resubmit
      const isResubmit = wasSubmitted && status === 'submitted';
      const currentRevision = (memo as any).revision_count || 0;

      const { error: updateError } = await supabase
        .from('memos')
        .update({
          from_user_id: fromUserId || memo.from_user_id,
          to_user_id: toUserId || null,
          subject: subject.trim() || 'Untitled Memo',
          description,
          action_comments: actionComments || null,
          status: status === 'draft' ? 'draft' : 'submitted',
          memo_types: memoTypes,
          continuation_pages: continuationPages,
          initials: derivedInitials,
          copies_to: copiesArray.length > 0 ? copiesArray : null,
          current_step: status === 'draft' ? 0 : memo.current_step,
          reviewer_user_id: reviewerUserId || null,
          ...(isResubmit ? { revision_count: currentRevision + 1 } : {}),
        } as any)
        .eq('id', memo.id);

      if (updateError) throw updateError;

      // Upload new attachments
      for (const attachment of files) {
        await uploadAttachment(memo.id, attachment.file, user.id);
      }

      // Build field-level diff for audit log
      const newValues: Record<string, any> = {
        from_user_id: fromUserId || memo.from_user_id,
        to_user_id: toUserId || null,
        subject: subject.trim() || 'Untitled Memo',
        description,
        action_comments: actionComments || null,
        memo_types: memoTypes,
        continuation_pages: continuationPages,
        copies_to: copiesArray.length > 0 ? copiesArray : null,
        reviewer_user_id: reviewerUserId || null,
      };
      const oldValues: Record<string, any> = {
        from_user_id: (memo as any).from_user_id,
        to_user_id: (memo as any).to_user_id,
        subject: (memo as any).subject,
        description: (memo as any).description,
        action_comments: (memo as any).action_comments,
        memo_types: (memo as any).memo_types,
        continuation_pages: (memo as any).continuation_pages,
        copies_to: (memo as any).copies_to,
        reviewer_user_id: (memo as any).reviewer_user_id,
      };
      const norm = (v: any) => JSON.stringify(v ?? null);
      const changedFields: Record<string, { old: any; new: any }> = {};
      for (const k of Object.keys(newValues)) {
        if (norm(oldValues[k]) !== norm(newValues[k])) {
          changedFields[k] = { old: oldValues[k] ?? null, new: newValues[k] ?? null };
        }
      }

      // Audit log
      const deviceInfo = collectDeviceInfo();
      const clientIp = await getClientIp();
      const geo = clientIp ? await resolveIpGeolocation(clientIp) : { city: null, country: null };
      await supabase.from('audit_log').insert({
        memo_id: memo.id,
        user_id: user.id,
        action: status === 'draft' ? 'memo_updated' : 'memo_submitted',
        details: {
          transmittal_no: memo.transmittal_no,
          original_created_at: (memo as any).created_at,
          changed_fields: changedFields,
          fields_changed_count: Object.keys(changedFields).length,
        },
        ip_address: clientIp,
        ip_geolocation_city: geo.city,
        ip_geolocation_country: geo.country,
        ...deviceInfo,
      } as any);

      // If submitting, trigger workflow
      if (status === 'submitted') {
        const body: any = { memo_id: memo.id };
        if (workflowMode === 'preset') {
          body.workflow_template_id = selectedWorkflowId || undefined;
        } else if (workflowMode === 'dynamic' && customSteps.length > 0) {
          body.custom_steps = customSteps;
          body.pdf_layout = dynamicPdfLayout;
        }
        const { error: submitError } = await supabase.functions.invoke('submit-memo', { body });
        if (submitError) console.warn('Workflow creation warning:', submitError);

        // Resubmit re-sign notifications
        // ------------------------------
        // For approvers who had signed BEFORE this edit, send a heads-up
        // that the memo content has changed and they'll need to re-sign.
        // submit-memo already emails the new step-1 approver on its own
        // notify path; this is purely the supplemental "your previous
        // signature is no longer valid" notice.
        // Skipped silently on failure — non-blocking, the chain still
        // proceeds correctly without these emails.
        if (wasSubmitted && previouslySignedApproverIds.length > 0) {
          try {
            const { data: approvers } = await supabase
              .from('profiles')
              .select('user_id, full_name, email')
              .in('user_id', previouslySignedApproverIds);

            const recipients = (approvers || [])
              .map((a: any) => a.email)
              .filter((e: any): e is string => Boolean(e));

            if (recipients.length > 0) {
              const subject = `Memo edited and resubmitted — your re-signature is needed: ${memo.transmittal_no}`;
              const fieldsHtml = Object.entries(changedFields)
                .slice(0, 8)
                .map(([k, v]: any) => `<li><code>${k}</code>: ${formatDiff(v.old)} → ${formatDiff(v.new)}</li>`)
                .join('');
              const moreFields = Object.keys(changedFields).length > 8
                ? `<p style="color:#666;font-size:12px;">+${Object.keys(changedFields).length - 8} more changes…</p>`
                : '';

              const emailBody = `
                <p>Hello,</p>
                <p>The memo <strong>${memo.transmittal_no}</strong> ("${subject}") was edited and resubmitted by ${profile?.full_name || 'the creator'}.</p>
                <p>Because the content changed after you signed, your previous signature has been invalidated. The memo is back in your queue and will need a new signature when it reaches your step in the chain.</p>
                <p><strong>Fields that changed:</strong></p>
                <ul style="margin:8px 0;padding-left:20px;">${fieldsHtml || '<li><em>(no field-level diff captured)</em></li>'}</ul>
                ${moreFields}
                <p>Please review the updated memo and re-sign when it's your turn.</p>
              `;

              await supabase.functions.invoke('send-email', {
                body: {
                  to: recipients,
                  subject,
                  body: emailBody,
                  isHtml: true,
                },
              });
            }
          } catch (e) {
            console.warn('Re-sign notification failed (non-blocking):', e);
          }
        }
      }

      toast({
        title: status === 'draft' ? 'Draft Updated' : 'Memo Submitted',
        description: `${memo.transmittal_no} has been ${status === 'draft' ? 'updated' : 'submitted for approval'}.`,
      });

      navigate('/memos');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (memoLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading memo...</div>;
  }

  if (!memo) {
    return <div className="p-8 text-center text-muted-foreground">Memo not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{memo?.status === 'draft' ? 'Edit Draft Memo' : 'Edit Memo'}</h1>
          <p className="text-sm text-muted-foreground">{memo.transmittal_no}</p>
        </div>
      </div>

      {/* Resubmit warning — visible whenever editing a non-draft memo.
          Spells out exactly what will happen when the editor saves so
          there are no surprises (collected signatures are invalidated;
          approvers must re-sign). Shown only when there's something at
          stake — wasAlreadySubmitted plus the count is non-zero. */}
      {wasAlreadySubmitted && (
        <Card className="border-warning/60 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <RotateCcw className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Editing a memo that's already in review</p>
              <p className="text-muted-foreground">
                Saving and resubmitting will <strong>reset the approval chain</strong>. {signedCount > 0 ? (
                  <>
                    {signedCount} approver{signedCount === 1 ? ' has' : 's have'} already signed —
                    their signatures will be invalidated and they will receive an email asking
                    them to re-sign on the updated content.
                  </>
                ) : (
                  <>The chain will start fresh from step 1 once you submit.</>
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                If you only need to update a small detail and the approvers won't mind re-signing, this is fine. For minor typos in already-approved sections, consider whether the edit is worth the round trip.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Memo Form */}
      <Card className="border-2">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">AH</span>
              </div>
              <div>
                <CardTitle className="text-lg">Al Hamra Real Estate Co.</CardTitle>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Internal Transmittal Memorandum</p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Header Table */}
          <div className="border border-input rounded-md overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-y divide-input">
              <div className="p-3 space-y-1">
                <Label className="text-xs font-bold uppercase text-muted-foreground">TO</Label>
                <Select value={toUserId} onValueChange={setToUserId}>
                  <SelectTrigger className="border-0 p-0 h-auto shadow-none text-sm font-medium">
                    <SelectValue placeholder="Select recipient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles
                      .filter((p) => p.user_id !== user?.id)
                      .map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.full_name} — {p.job_title || 'No title'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 space-y-1">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Transmittal No</Label>
                <p className="text-sm font-medium font-mono">{memo.transmittal_no}</p>
              </div>

              <div className="p-3 space-y-1">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Date</Label>
                <p className="text-sm font-medium">{currentDate}</p>
              </div>

              <div className="p-3 space-y-1">
                <Label className="text-xs font-bold uppercase text-muted-foreground">From</Label>
                <Select value={fromUserId} onValueChange={setFromUserId}>
                  <SelectTrigger className="border-0 p-0 h-auto shadow-none text-sm font-medium">
                    <SelectValue placeholder="Select sender..." />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name} — {p.job_title || 'No title'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const selectedProfile = profiles.find(p => p.user_id === fromUserId);
                  const dept = departments.find(d => d.id === selectedProfile?.department_id);
                  return dept ? <p className="text-xs text-muted-foreground">{dept.name}</p> : null;
                })()}
              </div>
            </div>
          </div>

          <Separator />
          <TransmittedForGrid selected={memoTypes} onChange={setMemoTypes} />
          <Separator />

          <div className="space-y-2">
            <Label htmlFor="subject" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter memo subject..."
              className="font-semibold text-base"
              maxLength={500}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Description</Label>
            <RichTextEditor content={description} onChange={setDescription} placeholder="Write the memo body here..." />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Action Required / Comments If Any</Label>
            <textarea
              value={actionComments}
              onChange={(e) => setActionComments(e.target.value)}
              placeholder="Enter any action required or comments..."
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Signature block preview */}
          <div className="pt-4 border-t border-input">
            <div className="text-sm">
              <p className="border-b border-foreground inline-block w-60 pb-1 mb-1">&nbsp;</p>
              <p className="font-medium">{(() => { const p = profiles.find(pr => pr.user_id === fromUserId); return p ? `${p.full_name}, ${p.job_title || ''}` : `${profile?.full_name}, ${profile?.job_title}`; })()}</p>
            </div>
          </div>

          <Separator />

          {/* Footer Fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Continuation Pages</Label>
              <Input
                type="number"
                min={0}
                value={continuationPages}
                onChange={(e) => setContinuationPages(parseInt(e.target.value) || 0)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase text-muted-foreground">No. of Attachments</Label>
              <Input type="text" value={existingAttachments.length + files.length} disabled className="h-8 bg-muted" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Reviewer</Label>
              <Select value={reviewerUserId} onValueChange={setReviewerUserId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select reviewer..." />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name} — {p.job_title || 'No title'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Initials</Label>
              <Input
                value={(() => {
                  const rp = profiles.find(p => p.user_id === reviewerUserId);
                  if (!rp) return '--';
                  const parts = rp.full_name.trim().split(' ');
                  if (parts.length === 1) return parts[0][0].toUpperCase();
                  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                })()}
                disabled
                className="h-8 bg-muted font-bold"
              />
            </div>
            <div className="col-span-2 md:col-span-4 space-y-1">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Copies To</Label>
              <UserMultiSelect
                profiles={profiles}
                selected={copiesTo}
                onChange={setCopiesTo}
                excludeUserIds={[]}
                placeholder="Select users to copy..."
              />
            </div>
          </div>

          <Separator />

          {/* Existing Attachments */}
          {existingAttachments.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Existing Attachments</Label>
              <div className="space-y-1">
                {existingAttachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>📎</span>
                    <span>{att.file_name}</span>
                    <span className="text-xs">({att.file_size ? `${(att.file_size / 1024).toFixed(1)} KB` : ''})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Add New Attachments</Label>
            <FileUpload files={files} onChange={setFiles} />
          </div>

          <Separator />

          {/* Workflow Builder */}
          <WorkflowBuilder
            departmentId={(() => {
              const selectedProfile = profiles.find(p => p.user_id === fromUserId);
              return selectedProfile?.department_id || profile?.department_id || null;
            })()}
            memoTypes={memoTypes}
            selectedTemplateId={selectedWorkflowId}
            onTemplateChange={setSelectedWorkflowId}
            customSteps={customSteps}
            onCustomStepsChange={setCustomSteps}
            mode={workflowMode}
            onModeChange={setWorkflowMode}
            pdfLayout={dynamicPdfLayout}
            onPdfLayoutChange={setDynamicPdfLayout}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={async () => {
          if (!memo) return;
          setPdfGenerating(true);
          try {
            const logoResponse = await fetch(alHamraLogo);
            const logoBlob = await logoResponse.blob();
            const logoDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(logoBlob);
            });
            const selectedFromProfile = profiles.find(p => p.user_id === fromUserId);
            const deptId = selectedFromProfile?.department_id || profile?.department_id;
            const dept = departments.find(d => d.id === deptId);
            const toProfile = toUserId ? profiles.find(p => p.user_id === toUserId) : undefined;
            const myProfile = user ? profiles.find(p => p.user_id === user.id) : undefined;
            const savedPrintPrefs: Partial<PrintPreferences> = {
              duplexMode: ((myProfile as any)?.print_duplex_mode as any) || 'long_edge',
              blankBackPages: (myProfile as any)?.print_blank_back_pages ?? true,
              colorMode: ((myProfile as any)?.print_color_mode as any) || 'color',
              pageNumberStyle: ((myProfile as any)?.print_page_number_style as any) || 'bottom_center',
            };
            const currentMemo = {
              ...memo,
              from_user_id: fromUserId || memo.from_user_id,
              to_user_id: toUserId || null,
              subject: subject || memo.subject,
              description,
              action_comments: actionComments || null,
              memo_types: memoTypes,
              continuation_pages: continuationPages,
              initials: (() => {
                const rp = profiles.find(p => p.user_id === reviewerUserId);
                if (!rp) return '--';
                const parts = rp.full_name.trim().split(' ');
                if (parts.length === 1) return parts[0][0].toUpperCase();
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
              })(),
              copies_to: copiesTo.length > 0 ? copiesTo : null,
              reviewer_user_id: reviewerUserId || null,
            };
            const pdfLayout = workflowTemplate?.pdf_layout || dynamicPdfLayout;
            const memoData = {
              memo: currentMemo as any,
              fromProfile: selectedFromProfile,
              toProfile,
              department: dept,
              approvalSteps: existingSteps,
              attachments: existingAttachments,
              profiles,
              departments,
              logoDataUrl,
            };
            const prepared = await prepareMemoData(memoData);
            const html = buildMemoHtml(memoData, prepared, { ...DEFAULT_PRINT_PREFERENCES, ...savedPrintPrefs }, pdfLayout as any);
            setPreviewHtml(html);
            setPrintPreviewOpen(true);
          } catch (error: any) {
            toast({ title: 'Preview Failed', description: error.message, variant: 'destructive' });
          } finally {
            setPdfGenerating(false);
          }
        }} disabled={pdfGenerating}>
          <FileDown className="h-4 w-4 mr-2" />
          {pdfGenerating ? 'Generating...' : 'Print Preview'}
        </Button>
        <Button variant="outline" onClick={() => saveMemo('draft')} disabled={submitting}>
          <Save className="h-4 w-4 mr-2" />
          Update Draft
        </Button>
        <Button
          onClick={() => {
            if (wasAlreadySubmitted) {
              setShowResetWarning(true);
            } else {
              saveMemo('submitted');
            }
          }}
          disabled={submitting}
        >
          <Send className="h-4 w-4 mr-2" />
          {submitting ? 'Submitting...' : 'Submit Memo'}
        </Button>
      </div>

      <PrintPreviewDialog
        open={printPreviewOpen}
        onClose={() => setPrintPreviewOpen(false)}
        htmlContent={previewHtml}
        onPrint={async (prefs) => {
          if (!memo) return;
          try {
            const logoResponse = await fetch(alHamraLogo);
            const logoBlob = await logoResponse.blob();
            const logoDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(logoBlob);
            });
            const selectedFromProfile = profiles.find(p => p.user_id === fromUserId);
            const deptId = selectedFromProfile?.department_id || profile?.department_id;
            const dept = departments.find(d => d.id === deptId);
            const toProfile = toUserId ? profiles.find(p => p.user_id === toUserId) : undefined;
            const currentMemo = {
              ...memo,
              from_user_id: fromUserId || memo.from_user_id,
              to_user_id: toUserId || null,
              subject: subject || memo.subject,
              description,
              action_comments: actionComments || null,
              memo_types: memoTypes,
              continuation_pages: continuationPages,
              initials: '--',
              copies_to: copiesTo.length > 0 ? copiesTo : null,
              reviewer_user_id: reviewerUserId || null,
            };
            const pdfLayout = workflowTemplate?.pdf_layout || dynamicPdfLayout;
            await generateMemoPdf({
              memo: currentMemo as any,
              fromProfile: selectedFromProfile,
              toProfile,
              department: dept,
              approvalSteps: existingSteps,
              attachments: existingAttachments,
              profiles,
              departments,
              logoDataUrl,
            }, prefs, pdfLayout as any);
          } catch (error: any) {
            toast({ title: 'PDF Export Failed', description: error.message, variant: 'destructive' });
          }
        }}
      />

      {/* Workflow Reset Warning Dialog */}
      <AlertDialog open={showResetWarning} onOpenChange={setShowResetWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Approval Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This memo has already been submitted for approval. Re-submitting will <strong>reset the entire approval workflow</strong> — all existing approvals, signatures, and comments will be cleared and the process will start over from the beginning.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => saveMemo('submitted')}>
              Yes, Reset & Resubmit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MemoEdit;
