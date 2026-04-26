import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, Loader2, Smartphone, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { performMfaStepUp, getFraudSettings } from '@/lib/azure-mfa';

interface MfaStepUpProps {
  memoId: string;
  stepId: string;
  loginHint?: string;
  /** Called when verification succeeds. Parent should then enable the "Approve" button. */
  onVerified: (info: { method: string; upn?: string; verifiedAt: string }) => void;
  /** Called if user cancels or verification fails — parent should keep button disabled. */
  onReset?: () => void;
}

type Phase = 'idle' | 'challenging' | 'verifying' | 'verified' | 'error';

export default function MfaStepUp({ memoId, stepId, loginHint, onVerified, onReset }: MfaStepUpProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [verifiedInfo, setVerifiedInfo] = useState<{ method: string; upn?: string; verifiedAt: string } | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    getFraudSettings().then((s) => {
      setConfigured(!!(s?.azure_tenant_id && s?.azure_client_id));
    });
  }, []);

  const startMfa = async () => {
    setError(null);
    setPhase('challenging');
    try {
      const proof = await performMfaStepUp({ loginHint, forceFresh: true });
      setPhase('verifying');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-mfa-and-sign`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id_token: proof.idToken,
          memo_id: memoId,
          step_id: stepId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Verification failed (${res.status})`);
      }
      const json = await res.json();
      const info = {
        method: json.method || 'microsoft_authenticator',
        upn: json.upn || proof.account.username,
        verifiedAt: json.verified_at,
      };
      setVerifiedInfo(info);
      setPhase('verified');
      onVerified(info);
    } catch (e: any) {
      setError(e.message || 'MFA verification failed');
      setPhase('error');
      onReset?.();
    }
  };

  if (configured === null) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking MFA configuration…
      </div>
    );
  }

  if (configured === false) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-medium text-amber-700">Microsoft Authenticator MFA is not configured.</p>
            <p className="text-amber-700/80 mt-0.5">
              An administrator needs to set the Azure AD Tenant ID and Client ID in Admin → Fraud & MFA Settings before payment approvals can require step-up MFA.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'verified' && verifiedInfo) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs flex-1">
            <p className="font-medium text-emerald-700">MFA verified</p>
            <p className="text-emerald-700/80 mt-0.5">
              {verifiedInfo.upn ? <>Authenticated as <strong>{verifiedInfo.upn}</strong></> : 'Authenticated via Microsoft Authenticator'}
              {' · '}
              <Badge variant="outline" className="text-[10px] ml-1">{verifiedInfo.method.replace(/_/g, ' ')}</Badge>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Your signature will be applied once you click Approve.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Smartphone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs flex-1">
          <p className="font-medium text-foreground">Microsoft Authenticator step-up required</p>
          <p className="text-muted-foreground mt-0.5">
            This is a payment memo. Tap the button below to confirm your identity via Microsoft Authenticator on your phone before signing.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={startMfa}
        disabled={phase === 'challenging' || phase === 'verifying'}
      >
        {phase === 'challenging' && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
        {phase === 'verifying' && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
        {phase === 'idle' && <Smartphone className="h-3.5 w-3.5 mr-1.5" />}
        {phase === 'error' && <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />}
        {phase === 'idle' && 'Verify with Microsoft Authenticator'}
        {phase === 'challenging' && 'Awaiting your approval on your phone…'}
        {phase === 'verifying' && 'Verifying…'}
        {phase === 'error' && 'Try again'}
      </Button>
      {error && (
        <p className="text-[11px] text-destructive flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          {error}
        </p>
      )}
    </div>
  );
}
