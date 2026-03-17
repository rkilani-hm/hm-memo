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
import { format } from 'date-fns';
import { Save, Send, ArrowLeft } from 'lucide-react';

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

  // Load memo data into form
  useEffect(() => {
    if (memo && !loaded) {
      setFromUserId(memo.from_user_id);
      setToUserId(memo.to_user_id || '');
      setSubject(memo.subject);
      setDescription(memo.description || '');
      setMemoTypes((memo.memo_types || []) as MemoType[]);
      setContinuationPages(memo.continuation_pages || 0);
      setInitials(memo.initials || '');
      setReviewerUserId((memo as any).reviewer_user_id || '');
      setCopiesTo(memo.copies_to || []);
      setLoaded(true);
    }
  }, [memo, loaded]);

  const editableStatuses = ['draft', 'submitted', 'in_review', 'rejected', 'rework'];
  const wasAlreadySubmitted = memo && ['submitted', 'in_review', 'rejected', 'rework'].includes(memo.status);
  const isEditable = memo && (
    editableStatuses.includes(memo.status) &&
    (memo.from_user_id === user?.id || isAdmin)
  );

  // Redirect if not editable
  useEffect(() => {
    if (memo && !isEditable) {
      toast({ title: 'Cannot Edit', description: 'This memo cannot be edited in its current state.', variant: 'destructive' });
      navigate(`/memos/${id}`);
    }
  }, [memo, isEditable]);

  const currentDate = memo ? format(new Date(memo.date), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy');

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
        if (customSteps.some((s) => s.approver_user_id === user.id)) {
          toast({ title: 'Validation Error', description: 'You cannot add yourself as an approver.', variant: 'destructive' });
          return;
        }
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

      // If editing a submitted/in_review memo, reset approval steps first
      const wasSubmitted = ['submitted', 'in_review', 'rejected', 'rework'].includes(memo.status);
      if (wasSubmitted) {
        // Delete existing approval steps
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

      const { error: updateError } = await supabase
        .from('memos')
        .update({
          from_user_id: fromUserId || memo.from_user_id,
          to_user_id: toUserId || null,
          subject: subject.trim() || 'Untitled Memo',
          description,
          status: status === 'draft' ? 'draft' : 'submitted',
          memo_types: memoTypes,
          continuation_pages: continuationPages,
          initials: derivedInitials,
          copies_to: copiesArray.length > 0 ? copiesArray : null,
          current_step: status === 'draft' ? 0 : memo.current_step,
          reviewer_user_id: reviewerUserId || null,
        } as any)
        .eq('id', memo.id);

      if (updateError) throw updateError;

      // Upload new attachments
      for (const attachment of files) {
        await uploadAttachment(memo.id, attachment.file, user.id);
      }

      // Audit log
      const deviceInfo = collectDeviceInfo();
      const clientIp = await getClientIp();
      const geo = clientIp ? await resolveIpGeolocation(clientIp) : { city: null, country: null };
      await supabase.from('audit_log').insert({
        memo_id: memo.id,
        user_id: user.id,
        action: status === 'draft' ? 'memo_updated' : 'memo_submitted',
        details: { transmittal_no: memo.transmittal_no },
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
        }
        const { error: submitError } = await supabase.functions.invoke('submit-memo', { body });
        if (submitError) console.warn('Workflow creation warning:', submitError);
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
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pb-8">
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
