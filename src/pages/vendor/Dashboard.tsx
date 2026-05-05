import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  fetchAttachmentsForVendor, fetchRequirementsForType,
  vendorFacingStatusLabel, type VendorRow, type VendorAttachment,
  invokeDocumentReview, vendorResubmit,
  postAttachmentMessage, fetchMessagesForAttachment,
  HUMAN_STATUS_LABEL, type AttachmentHumanStatus, type AttachmentMessage,
} from '@/lib/vendor-api';
import {
  Building2, LogOut, FileText, CheckCircle2, XCircle, AlertCircle,
  Loader2, Save, Upload, MessageSquare, Send, HelpCircle, RefreshCw,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

const VendorDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [authChecked, setAuthChecked] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);

  // Auth + vendor binding
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/vendor/login');
        return;
      }
      const { data: vu } = await supabase
        .from('vendor_users' as any)
        .select('vendor_id, is_active')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!vu || !(vu as any).is_active) {
        await supabase.auth.signOut();
        navigate('/vendor/login');
        return;
      }
      setVendorId((vu as any).vendor_id);
      setAuthChecked(true);
    })();
  }, [navigate]);

  const { data: vendor } = useQuery<VendorRow | null>({
    queryKey: ['vendor-self', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors' as any)
        .select('*')
        .eq('id', vendorId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!vendorId,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['vendor-self-attachments', vendorId],
    queryFn: () => fetchAttachmentsForVendor(vendorId!),
    enabled: !!vendorId,
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['vendor-self-requirements', vendor?.vendor_type_id],
    queryFn: () => fetchRequirementsForType(vendor!.vendor_type_id),
    enabled: !!vendor?.vendor_type_id,
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/vendor/login');
  };

  const [resubmitting, setResubmitting] = useState(false);
  const handleResubmit = async () => {
    if (!vendorId) return;
    setResubmitting(true);
    try {
      const r = await vendorResubmit(vendorId);
      if (r.error) {
        toast({ title: 'Could not resubmit', description: r.error, variant: 'destructive' });
      } else {
        toast({
          title: 'Resubmitted',
          description: 'We\'ve let our procurement team know. We\'ll be in touch.',
        });
        queryClient.invalidateQueries({ queryKey: ['vendor-self', vendorId] });
        queryClient.invalidateQueries({ queryKey: ['vendor-self-attachments', vendorId] });
      }
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setResubmitting(false);
    }
  };

  if (!authChecked || !vendor) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  const statusLabel = vendorFacingStatusLabel(vendor.status);
  const isBlocked = vendor.status === 'blocked_documents_expired';
  const isAwaitingResponse = vendor.status === 'awaiting_vendor_response';

  // Count outstanding items (those procurement marked as rejected or
  // clarification_requested) so we can show a clear "X items need
  // attention" banner.
  const pendingFromProcurement = (attachments as VendorAttachment[]).filter((a) => {
    const hs = (a as any).human_status as AttachmentHumanStatus | undefined;
    return hs === 'rejected' || hs === 'clarification_requested';
  });

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{vendor.legal_name_en}</h1>
              <p className="text-xs text-muted-foreground font-mono">{vendor.vendor_reference_no}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-1">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-base font-semibold">{statusLabel.en}</p>
            <p className="text-sm text-muted-foreground" dir="rtl">{statusLabel.ar}</p>
            {isBlocked && vendor.blocked_reason && (
              <div className="mt-3 p-3 bg-destructive/10 border-l-2 border-destructive rounded text-sm">
                <p className="font-semibold text-destructive">Action required</p>
                <p className="text-muted-foreground">{vendor.blocked_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Awaiting-response banner: shown when procurement has sent
            feedback that we (the vendor) need to act on. */}
        {isAwaitingResponse && pendingFromProcurement.length > 0 && (
          <Card className="border-warning/60 bg-warning/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">We need a few things from you</p>
                  <p className="text-muted-foreground">
                    Our procurement team has reviewed your registration and asked for changes
                    on <strong>{pendingFromProcurement.length}</strong> document
                    {pendingFromProcurement.length !== 1 ? 's' : ''}. Open the Documents tab below to
                    see what they need, then click <strong>Resubmit for review</strong> when you're done.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1" dir="rtl">
                    قام فريق المشتريات بمراجعة طلبكم وطلب تعديلات على <strong>{pendingFromProcurement.length}</strong> مستند.
                    افتح علامة تبويب المستندات أدناه لرؤية ما يحتاجونه، ثم انقر على <strong>إعادة الإرسال للمراجعة</strong> عند الانتهاء.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleResubmit}
                disabled={resubmitting}
                className="w-full sm:w-auto gap-1"
              >
                {resubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Resubmit for review
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="documents">Documents ({attachments.length})</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <DocumentsTab
              vendorId={vendorId!}
              vendorTypeId={vendor.vendor_type_id}
              attachments={attachments}
              requirements={requirements as any}
              onChange={() => queryClient.invalidateQueries({ queryKey: ['vendor-self-attachments', vendorId] })}
            />
          </TabsContent>

          <TabsContent value="profile">
            <ProfileTab vendor={vendor} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['vendor-self', vendorId] })} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Documents tab
// ---------------------------------------------------------------------

const DocumentsTab = ({
  vendorId, vendorTypeId, attachments, requirements, onChange,
}: {
  vendorId: string;
  vendorTypeId: string;
  attachments: VendorAttachment[];
  requirements: any[];
  onChange: () => void;
}) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const byType: Record<string, VendorAttachment[]> = {};
  for (const a of attachments) {
    const k = a.document_type_id || 'other';
    (byType[k] ||= []).push(a);
  }

  const handleUpload = async (documentTypeId: string, file: File) => {
    setUploading((u) => ({ ...u, [documentTypeId]: true }));
    try {
      const path = `${vendorId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from('vendor-attachments')
        .upload(path, file);
      if (upErr) throw upErr;

      const { data: row, error } = await supabase
        .from('vendor_attachments' as any)
        .insert({
          vendor_id: vendorId,
          document_type_id: documentTypeId,
          file_name: file.name,
          file_url: path,
          file_size: file.size,
          file_mime_type: file.type,
        } as any)
        .select('id')
        .single();
      if (error) throw error;

      // Trigger AI review
      await invokeDocumentReview((row as any).id);
      onChange();
      toast({ title: 'Uploaded', description: 'Document uploaded and reviewed.' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setUploading((u) => ({ ...u, [documentTypeId]: false }));
    }
  };

  return (
    <div className="space-y-3">
      {requirements.map((req) => {
        const docs = byType[req.document_type_id] || [];
        const latest = docs[0];
        const isUploading = uploading[req.document_type_id];
        return (
          <Card key={req.id}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">
                    {req.document_type?.label_en}
                    {req.is_required && !req.is_conditional && <span className="text-destructive ml-1">*</span>}
                  </p>
                  <p className="text-xs text-muted-foreground" dir="rtl">{req.document_type?.label_ar}</p>
                </div>
                <label>
                  <Button asChild variant="outline" size="sm" className="gap-1" disabled={isUploading}>
                    <span>
                      {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {latest ? 'Replace' : 'Upload'}
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(req.document_type_id, f); }}
                  />
                </label>
              </div>
              {latest && <DocStatusRow attachment={latest} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

/**
 * Vendor's per-attachment view. Replaces the previous AI-verdict
 * display with the AUTHORITATIVE procurement verdict (human_status):
 *   approved             — green check, locked
 *   rejected             — red, vendor must replace + reason shown
 *   clarification_requested — amber, question shown, can reply or replace
 *   pending_review       — neutral, awaiting our review
 *
 * The AI verdict from before is no longer shown to vendors directly —
 * it's a procurement-only signal now. Once procurement reviews, what
 * matters is procurement's call.
 *
 * Includes a collapsible message thread per attachment where the vendor
 * can read procurement's notes and reply.
 */
const DocStatusRow = ({ attachment: a }: { attachment: VendorAttachment }) => {
  const { toast } = useToast();
  const [showThread, setShowThread] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const expiry = a.expiry_date ? parseISO(a.expiry_date) : null;
  const days = expiry ? differenceInDays(expiry, new Date()) : null;
  const expired = days !== null && days < 0;

  const humanStatus = (a as any).human_status as AttachmentHumanStatus | undefined;
  // Default to pending_review when not set (shouldn't happen post-migration
  // since there's a default at the DB level, but defensive).
  const effectiveStatus: AttachmentHumanStatus = humanStatus || 'pending_review';

  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['vendor-self-attachment-messages', a.id],
    queryFn: () => fetchMessagesForAttachment(a.id),
    enabled: showThread,
  });

  const handleReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const r = await postAttachmentMessage({ attachment_id: a.id, message: reply.trim() });
      if (r.error) {
        toast({ title: 'Could not send', description: r.error, variant: 'destructive' });
      } else {
        setReply('');
        await refetchMessages();
      }
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-muted/30 rounded p-2 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">{a.file_name}</span>
        </div>
        {effectiveStatus === 'approved' && (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px] gap-1">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </Badge>
        )}
        {effectiveStatus === 'rejected' && (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <XCircle className="h-3 w-3" /> Replace this file
          </Badge>
        )}
        {effectiveStatus === 'clarification_requested' && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] gap-1">
            <HelpCircle className="h-3 w-3" /> We have a question
          </Badge>
        )}
        {effectiveStatus === 'pending_review' && (
          <Badge variant="outline" className="text-[10px]">Awaiting our review</Badge>
        )}
      </div>

      {expiry && (
        <p className={expired ? 'text-destructive font-semibold' : days !== null && days <= 30 ? 'text-warning' : 'text-muted-foreground'}>
          {expired ? `Expired ${-days} days ago` : `Expires ${format(expiry, 'dd MMM yyyy')} (in ${days} days)`}
        </p>
      )}

      {/* Procurement's note */}
      {(a as any).human_status_reason && effectiveStatus !== 'approved' && (
        <div className="bg-background border-l-2 border-warning px-2 py-1.5 rounded">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">From our procurement team:</p>
          <p>{(a as any).human_status_reason}</p>
        </div>
      )}

      {effectiveStatus !== 'approved' && (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => setShowThread((s) => !s)}
          >
            <MessageSquare className="h-3 w-3" />
            {showThread ? 'Hide messages' : 'Reply or ask a question'}
            {messages.length > 0 && ` (${messages.length})`}
          </Button>
        </div>
      )}

      {/* Message thread */}
      {showThread && (
        <div className="bg-background rounded p-2 space-y-2 border border-border">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-[10px]">No messages yet. Use the box below to ask a question or explain.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {messages.map((m: AttachmentMessage) => (
                <div key={m.id} className={`flex ${m.author_kind === 'procurement' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`px-2 py-1 rounded max-w-[85%] ${
                    m.author_kind === 'procurement'
                      ? 'bg-primary/10 text-foreground'
                      : 'bg-muted text-foreground'
                  }`}>
                    <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5 opacity-60">
                      {m.author_kind === 'procurement' ? 'Al Hamra procurement' : 'You'} • {format(parseISO(m.created_at), 'dd MMM HH:mm')}
                    </p>
                    <p className="whitespace-pre-wrap">{m.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <Input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type a reply..."
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && reply.trim()) {
                  e.preventDefault();
                  handleReply();
                }
              }}
            />
            <Button size="sm" className="h-7 px-2" disabled={!reply.trim() || sending} onClick={handleReply}>
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------
// Profile tab — submit updates as change requests
// ---------------------------------------------------------------------

const ProfileTab = ({ vendor, onUpdate }: { vendor: VendorRow; onUpdate: () => void }) => {
  const { toast } = useToast();
  const [edited, setEdited] = useState({
    contact_name: vendor.contact_name,
    contact_email: vendor.contact_email,
    contact_phone: vendor.contact_phone || '',
    contact_position: vendor.contact_position || '',
    address_line1: vendor.address_line1 || '',
    city: vendor.city || '',
    bank_name: vendor.bank_name || '',
    bank_account_name: vendor.bank_account_name || '',
    bank_iban: vendor.bank_iban || '',
    bank_swift_bic: vendor.bank_swift_bic || '',
  });
  const [saving, setSaving] = useState(false);

  const isUpdatePending = ['update_submitted', 'update_approved_pending_sap_update'].includes(vendor.status);

  const handleSubmitUpdate = async () => {
    setSaving(true);
    try {
      // Compute the diff: only fields that changed
      const proposed: Record<string, any> = {};
      for (const [k, v] of Object.entries(edited)) {
        if ((vendor as any)[k] !== v && v !== '') proposed[k] = v;
      }
      if (Object.keys(proposed).length === 0) {
        toast({ title: 'No changes', description: 'Edit a field to submit an update.' });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Insert change request
      const { error: crErr } = await supabase
        .from('vendor_change_requests' as any)
        .insert({
          vendor_id: vendor.id,
          proposed_changes: proposed,
          submitted_by_user_id: user?.id,
          submitted_by_kind: 'vendor',
        } as any);
      if (crErr) throw crErr;

      // Mark vendor status as update_submitted
      await supabase
        .from('vendors' as any)
        .update({ status: 'update_submitted' } as any)
        .eq('id', vendor.id);

      // Audit log
      await supabase.from('vendor_audit_log' as any).insert({
        vendor_id: vendor.id,
        action: 'update_submitted',
        actor_user_id: user?.id,
        actor_kind: 'vendor',
        notes: 'Vendor submitted an update via portal.',
        metadata: { changed_fields: Object.keys(proposed) },
      } as any);

      toast({ title: 'Update submitted', description: 'Our procurement team will review your changes.' });
      onUpdate();
    } catch (e: any) {
      toast({ title: 'Submission failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isUpdatePending && (
          <div className="bg-warning/10 border-l-2 border-warning p-3 text-sm rounded">
            <p className="font-semibold text-warning">Update under review</p>
            <p className="text-muted-foreground">Your previous update is still being processed. You can edit again once it's complete.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Contact name" value={edited.contact_name} onChange={(v) => setEdited({ ...edited, contact_name: v })} />
          <FormField label="Contact email" value={edited.contact_email} onChange={(v) => setEdited({ ...edited, contact_email: v })} />
          <FormField label="Phone" value={edited.contact_phone} onChange={(v) => setEdited({ ...edited, contact_phone: v })} />
          <FormField label="Position" value={edited.contact_position} onChange={(v) => setEdited({ ...edited, contact_position: v })} />
          <FormField label="Address" value={edited.address_line1} onChange={(v) => setEdited({ ...edited, address_line1: v })} />
          <FormField label="City" value={edited.city} onChange={(v) => setEdited({ ...edited, city: v })} />
          <FormField label="Bank name" value={edited.bank_name} onChange={(v) => setEdited({ ...edited, bank_name: v })} />
          <FormField label="Account holder" value={edited.bank_account_name} onChange={(v) => setEdited({ ...edited, bank_account_name: v })} />
          <FormField label="IBAN" value={edited.bank_iban} onChange={(v) => setEdited({ ...edited, bank_iban: v })} />
          <FormField label="SWIFT/BIC" value={edited.bank_swift_bic} onChange={(v) => setEdited({ ...edited, bank_swift_bic: v })} />
        </div>

        <Button onClick={handleSubmitUpdate} disabled={saving || isUpdatePending} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Submit update
        </Button>
        <p className="text-xs text-muted-foreground">
          Changes go to our procurement team for review. You'll be notified once they're applied.
        </p>
      </CardContent>
    </Card>
  );
};

const FormField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

export default VendorDashboard;
