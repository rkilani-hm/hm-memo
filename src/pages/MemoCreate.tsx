import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import type { FileAttachment } from '@/components/memo/FileUpload';
import type { MemoType } from '@/components/memo/TransmittedForGrid';
import { format } from 'date-fns';
import { Save, Send, ArrowLeft } from 'lucide-react';

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
  const [continuationPages, setContinuationPages] = useState(0);
  const [initials, setInitials] = useState(profile?.initials || '');
  const [copiesTo, setCopiesTo] = useState('');
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch users and departments
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const currentDate = format(new Date(), "do MMMM yyyy");
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
    }

    setSubmitting(true);
    try {
      const selectedFromProfile = profiles.find(p => p.user_id === fromUserId);
      const deptId = selectedFromProfile?.department_id || profile?.department_id;
      
      if (!deptId) {
        toast({ title: 'Error', description: 'Selected sender has no department assigned.', variant: 'destructive' });
        return;
      }

      // Get transmittal number
      const transmittalNo = await getNextTransmittalNo(deptId);

      const copiesArray = copiesTo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // Insert memo
      const { data: memo, error: memoError } = await supabase
        .from('memos')
        .insert({
          transmittal_no: transmittalNo,
          from_user_id: user.id,
          to_user_id: toUserId || null,
          department_id: deptId,
          subject: subject.trim() || 'Untitled Memo',
          description,
          status: status === 'draft' ? 'draft' : 'submitted',
          memo_types: memoTypes,
          continuation_pages: continuationPages,
          initials: initials.trim() || null,
          copies_to: copiesArray.length > 0 ? copiesArray : null,
        })
        .select()
        .single();

      if (memoError) throw memoError;

      // Upload attachments
      for (const attachment of files) {
        await uploadAttachment(memo.id, attachment.file, user.id);
      }

      // Log to audit trail
      await supabase.from('audit_log').insert({
        memo_id: memo.id,
        user_id: user.id,
        action: status === 'draft' ? 'memo_drafted' : 'memo_submitted',
        details: { transmittal_no: transmittalNo },
      });

      // If submitting, trigger workflow creation via edge function
      if (status === 'submitted') {
        const { data: submitResult, error: submitError } = await supabase.functions.invoke('submit-memo', {
          body: { memo_id: memo.id },
        });
        if (submitError) {
          console.warn('Workflow creation warning:', submitError);
          // Non-blocking — memo is already saved as submitted
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

      {/* Memo Form - Transmittal Layout */}
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
              {/* TO */}
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

              {/* TRANSMITTAL NO */}
              <div className="p-3 space-y-1">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Transmittal No</Label>
                <p className="text-sm text-muted-foreground italic">Auto-generated on save</p>
              </div>

              {/* DATE */}
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

          {/* Transmitted For Grid */}
          <TransmittedForGrid selected={memoTypes} onChange={setMemoTypes} />

          <Separator />

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Subject
            </Label>
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

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </Label>
            <RichTextEditor
              content={description}
              onChange={setDescription}
              placeholder="Write the memo body here..."
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
              <Input
                type="text"
                value={files.length}
                disabled
                className="h-8 bg-muted"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Initials</Label>
              <Input
                value={initials}
                onChange={(e) => setInitials(e.target.value.slice(0, 4))}
                placeholder="e.g. MK"
                className="h-8"
                maxLength={4}
              />
            </div>
            <div className="col-span-2 md:col-span-1 space-y-1">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Copies To</Label>
              <Input
                value={copiesTo}
                onChange={(e) => setCopiesTo(e.target.value)}
                placeholder="Comma-separated..."
                className="h-8"
                maxLength={500}
              />
            </div>
          </div>

          <Separator />

          {/* File Attachments */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Attachments
            </Label>
            <FileUpload files={files} onChange={setFiles} />
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pb-8">
        <Button
          variant="outline"
          onClick={() => saveMemo('draft')}
          disabled={submitting}
        >
          <Save className="h-4 w-4 mr-2" />
          Save as Draft
        </Button>
        <Button
          onClick={() => saveMemo('submitted')}
          disabled={submitting}
        >
          <Send className="h-4 w-4 mr-2" />
          {submitting ? 'Submitting...' : 'Submit Memo'}
        </Button>
      </div>
    </div>
  );
};

export default MemoCreate;
