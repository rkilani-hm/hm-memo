import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  fetchAttachmentsForVendor, fetchRequirementsForType,
  vendorFacingStatusLabel, type VendorRow, type VendorAttachment,
  invokeDocumentReview,
} from '@/lib/vendor-api';
import { Building2, LogOut, FileText, CheckCircle2, XCircle, AlertCircle, Loader2, Save, Upload } from 'lucide-react';
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

  if (!authChecked || !vendor) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  const statusLabel = vendorFacingStatusLabel(vendor.status);
  const isBlocked = vendor.status === 'blocked_documents_expired';

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

const DocStatusRow = ({ attachment: a }: { attachment: VendorAttachment }) => {
  const expiry = a.expiry_date ? parseISO(a.expiry_date) : null;
  const days = expiry ? differenceInDays(expiry, new Date()) : null;
  const expired = days !== null && days < 0;

  return (
    <div className="bg-muted/30 rounded p-2 text-xs space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">{a.file_name}</span>
        </div>
        {a.ai_verdict === 'accepted' && <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Accepted</span>}
        {a.ai_verdict === 'rejected' && <span className="text-destructive flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Rejected</span>}
        {a.ai_verdict === 'soft_pending' && <span className="text-warning flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Reviewing</span>}
      </div>
      {expiry && (
        <p className={expired ? 'text-destructive font-semibold' : days !== null && days <= 30 ? 'text-warning' : 'text-muted-foreground'}>
          {expired ? `Expired ${-days} days ago` : `Expires ${format(expiry, 'dd MMM yyyy')} (in ${days} days)`}
        </p>
      )}
      {a.ai_verdict === 'rejected' && a.ai_rejection_reason && (
        <p className="text-destructive">Reason: {a.ai_rejection_reason}</p>
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
