import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collectDeviceInfo, getClientIp, resolveIpGeolocation } from '@/lib/device-info';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fetchProfiles, fetchDepartments, getNextTransmittalNo, uploadAttachment } from '@/lib/memo-api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
import { Save, Send, ArrowLeft, FileDown } from 'lucide-react';
import { buildMemoHtml } from '@/lib/memo-pdf-html';
import { generateMemoPdf, prepareMemoData, type PrintPreferences, DEFAULT_PRINT_PREFERENCES } from '@/lib/memo-pdf';
import PrintPreviewDialog from '@/components/memo/PrintPreviewDialog';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

const MemoCreate = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Form state
  const [fromUserId, setFromUserId] = useState(user?.id || '');
  const [toUserId, setToUserId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [memoTypes, setMemoTypes] = useState<MemoType[]>([]);
  const [actionComments, setActionComments] = useState('');
  const [continuationPages, setContinuationPages] = useState(0);
  const [reviewerUserId, setReviewerUserId] = useState('');
  const [initials, setInitials] = useState('');
  const [copiesTo, setCopiesTo] = useState<string[]>([]);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  // Workflow builder state
  const [workflowMode, setWorkflowMode] = useState<'preset' | 'dynamic'>('preset');
  const [customSteps, setCustomSteps] = useState<WorkflowStepDef[]>([]);
  const [dynamicPdfLayout, setDynamicPdfLayout] = useState<PdfLayout>(DEFAULT_PDF_LAYOUT);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  // Fetch users and departments
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const currentDate = format(new Date(), "dd/MM/yyyy");
  const userDept = departments.find((d) => d.id === profile?.department_id);

  const saveMemo = async (status: 'draft' | 'submitted') => {
    if (!user || !profile?.department_id) {
      toast({ title: 'Error', description: 'User profile not configured. Contact admin.', variant: 'destructive' });
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

      // Validate dynamic workflow
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

    // Validate at least one workflow step exists before submitting
    if (status === 'submitted') {
      if (workflowMode === 'dynamic' && customSteps.length === 0) {
        toast({ title: 'Workflow Required', description: 'Please add at least one approval step before submitting.', variant: 'destructive' });
        return;
      }
      if (workflowMode === 'preset' && !selectedWorkflowId) {
        // Check if there are any auto-matchable templates for this department
        const deptId = profiles.find(p => p.user_id === fromUserId)?.department_id || profile?.department_id;
        const { data: templates } = await supabase
          .from('workflow_templates')
          .select('id')
          .or(`department_id.eq.${deptId},department_id.is.null`)
          .limit(1);
        if (!templates || templates.length === 0) {
          toast({ title: 'Workflow Required', description: 'No workflow template found. Please switch to Dynamic Workflow and add at least one approval step.', variant: 'destructive' });
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const selectedFromProfile = profiles.find(p => p.user_id === fromUserId);
      const deptId = selectedFromProfile?.department_id || profile?.department_id;
      
      if (!deptId) {
        toast({ title: 'Error', description: 'Selected sender has no department assigned.', variant: 'destructive' });
        return;
      }

      const transmittalNo = await getNextTransmittalNo(deptId);

      const copiesArray = copiesTo;

      // Derive initials from reviewer
      const reviewerProfile = reviewerUserId ? profiles.find(p => p.user_id === reviewerUserId) : null;
      const derivedInitials = reviewerProfile
        ? (() => {
            const parts = reviewerProfile.full_name.trim().split(' ');
            if (parts.length === 1) return parts[0][0].toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          })()
        : null;

      const { data: memo, error: memoError } = await supabase
        .from('memos')
        .insert({
          transmittal_no: transmittalNo,
          // CRITICAL: from_user_id is the FORM-SELECTED author of the memo
          // (e.g. Rami when Monia is creating on his behalf). It must NOT
          // default to the logged-in user (user.id) — that conflates the
          // person who pressed Submit with the person whose name and
          // signature appear on the memo body. Falls back to user.id only
          // if no fromUserId was selected (shouldn't happen for properly
          // filled forms, but the form may default to logged-in user).
          from_user_id: fromUserId || user.id,
          // created_by_user_id tracks the user who physically pressed
          // Submit. Always equals user.id. Used by the INSERT RLS policy
          // (so on-behalf-of creation works without violating policy)
          // and for audit purposes (so we can later answer "who actually
          // created this memo?" even when from_user_id is someone else).
          created_by_user_id: user.id,
          to_user_id: toUserId || null,
          department_id: deptId,
          subject: subject.trim() || 'Untitled Memo',
          description,
          action_comments: actionComments || null,
          status: status === 'draft' ? 'draft' : 'submitted',
          memo_types: memoTypes,
          continuation_pages: continuationPages,
          initials: derivedInitials || '--',
          copies_to: copiesArray.length > 0 ? copiesArray : null,
          reviewer_user_id: reviewerUserId || null,
        } as any)
        .select()
        .single();

      if (memoError) throw memoError;

      // Upload attachments
      for (const attachment of files) {
        await uploadAttachment(memo.id, attachment.file, user.id);
      }

      // Audit log with device info + IP
      const deviceInfo = collectDeviceInfo();
      const clientIp = await getClientIp();
      const geo = clientIp ? await resolveIpGeolocation(clientIp) : { city: null, country: null };
      await supabase.from('audit_log').insert({
        memo_id: memo.id,
        user_id: user.id,
        action: status === 'draft' ? 'memo_drafted' : 'memo_submitted',
        details: { transmittal_no: transmittalNo },
        ip_address: clientIp,
        ip_geolocation_city: geo.city,
        ip_geolocation_country: geo.country,
        ...deviceInfo,
      } as any);

      // If submitting, trigger workflow creation via edge function
      if (status === 'submitted') {
        const body: any = { memo_id: memo.id };

        if (workflowMode === 'preset') {
          body.workflow_template_id = selectedWorkflowId || undefined;
        } else if (workflowMode === 'dynamic' && customSteps.length > 0) {
          body.custom_steps = customSteps;
          body.pdf_layout = dynamicPdfLayout;
        }

        const { data: submitResult, error: submitError } = await supabase.functions.invoke('submit-memo', {
          body,
        });
        if (submitError) {
          console.warn('Workflow creation warning:', submitError);
        } else {
          console.log('Workflow result:', submitResult);
        }
      }

      toast({
        title: status === 'draft' ? 'Draft Saved' : 'Memo Submitted',
        description: `${transmittalNo} has been ${status === 'draft' ? 'saved as draft' : 'submitted for approval'}.`,
      });

      navigate('/memos');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create New Memo</h1>
          <p className="text-sm text-muted-foreground">Internal Transmittal Memorandum</p>
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
                <p className="text-sm text-muted-foreground italic">Auto-generated on save</p>
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
              <Input type="text" value={files.length} disabled className="h-8 bg-muted" />
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

          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Attachments</Label>
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
            const fakeMemo = {
              id: 'preview',
              transmittal_no: 'PREVIEW',
              from_user_id: fromUserId || user?.id || '',
              to_user_id: toUserId || null,
              department_id: deptId || '',
              subject: subject || 'Untitled Memo',
              description,
              action_comments: actionComments || null,
              status: 'draft' as const,
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
              date: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              current_step: 0,
              revision_count: 0,
              workflow_template_id: null,
            };
            const memoData = {
              memo: fakeMemo as any,
              fromProfile: selectedFromProfile,
              toProfile,
              department: dept,
              approvalSteps: [],
              attachments: [],
              profiles,
              departments,
              logoDataUrl,
            };
            const prepared = await prepareMemoData(memoData);
            const html = buildMemoHtml(memoData, prepared, { ...DEFAULT_PRINT_PREFERENCES, ...savedPrintPrefs }, dynamicPdfLayout);
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
          Save as Draft
        </Button>
        <Button onClick={() => saveMemo('submitted')} disabled={submitting}>
          <Send className="h-4 w-4 mr-2" />
          {submitting ? 'Submitting...' : 'Submit Memo'}
        </Button>
      </div>

      <PrintPreviewDialog
        open={printPreviewOpen}
        onClose={() => setPrintPreviewOpen(false)}
        htmlContent={previewHtml}
        onPrint={async (prefs) => {
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
            const fakeMemo = {
              id: 'preview',
              transmittal_no: 'PREVIEW',
              from_user_id: fromUserId || user?.id || '',
              to_user_id: toUserId || null,
              department_id: deptId || '',
              subject: subject || 'Untitled Memo',
              description,
              action_comments: actionComments || null,
              status: 'draft' as const,
              memo_types: memoTypes,
              continuation_pages: continuationPages,
              initials: '--',
              copies_to: copiesTo.length > 0 ? copiesTo : null,
              reviewer_user_id: reviewerUserId || null,
              date: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              current_step: 0,
              revision_count: 0,
              workflow_template_id: null,
            };
            await generateMemoPdf({
              memo: fakeMemo as any,
              fromProfile: selectedFromProfile,
              toProfile,
              department: dept,
              approvalSteps: [],
              attachments: [],
              profiles,
              departments,
              logoDataUrl,
            }, prefs, dynamicPdfLayout);
          } catch (error: any) {
            toast({ title: 'PDF Export Failed', description: error.message, variant: 'destructive' });
          }
        }}
      />
    </div>
  );
};

export default MemoCreate;
