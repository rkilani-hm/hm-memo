import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Mail, Clock, KeyRound, Eye, EyeOff, Check, X, Loader2, CheckCircle2 } from 'lucide-react';

// ===========================================================================
// Forgot Password — three-step OTP code flow
// ===========================================================================
//
// Step 1 (email):    user enters their email; we send a 6-digit code
// Step 2 (code):     user types the code from their email
// Step 3 (password): user types a new password; we set it server-side
//
// Why OTP code instead of magic link:
// Corporate Microsoft 365 environments (Safe Links, Defender) pre-fetch
// every URL in inbound mail to scan for malicious content. That pre-fetch
// consumes Supabase's single-use magic link tokens before the user can
// click them, leading to "expired" errors within seconds of sending.
// Codes can't be auto-consumed because there's no URL to scan.
//
// State carried between steps lives in component state — refreshing the
// page bumps the user back to step 1 (acceptable; it's a short flow).
// ===========================================================================

const COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 8;
const CODE_LENGTH = 6;

type Step = 'email' | 'code' | 'password' | 'done';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('email');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [nonce, setNonce] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown ticker for the resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown > 0]);

  // -------------------------------------------------------------------------
  // Step 1: request a code
  // -------------------------------------------------------------------------
  const handleRequestCode = useCallback(async () => {
    if (!email || cooldown > 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('request-password-reset', {
        body: { email: email.trim().toLowerCase() },
      });
      if (error) {
        toast({ title: 'Could not send code', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      // Always treat as success — the function returns ok:true even if
      // the email isn't registered, so the caller can't enumerate users.
      // The user just won't receive an email if they don't have an account.
      toast({
        title: 'Code sent',
        description: `If that email is registered, a 6-digit code is on its way. Check your inbox (and spam).`,
      });
      setStep('code');
      setCooldown(COOLDOWN_SECONDS);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [email, cooldown, toast]);

  // -------------------------------------------------------------------------
  // Step 2: verify the code
  // -------------------------------------------------------------------------
  const handleVerifyCode = useCallback(async () => {
    if (code.length !== CODE_LENGTH) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-password-reset-code', {
        body: { email: email.trim().toLowerCase(), code: code.trim() },
      });
      if (error) {
        toast({ title: 'Could not verify', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      if (!data?.ok) {
        if (data?.reason === 'locked') {
          toast({
            title: 'Too many attempts',
            description: 'For your security, please wait 15 minutes before trying again, or request a new code.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Code did not match',
            description: 'Please double-check the 6 digits and try again. Codes expire after 5 minutes.',
            variant: 'destructive',
          });
        }
        setLoading(false);
        return;
      }
      setNonce(data.nonce);
      setStep('password');
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [email, code, toast]);

  // -------------------------------------------------------------------------
  // Resend code (from step 2)
  // -------------------------------------------------------------------------
  const handleResend = useCallback(async () => {
    if (cooldown > 0) return;
    // Re-uses the request flow. Strip any code state since the new code
    // is different.
    setCode('');
    await handleRequestCode();
  }, [cooldown, handleRequestCode]);

  // -------------------------------------------------------------------------
  // Step 3: set new password
  // -------------------------------------------------------------------------
  // Strength rules — same baseline as ChangePasswordCard. We don't
  // enforce excessive complexity since that pushes users toward
  // written-down passwords. 8 chars + a letter + a digit is sensible
  // for an internal corporate tool.
  const checks = useMemo(() => [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, passed: newPassword.length >= MIN_PASSWORD_LENGTH },
    { label: 'Contains a letter',                          passed: /[A-Za-z]/.test(newPassword) },
    { label: 'Contains a number',                          passed: /\d/.test(newPassword) },
  ], [newPassword]);
  const allRulesPassed = checks.every((c) => c.passed);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitPassword = !loading && !!newPassword && !!confirmPassword && allRulesPassed && matches;

  const handleSetPassword = useCallback(async () => {
    if (!canSubmitPassword) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('complete-password-reset', {
        body: {
          email: email.trim().toLowerCase(),
          nonce,
          new_password: newPassword,
        },
      });
      if (error) {
        toast({ title: 'Could not set password', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      if (!data?.ok) {
        let title = 'Could not set password';
        let description = data?.message || 'Please try again.';
        if (data?.reason === 'invalid_nonce') {
          title = 'Verification expired';
          description = 'Please start over and request a new code.';
        } else if (data?.reason === 'nonce_expired') {
          title = 'Took too long';
          description = 'You took longer than 10 minutes to set the new password. Please start over.';
        } else if (data?.reason === 'password_too_short') {
          description = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
        }
        toast({ title, description, variant: 'destructive' });
        // For nonce-related failures, send the user back to step 1
        if (data?.reason === 'invalid_nonce' || data?.reason === 'nonce_expired') {
          setStep('email');
          setCode('');
          setNonce('');
          setNewPassword('');
          setConfirmPassword('');
        }
        setLoading(false);
        return;
      }
      setStep('done');
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [canSubmitPassword, email, nonce, newPassword, toast]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30">
      <Card className="w-full max-w-md mx-4 shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <img src={alHamraLogo} alt="Al Hamra Logo" className="mx-auto mb-4 h-24 w-auto object-contain" />
          <h1 className="text-2xl font-bold text-foreground">
            {step === 'email'    && 'Reset Password'}
            {step === 'code'     && 'Enter Verification Code'}
            {step === 'password' && 'Choose New Password'}
            {step === 'done'     && 'Password Reset'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {step === 'email'    && 'Enter your email to receive a 6-digit code'}
            {step === 'code'     && (<>We sent a code to <strong>{email}</strong></>)}
            {step === 'password' && 'Choose a strong password you\'ll remember'}
            {step === 'done'     && 'Your password has been changed'}
          </p>
        </CardHeader>
        <CardContent>
          {step === 'email' && (
            <form onSubmit={(e) => { e.preventDefault(); handleRequestCode(); }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@alhamra.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Send Code
              </Button>
              <Link to="/login" className="block text-center">
                <Button variant="ghost" size="sm" className="text-muted-foreground" type="button">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to Login
                </Button>
              </Link>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }} className="space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <KeyRound className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The code is valid for 5 minutes. Check your inbox (and spam folder).
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading || code.length !== CODE_LENGTH}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verify Code
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center"
                  onClick={() => { setStep('email'); setCode(''); }}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Use a different email
                </button>
                {cooldown > 0 ? (
                  <span className="text-muted-foreground inline-flex items-center">
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    Resend in {cooldown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={handleResend}
                    disabled={loading}
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={(e) => { e.preventDefault(); handleSetPassword(); }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoFocus
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {confirmPassword.length > 0 && !matches && (
                  <p className="text-xs text-destructive">Passwords don't match.</p>
                )}
              </div>

              {newPassword.length > 0 && (
                <div className="bg-muted/30 rounded p-3 space-y-1">
                  {checks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {c.passed
                        ? <Check className="h-3.5 w-3.5 text-success shrink-0" />
                        : <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className={c.passed ? 'text-foreground' : 'text-muted-foreground'}>{c.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={!canSubmitPassword}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Set New Password
              </Button>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <p className="text-sm text-muted-foreground">
                Your password has been changed. Sign in with your new password.
              </p>
              <Button className="w-full" onClick={() => navigate('/login')}>
                Go to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
