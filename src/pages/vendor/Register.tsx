import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  fetchVendorTypes, fetchRequirementsForType, invokeDocumentReview,
} from '@/lib/vendor-api';
import {
  Building2, ArrowLeft, ArrowRight, Upload, FileText, CheckCircle2,
  XCircle, Loader2, AlertCircle, CheckCheck,
} from 'lucide-react';

// 5 steps: 1=type, 2=company, 3=bank, 4=docs, 5=review
const STEPS = [
  { num: 1, title: 'Vendor Type' },
  { num: 2, title: 'Company & Contact' },
  { num: 3, title: 'Bank Details' },
  { num: 4, title: 'Documents' },
  { num: 5, title: 'Review & Submit' },
];

interface UploadedDoc {
  id: string;                    // attachment_id
  document_type_id: string;
  file_name: string;
  ai_verdict: 'pending' | 'accepted' | 'rejected' | 'soft_pending';
  ai_rejection_reason?: string;
  ai_summary?: string;
}

const VendorRegister = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  // Form state
  const [vendorTypeId, setVendorTypeId] = useState<string>('');
  const [form, setForm] = useState({
    legal_name_en: '', legal_name_ar: '', trading_name: '',
    country: 'KW', city: '', address_line1: '', address_line2: '',
    industry_activity: '', website: '',
    contact_name: '', contact_email: '', contact_phone: '', contact_position: '',
    signatory_name: '', signatory_position: '', signatory_civil_id_or_passport: '',
    bank_name: '', bank_branch: '', bank_account_name: '',
    bank_account_number: '', bank_iban: '', bank_swift_bic: '', bank_currency: 'KWD',
    payment_terms_preference: '',
  });
  const [uploads, setUploads] = useState<Record<string, UploadedDoc>>({});  // by document_type_id
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [attestation, setAttestation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdVendorRef, setCreatedVendorRef] = useState<string | null>(null);

  const { data: vendorTypes = [] } = useQuery({
    queryKey: ['vendor-types-public'], queryFn: fetchVendorTypes,
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ['vendor-requirements-public', vendorTypeId],
    queryFn: () => fetchRequirementsForType(vendorTypeId),
    enabled: !!vendorTypeId,
  });

  const selectedType = vendorTypes.find((t) => t.id === vendorTypeId);
  const requiredDocs = (requirements as any[]).filter((r) => r.is_required && !r.is_conditional);
  const allRequiredAccepted = requiredDocs.every((r) => uploads[r.document_type_id]?.ai_verdict === 'accepted' || uploads[r.document_type_id]?.ai_verdict === 'soft_pending');

  // Validation per step
  const canProceed = (() => {
    switch (step) {
      case 1: return !!vendorTypeId;
      case 2: return !!form.legal_name_en && !!form.contact_name && !!form.contact_email;
      case 3: return !!form.bank_account_name && !!form.bank_iban;
      case 4: return allRequiredAccepted;
      case 5: return attestation;
      default: return false;
    }
  })();

  // ---- File upload handler ------------------------------------------
  const handleUpload = async (documentTypeId: string, file: File) => {
    setUploading((u) => ({ ...u, [documentTypeId]: true }));
    try {
      // 1. Upload to vendor-attachments bucket (random path; vendor doesn't exist yet)
      const tempPath = `pending/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from('vendor-attachments')
        .upload(tempPath, file, { upsert: false });
      if (upErr) throw upErr;

      // 2. Create vendor_attachment row WITHOUT a vendor_id
      // (we'll backfill vendor_id when the form is submitted; for now
      //  we pass a sentinel and update later. A cleaner alternative
      //  would be to create the vendor row first as 'draft' — we do that
      //  on first upload to keep things simple.)
      let workingVendorId = (window as any).__pendingVendorId;
      if (!workingVendorId) {
        // Create a draft vendor right now
        const { data: vendorRow, error: vErr } = await supabase
          .from('vendors' as any)
          .insert({
            vendor_type_id: vendorTypeId,
            status: 'draft',
            // Reference number — generated server-side via function
            vendor_reference_no: await generateRef(),
            legal_name_en: form.legal_name_en || 'PENDING',
            contact_name: form.contact_name || 'PENDING',
            contact_email: form.contact_email || 'pending@pending',
          } as any)
          .select('id, vendor_reference_no')
          .single();
        if (vErr) throw vErr;
        workingVendorId = (vendorRow as any).id;
        (window as any).__pendingVendorId = workingVendorId;
      }

      const { data: attRow, error: attErr } = await supabase
        .from('vendor_attachments' as any)
        .insert({
          vendor_id: workingVendorId,
          document_type_id: documentTypeId,
          file_name: file.name,
          file_url: tempPath,
          file_size: file.size,
          file_mime_type: file.type,
          ai_verdict: 'pending',
        } as any)
        .select('id')
        .single();
      if (attErr) throw attErr;

      const attachmentId = (attRow as any).id;
      setUploads((u) => ({
        ...u,
        [documentTypeId]: {
          id: attachmentId,
          document_type_id: documentTypeId,
          file_name: file.name,
          ai_verdict: 'pending',
        },
      }));

      // 3. Trigger AI review
      try {
        const result = await invokeDocumentReview(attachmentId);
        setUploads((u) => ({
          ...u,
          [documentTypeId]: {
            ...u[documentTypeId],
            ai_verdict: result.verdict,
            ai_rejection_reason: result.rejection_reason,
            ai_summary: result.summary,
          },
        }));
      } catch (aiErr: any) {
        // AI invocation failed — leave as pending; backend will mark soft-pending
        setUploads((u) => ({
          ...u,
          [documentTypeId]: {
            ...u[documentTypeId],
            ai_verdict: 'soft_pending',
            ai_summary: 'Auto-review unavailable; our team will review manually.',
          },
        }));
      }
    } catch (e: any) {
      toast({
        title: 'Upload failed',
        description: e?.message || 'Could not upload file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading((u) => ({ ...u, [documentTypeId]: false }));
    }
  };

  const handleRemoveUpload = async (documentTypeId: string) => {
    const doc = uploads[documentTypeId];
    if (!doc) return;
    await supabase.from('vendor_attachments' as any).delete().eq('id', doc.id);
    setUploads((u) => {
      const { [documentTypeId]: _, ...rest } = u;
      return rest;
    });
  };

  // ---- Submit final form --------------------------------------------
  const handleSubmit = async () => {
    if (!attestation) return;
    setSubmitting(true);
    try {
      const workingVendorId = (window as any).__pendingVendorId;
      if (!workingVendorId) {
        throw new Error('Internal error: no draft vendor record. Please re-upload at least one document.');
      }
      // Update the vendor record with all collected data
      const { error: updErr } = await supabase
        .from('vendors' as any)
        .update({
          ...form,
          attestation_accepted: true,
          attestation_accepted_at: new Date().toISOString(),
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        } as any)
        .eq('id', workingVendorId);
      if (updErr) throw updErr;

      // Trigger the state-machine 'submit' action — handles emails to procurement + vendor
      await supabase.functions.invoke('vendor-status-transition', {
        body: { vendor_id: workingVendorId, action: 'submit' },
      });

      // Fetch the reference number to show
      const { data: finalVendor } = await supabase
        .from('vendors' as any)
        .select('vendor_reference_no')
        .eq('id', workingVendorId)
        .maybeSingle();

      setCreatedVendorRef((finalVendor as any)?.vendor_reference_no || '—');
      (window as any).__pendingVendorId = null;
    } catch (e: any) {
      toast({
        title: 'Submission failed',
        description: e?.message || 'Could not submit registration. Please try again or contact procurement.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Success screen -----------------------------------------------
  if (createdVendorRef) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 mx-auto flex items-center justify-center">
              <CheckCheck className="h-8 w-8 text-green-700" />
            </div>
            <h1 className="text-2xl font-bold">Registration Received</h1>
            <p className="text-muted-foreground">
              Thank you for registering as a supplier with Al Hamra Real Estate.
              We have received your information and our procurement team will review it shortly.
            </p>
            <div className="bg-muted/50 rounded-md p-3 text-sm">
              <p className="text-xs text-muted-foreground">Your reference number</p>
              <p className="font-mono font-bold text-lg">{createdVendorRef}</p>
              <p className="text-xs text-muted-foreground mt-2">
                We've sent a confirmation to your email. Please keep this reference for any correspondence.
              </p>
            </div>
            <p className="text-xs text-muted-foreground" dir="rtl">
              شكرًا لتسجيلكم كمورد لدى شركة الحمرا العقارية. لقد استلمنا معلوماتكم وسيقوم فريق المشتريات بمراجعتها قريبًا.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Wizard render ------------------------------------------------
  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold flex items-center gap-2 justify-center">
            <Building2 className="h-6 w-6 text-primary" />
            Supplier Registration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Al Hamra Real Estate — تسجيل المورد لدى شركة الحمرا العقارية
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                step > s.num ? 'bg-primary text-primary-foreground' :
                step === s.num ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                'bg-muted text-muted-foreground'
              }`}>
                {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${step > s.num ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Step {step}: {STEPS[step - 1].title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <div className="space-y-3">
                <Label>Which best describes your business?</Label>
                <Select value={vendorTypeId} onValueChange={setVendorTypeId}>
                  <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    {vendorTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label_en} — {t.label_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType && (
                  <p className="text-xs text-muted-foreground">
                    {selectedType.label_ar}
                  </p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Legal name (English) *" value={form.legal_name_en} onChange={(v) => setForm({ ...form, legal_name_en: v })} />
                <FormField label="Legal name (Arabic)" value={form.legal_name_ar} onChange={(v) => setForm({ ...form, legal_name_ar: v })} />
                <FormField label="Trading name" value={form.trading_name} onChange={(v) => setForm({ ...form, trading_name: v })} />
                <FormField label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
                <FormField label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                <FormField label="Address" value={form.address_line1} onChange={(v) => setForm({ ...form, address_line1: v })} />
                <FormField label="Industry / activity" value={form.industry_activity} onChange={(v) => setForm({ ...form, industry_activity: v })} />
                <FormField label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
                <div className="md:col-span-2 border-t pt-3 mt-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Primary Contact</p>
                </div>
                <FormField label="Contact name *" value={form.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} />
                <FormField label="Position" value={form.contact_position} onChange={(v) => setForm({ ...form, contact_position: v })} />
                <FormField label="Email *" type="email" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} />
                <FormField label="Phone" value={form.contact_phone} onChange={(v) => setForm({ ...form, contact_phone: v })} />
                <div className="md:col-span-2 border-t pt-3 mt-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">Authorized Signatory</p>
                </div>
                <FormField label="Signatory name" value={form.signatory_name} onChange={(v) => setForm({ ...form, signatory_name: v })} />
                <FormField label="Signatory position" value={form.signatory_position} onChange={(v) => setForm({ ...form, signatory_position: v })} />
              </div>
            )}

            {step === 3 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Bank name" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />
                <FormField label="Branch" value={form.bank_branch} onChange={(v) => setForm({ ...form, bank_branch: v })} />
                <FormField label="Account holder name *" value={form.bank_account_name} onChange={(v) => setForm({ ...form, bank_account_name: v })} />
                <FormField label="Currency" value={form.bank_currency} onChange={(v) => setForm({ ...form, bank_currency: v })} />
                <FormField label="Account number" value={form.bank_account_number} onChange={(v) => setForm({ ...form, bank_account_number: v })} />
                <FormField label="IBAN *" value={form.bank_iban} onChange={(v) => setForm({ ...form, bank_iban: v })} />
                <FormField label="SWIFT/BIC" value={form.bank_swift_bic} onChange={(v) => setForm({ ...form, bank_swift_bic: v })} />
                <FormField label="Payment terms preference" value={form.payment_terms_preference} onChange={(v) => setForm({ ...form, payment_terms_preference: v })} />
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Upload each required document below. Each file is automatically reviewed.
                  If a file is rejected, please replace it with a different file.
                </p>
                {(requirements as any[]).map((req) => (
                  <DocumentUploadRow
                    key={req.id}
                    requirement={req}
                    upload={uploads[req.document_type_id]}
                    isUploading={uploading[req.document_type_id]}
                    onUpload={(f) => handleUpload(req.document_type_id, f)}
                    onRemove={() => handleRemoveUpload(req.document_type_id)}
                  />
                ))}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-md p-4 space-y-2 text-sm">
                  <p><strong>Type:</strong> {selectedType?.label_en}</p>
                  <p><strong>Legal name:</strong> {form.legal_name_en}</p>
                  <p><strong>Contact:</strong> {form.contact_name} ({form.contact_email})</p>
                  <p><strong>Documents uploaded:</strong> {Object.keys(uploads).length}</p>
                </div>
                <div className="flex items-start gap-2 p-3 border border-border rounded-md">
                  <Checkbox
                    id="attestation"
                    checked={attestation}
                    onCheckedChange={(c) => setAttestation(c === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="attestation" className="text-sm leading-relaxed">
                    I confirm that the information provided is accurate and complete, and that all uploaded documents are authentic and current.
                    <span dir="rtl" className="block mt-1">
                      أؤكد أن المعلومات المقدمة دقيقة وكاملة، وأن جميع المستندات المرفقة أصلية وسارية.
                    </span>
                  </Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < STEPS.length ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed}
            >
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canProceed || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Submit Registration
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const FormField = ({
  label, value, onChange, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} />
  </div>
);

const DocumentUploadRow = ({
  requirement, upload, isUploading, onUpload, onRemove,
}: {
  requirement: any;
  upload?: UploadedDoc;
  isUploading?: boolean;
  onUpload: (f: File) => void;
  onRemove: () => void;
}) => {
  const isRequired = requirement.is_required && !requirement.is_conditional;

  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="font-medium text-sm">
            {requirement.document_type?.label_en}
            {isRequired && <span className="text-destructive ml-1">*</span>}
          </p>
          <p className="text-[11px] text-muted-foreground" dir="rtl">
            {requirement.document_type?.label_ar}
          </p>
          {requirement.condition_label_en && (
            <p className="text-[11px] text-muted-foreground italic">
              {requirement.condition_label_en}
            </p>
          )}
        </div>
        {!upload && !isUploading && (
          <label className="cursor-pointer">
            <Button asChild variant="outline" size="sm" className="gap-1">
              <span><Upload className="h-3.5 w-3.5" /> Upload</span>
            </Button>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
          </label>
        )}
      </div>

      {isUploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Uploading and reviewing...
        </div>
      )}

      {upload && (
        <div className="bg-muted/30 rounded p-2 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium truncate flex-1">{upload.file_name}</span>
            {upload.ai_verdict === 'accepted' && (
              <span className="flex items-center gap-1 text-green-700 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
              </span>
            )}
            {upload.ai_verdict === 'rejected' && (
              <span className="flex items-center gap-1 text-destructive font-medium">
                <XCircle className="h-3.5 w-3.5" /> Rejected
              </span>
            )}
            {upload.ai_verdict === 'soft_pending' && (
              <span className="flex items-center gap-1 text-warning font-medium">
                <AlertCircle className="h-3.5 w-3.5" /> Will be reviewed
              </span>
            )}
            {upload.ai_verdict === 'pending' && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <Button size="sm" variant="ghost" onClick={onRemove} className="h-6 px-2 text-xs">
              Remove
            </Button>
          </div>
          {upload.ai_verdict === 'rejected' && upload.ai_rejection_reason && (
            <div className="bg-destructive/10 border-l-2 border-destructive px-2 py-1.5 text-[11px] text-destructive">
              <p className="font-semibold mb-0.5">Why this was rejected:</p>
              <p>{upload.ai_rejection_reason}</p>
              <p className="mt-1 text-muted-foreground">Please upload a different file.</p>
            </div>
          )}
          {upload.ai_verdict === 'accepted' && upload.ai_summary && (
            <p className="text-[11px] text-muted-foreground italic">{upload.ai_summary}</p>
          )}
        </div>
      )}
    </div>
  );
};

async function generateRef(): Promise<string> {
  // Use database RPC to call generate_vendor_reference()
  const { data, error } = await supabase.rpc('generate_vendor_reference' as any);
  if (error) {
    // Fallback: client-side timestamp ref. Procurement can renumber if it collides.
    return `AHR-VEND-T${Date.now().toString().slice(-8)}`;
  }
  return data as string;
}

export default VendorRegister;
