import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, Eye, EyeOff, Check, X } from 'lucide-react';

// Strength rules — chosen to match what the memo app reasonably enforces.
// We do NOT enforce excessive complexity (it pushes users toward written-down
// passwords or recycled ones). 8 chars + at least one letter + one digit is
// a sensible baseline for an internal corporate tool.
const MIN_LENGTH = 8;

interface StrengthCheck {
  label: string;
  passed: boolean;
}

function evaluateStrength(pw: string): StrengthCheck[] {
  return [
    { label: `At least ${MIN_LENGTH} characters`, passed: pw.length >= MIN_LENGTH },
    { label: 'Contains a letter',                 passed: /[A-Za-z]/.test(pw) },
    { label: 'Contains a number',                 passed: /\d/.test(pw) },
    { label: 'Different from current password',   passed: pw.length > 0 },
    // (the "differs from current" check is finalised on submit)
  ];
}

export const ChangePasswordCard = () => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const checks = useMemo(() => evaluateStrength(newPassword), [newPassword]);
  const allRulesPassed = checks.every((c) => c.passed) && newPassword !== currentPassword;
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit =
    !saving &&
    !!currentPassword &&
    !!newPassword &&
    !!confirmPassword &&
    allRulesPassed &&
    matches;

  const handleChangePassword = async () => {
    if (!user || !profile?.email) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    if (!canSubmit) return;

    setSaving(true);
    try {
      // Step 1: verify the current password by attempting a sign-in with it.
      // Supabase has no "verify password" call, so a fresh sign-in is the
      // canonical pattern. If it fails, the current password is wrong and
      // we abort before issuing the update.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });
      if (signInError) {
        toast({
          title: 'Current password is incorrect',
          description: 'Please re-enter your current password.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      // Step 2: update the password.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      // Step 3: write an audit_log entry. Best-effort — we don't fail the
      // password change if logging fails, just console.warn. We include
      // device + IP context so security can later trace any unwanted changes.
      try {
        const { collectDeviceInfo, getClientIp, resolveIpGeolocation } =
          await import('@/lib/device-info');
        const deviceInfo = collectDeviceInfo();
        const clientIp = await getClientIp();
        const geo = clientIp
          ? await resolveIpGeolocation(clientIp)
          : { city: null, country: null };
        await supabase.from('audit_log').insert({
          user_id: user.id,
          action: 'password_changed',
          action_detail: 'self_service',
          notes: 'User changed their own password via Settings.',
          ip_address: clientIp,
          ip_geolocation_city: geo.city,
          ip_geolocation_country: geo.country,
          ...deviceInfo,
        } as any);
      } catch (e) {
        console.warn('audit_log password_changed entry failed:', e);
      }

      toast({
        title: 'Password updated',
        description: 'Your password has been changed successfully.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Lock className="h-5 w-5 text-accent" />
          Change Password
        </CardTitle>
        <CardDescription>
          Update your account password. You will need to enter your current password to confirm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Password */}
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current Password</Label>
          <div className="relative">
            <Input
              id="currentPassword"
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowCurrent(!showCurrent)}
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div className="space-y-2">
          <Label htmlFor="newPassword">New Password</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Choose a strong new password"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowNew(!showNew)}
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Strength rules */}
        {newPassword.length > 0 && (
          <ul className="space-y-1 text-xs">
            {checks.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                {c.passed ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={c.passed ? 'text-foreground' : 'text-muted-foreground'}>
                  {c.label}
                </span>
              </li>
            ))}
            {currentPassword.length > 0 && newPassword === currentPassword && (
              <li className="flex items-center gap-2 text-amber-600">
                <X className="h-3 w-3" />
                <span>New password must differ from your current password.</span>
              </li>
            )}
          </ul>
        )}

        {/* Confirm */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && !matches && (
            <p className="text-xs text-amber-600">Passwords do not match yet.</p>
          )}
        </div>

        <Button onClick={handleChangePassword} disabled={!canSubmit} variant="outline">
          <Lock className="h-4 w-4 mr-2" />
          {saving ? 'Updating…' : 'Change Password'}
        </Button>
      </CardContent>
    </Card>
  );
};
