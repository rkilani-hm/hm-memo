import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Shield, ShieldCheck, Smartphone, Loader2, AlertTriangle, Sparkles } from 'lucide-react';

interface FraudSettings {
  id: number;
  enabled: boolean;
  scan_on_submit: boolean;
  scan_on_approval_view: boolean;
  block_high_severity: boolean;
  duplicate_lookback_days: number;
  split_threshold_kwd: number;
  split_window_days: number;
  vendor_new_threshold_days: number;
  mfa_required_for_payments: boolean;
  mfa_required_for_high_risk: boolean;
  azure_tenant_id: string | null;
  azure_client_id: string | null;
  azure_authority_url: string | null;
  ai_provider: 'openai' | 'lovable' | 'openai_then_lovable';
  ai_model_summary: string | null;
  ai_model_fraud: string | null;
  ai_lovable_fallback: boolean;
}

const FraudSettingsPage = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FraudSettings | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['fraud-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraud_settings' as any)
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return data as any as FraudSettings | null;
    },
  });

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const update = (patch: Partial<FraudSettings>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase
        .from('fraud_settings' as any)
        .update({
          enabled: form.enabled,
          scan_on_submit: form.scan_on_submit,
          scan_on_approval_view: form.scan_on_approval_view,
          block_high_severity: form.block_high_severity,
          duplicate_lookback_days: form.duplicate_lookback_days,
          split_threshold_kwd: form.split_threshold_kwd,
          split_window_days: form.split_window_days,
          vendor_new_threshold_days: form.vendor_new_threshold_days,
          mfa_required_for_payments: form.mfa_required_for_payments,
          mfa_required_for_high_risk: form.mfa_required_for_high_risk,
          azure_tenant_id: form.azure_tenant_id,
          azure_client_id: form.azure_client_id,
          azure_authority_url: form.azure_authority_url,
          ai_provider: form.ai_provider,
          ai_model_summary: form.ai_model_summary,
          ai_model_fraud: form.ai_model_fraud,
          ai_lovable_fallback: form.ai_lovable_fallback,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        } as any)
        .eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fraud-settings'] });
      queryClient.invalidateQueries({ queryKey: ['fraud-policy'] });
      toast({ title: 'Settings saved' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (!hasRole('admin')) {
    navigate('/');
    return null;
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Fraud Detection & MFA Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure how attachments are scanned for fraud and when Microsoft Authenticator MFA is required to apply a signature.
        </p>
      </div>

      {/* Fraud feature toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Fraud Scanner
          </CardTitle>
          <CardDescription>
            Enables forensic + AI vision + cross-document checks on memo attachments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Enable fraud scanner"
            description="Master switch. When off, no fraud signals are produced."
            checked={form.enabled}
            onChange={(v) => update({ enabled: v })}
          />
          <ToggleRow
            label="Scan on memo submit"
            description="Run a check automatically when a memo is submitted for approval."
            checked={form.scan_on_submit}
            onChange={(v) => update({ scan_on_submit: v })}
          />
          <ToggleRow
            label="Auto-scan when approver opens the memo"
            description="If no scan exists yet, run one when the approver views the memo."
            checked={form.scan_on_approval_view}
            onChange={(v) => update({ scan_on_approval_view: v })}
          />
          <ToggleRow
            label="Require typed acknowledgement on high-severity"
            description="When a critical/high signal exists, the approver must type a confirmation phrase before approve becomes available."
            checked={form.block_high_severity}
            onChange={(v) => update({ block_high_severity: v })}
          />
        </CardContent>
      </Card>

      {/* Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detection Thresholds</CardTitle>
          <CardDescription>Tune the deterministic checks. Defaults are sensible for Kuwait operations.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Duplicate-attachment lookback (days)</Label>
            <Input
              type="number"
              min={30}
              value={form.duplicate_lookback_days}
              onChange={(e) => update({ duplicate_lookback_days: parseInt(e.target.value) || 365 })}
            />
            <p className="text-[11px] text-muted-foreground">
              How far back to compare attachment fingerprints when looking for duplicates.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Split-purchase threshold (KWD)</Label>
            <Input
              type="number"
              min={0}
              step={50}
              value={form.split_threshold_kwd}
              onChange={(e) => update({ split_threshold_kwd: parseFloat(e.target.value) || 5000 })}
            />
            <p className="text-[11px] text-muted-foreground">
              Amounts at ≥85% of this value trigger an "amount just below threshold" warning.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Split-purchase window (days)</Label>
            <Input
              type="number"
              min={1}
              value={form.split_window_days}
              onChange={(e) => update({ split_window_days: parseInt(e.target.value) || 14 })}
            />
            <p className="text-[11px] text-muted-foreground">Time window for grouping memos when looking for splits.</p>
          </div>
          <div className="space-y-1.5">
            <Label>New-submitter threshold (days)</Label>
            <Input
              type="number"
              min={0}
              value={form.vendor_new_threshold_days}
              onChange={(e) => update({ vendor_new_threshold_days: parseInt(e.target.value) || 90 })}
            />
            <p className="text-[11px] text-muted-foreground">
              Submitter accounts younger than this raise a low-severity signal.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* AI Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Provider
          </CardTitle>
          <CardDescription>
            Choose which AI service powers the memo summary and the fraud
            detection's vision pass. OpenAI uses your own API key directly
            (counts against your enterprise quota); Lovable uses the Lovable
            Cloud AI gateway.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select
              value={form.ai_provider}
              onValueChange={(v) => update({ ai_provider: v as FraudSettings['ai_provider'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI (your enterprise API key)</SelectItem>
                <SelectItem value="lovable">Lovable Cloud (default)</SelectItem>
                <SelectItem value="openai_then_lovable">OpenAI → Lovable fallback</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              For OpenAI to work, set an <code>OPENAI_API_KEY</code> secret on the
              Supabase edge function environment. For Lovable to work, the
              existing <code>LOVABLE_API_KEY</code> must be set. The
              "OpenAI → Lovable fallback" option tries OpenAI first and only
              falls back to Lovable if OpenAI fails (rate-limit, quota, or
              network).
            </p>
          </div>

          {form.ai_provider === 'openai' && (
            <ToggleRow
              label="Allow Lovable fallback when OpenAI fails"
              description="If OpenAI is unreachable or rate-limits, automatically retry once on Lovable. Disable for strict OpenAI-only mode (any failure surfaces as an error)."
              checked={form.ai_lovable_fallback}
              onChange={(v) => update({ ai_lovable_fallback: v })}
            />
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Memo summary model (override)</Label>
              <Input
                value={form.ai_model_summary || ''}
                onChange={(e) => update({ ai_model_summary: e.target.value || null })}
                placeholder={form.ai_provider === 'lovable' ? 'google/gemini-2.5-flash' : 'gpt-4o-mini'}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank for the provider's default. Use <code>gpt-4o-mini</code> for cheap+fast,
                <code> gpt-4o</code> for higher accuracy on long documents.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Fraud-check vision model (override)</Label>
              <Input
                value={form.ai_model_fraud || ''}
                onChange={(e) => update({ ai_model_fraud: e.target.value || null })}
                placeholder={form.ai_provider === 'lovable' ? 'google/gemini-2.5-flash' : 'gpt-4o'}
              />
              <p className="text-[11px] text-muted-foreground">
                The fraud check sends PDFs/images for visual tampering analysis,
                so it benefits from a strong vision model. Recommended:
                <code> gpt-4o</code> on OpenAI.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MFA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" /> Microsoft Authenticator (Step-Up MFA)
          </CardTitle>
          <CardDescription>
            When enabled, payment-memo signatures are only applied after an in-flow MFA challenge succeeds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Require MFA on payment memos"
            description="Block signature application unless the approver completes Microsoft Authenticator step-up."
            checked={form.mfa_required_for_payments}
            onChange={(v) => update({ mfa_required_for_payments: v })}
          />
          <ToggleRow
            label="Require MFA when fraud scan is high-risk"
            description="Apply step-up MFA whenever the latest fraud scan returned a high or critical risk."
            checked={form.mfa_required_for_high_risk}
            onChange={(v) => update({ mfa_required_for_high_risk: v })}
          />

          <Separator />

          {(!form.azure_tenant_id || !form.azure_client_id) && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2 text-xs text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Azure AD Tenant ID and Client ID must be configured below before MFA toggles take effect.
                Once set, also store <code>AZURE_TENANT_ID</code> and <code>AZURE_CLIENT_ID</code> as Supabase secrets so the verification edge function can validate tokens.
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Azure AD Tenant ID</Label>
              <Input
                value={form.azure_tenant_id || ''}
                onChange={(e) => update({ azure_tenant_id: e.target.value || null })}
                placeholder="e.g. 11111111-2222-3333-4444-555555555555"
              />
            </div>
            <div className="space-y-1.5">
              <Label>App Registration Client ID</Label>
              <Input
                value={form.azure_client_id || ''}
                onChange={(e) => update({ azure_client_id: e.target.value || null })}
                placeholder="App ID from Entra ID app registration"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Authority URL (optional)</Label>
              <Input
                value={form.azure_authority_url || ''}
                onChange={(e) => update({ azure_authority_url: e.target.value || null })}
                placeholder={`https://login.microsoftonline.com/${form.azure_tenant_id || '<tenant>'}`}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use the default Microsoft authority for the tenant above.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default FraudSettingsPage;
