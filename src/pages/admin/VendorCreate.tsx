import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchVendorTypes } from '@/lib/vendor-api';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Building2, Loader2, Save } from 'lucide-react';

const VendorCreate = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const { data: vendorTypes = [] } = useQuery({
    queryKey: ['vendor-types'], queryFn: fetchVendorTypes,
  });

  const [form, setForm] = useState({
    vendor_type_id: '',
    legal_name_en: '', legal_name_ar: '', trading_name: '',
    country: 'KW', city: '', address_line1: '',
    industry_activity: '', website: '',
    contact_name: '', contact_email: '', contact_phone: '', contact_position: '',
    signatory_name: '', signatory_position: '',
    bank_name: '', bank_account_name: '', bank_iban: '',
    bank_swift_bic: '', bank_currency: 'KWD',
  });

  const canSubmit =
    !!form.vendor_type_id &&
    !!form.legal_name_en.trim() &&
    !!form.contact_name.trim() &&
    !!form.contact_email.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Generate reference number via RPC
      const { data: refData, error: refErr } = await supabase.rpc('generate_vendor_reference' as any);
      if (refErr) throw refErr;

      const { data: vendor, error } = await supabase
        .from('vendors' as any)
        .insert({
          ...form,
          vendor_reference_no: refData,
          status: 'draft',
          created_by: user?.id,
        } as any)
        .select('id')
        .single();
      if (error) throw error;

      await supabase.from('vendor_audit_log' as any).insert({
        vendor_id: (vendor as any).id,
        action: 'created_by_staff',
        actor_user_id: user?.id,
        actor_kind: 'staff',
        notes: 'Vendor record created internally on vendor\'s behalf.',
      } as any);

      toast({ title: 'Vendor created', description: 'Now upload required documents from the detail page.' });
      navigate(`/admin/vendors/${(vendor as any).id}`);
    } catch (e: any) {
      toast({ title: 'Create failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/vendors')} className="gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Vendors
      </Button>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          New Vendor
        </h1>
        <p className="text-sm text-muted-foreground">
          Create a vendor record on behalf of a supplier. After creation, upload documents from the detail page.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Vendor Type</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label>Type *</Label>
            <Select value={form.vendor_type_id} onValueChange={(v) => setForm({ ...form, vendor_type_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>
                {vendorTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Company</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Legal name (English) *" value={form.legal_name_en} onChange={(v) => setForm({ ...form, legal_name_en: v })} />
          <Field label="Legal name (Arabic)" value={form.legal_name_ar} onChange={(v) => setForm({ ...form, legal_name_ar: v })} />
          <Field label="Trading name" value={form.trading_name} onChange={(v) => setForm({ ...form, trading_name: v })} />
          <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
          <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
          <Field label="Address" value={form.address_line1} onChange={(v) => setForm({ ...form, address_line1: v })} />
          <Field label="Industry / activity" value={form.industry_activity} onChange={(v) => setForm({ ...form, industry_activity: v })} />
          <Field label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Contact name *" value={form.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} />
          <Field label="Position" value={form.contact_position} onChange={(v) => setForm({ ...form, contact_position: v })} />
          <Field label="Email *" type="email" value={form.contact_email} onChange={(v) => setForm({ ...form, contact_email: v })} />
          <Field label="Phone" value={form.contact_phone} onChange={(v) => setForm({ ...form, contact_phone: v })} />
          <Field label="Authorized signatory" value={form.signatory_name} onChange={(v) => setForm({ ...form, signatory_name: v })} />
          <Field label="Signatory position" value={form.signatory_position} onChange={(v) => setForm({ ...form, signatory_position: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bank</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Bank name" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />
          <Field label="Account holder name" value={form.bank_account_name} onChange={(v) => setForm({ ...form, bank_account_name: v })} />
          <Field label="IBAN" value={form.bank_iban} onChange={(v) => setForm({ ...form, bank_iban: v })} />
          <Field label="SWIFT/BIC" value={form.bank_swift_bic} onChange={(v) => setForm({ ...form, bank_swift_bic: v })} />
          <Field label="Currency" value={form.bank_currency} onChange={(v) => setForm({ ...form, bank_currency: v })} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/admin/vendors')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="gap-1">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Create Vendor
        </Button>
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) => (
  <div className="space-y-1">
    <Label className="text-xs">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} />
  </div>
);

export default VendorCreate;
