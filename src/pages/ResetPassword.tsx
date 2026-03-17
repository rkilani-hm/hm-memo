import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, AlertTriangle, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type ErrorType = 'expired' | 'invalid' | 'used' | 'network' | null;

const passwordRules = [
  { test: (p: string) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'At least one uppercase letter' },
  { test: (p: string) => /[a-z]/.test(p), label: 'At least one lowercase letter' },
  { test: (p: string) => /[0-9]/.test(p), label: 'At least one number' },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'At least one special character' },
];

const getStrength = (password: string): { label: string; colorClass: string; percent: number } => {
  const passed = passwordRules.filter((r) => r.test(password)).length;
  if (passed <= 2) return { label: 'Weak', colorClass: 'bg-destructive', percent: 33 };
  if (passed <= 4) return { label: 'Fair', colorClass: 'bg-warning', percent: 66 };
  return { label: 'Strong', colorClass: 'bg-success', percent: 100 };
};

const classifyErrorMessage = (message?: string): ErrorType => {
  const msg = (message || '').toLowerCase();

  if (
    msg.includes('otp_expired') ||
    msg.includes('expired') ||
    msg.includes('invalid or has expired')
  ) {
    return 'expired';
  }

  if (msg.includes('already used') || msg.includes('already been used') || msg.includes('used')) {
    return 'used';
  }

  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
    return 'network';
  }

  return 'invalid';
};

const clearAuthUrlArtifacts = () => {
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
};

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let isActive = true;

    const setReady = () => {
      if (!isActive) return;
      setIsValidSession(true);
      setErrorType(null);
      setIsLoading(false);
      clearAuthUrlArtifacts();
    };

    const setError = (type: ErrorType) => {
      if (!isActive) return;
      setIsValidSession(false);
      setErrorType(type);
      setIsLoading(false);
    };

    const waitForSession = async (attempts = 6, delayMs = 300): Promise<boolean> => {
      for (let i = 0; i < attempts; i += 1) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) return true;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return false;
    };

    const handlePasswordReset = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

        const code = searchParams.get('code');
        const hashType = hashParams.get('type');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        const rawUrlError =
          hashParams.get('error_description') ||
          searchParams.get('error_description') ||
          hashParams.get('error_code') ||
          searchParams.get('error_code') ||
          hashParams.get('error') ||
          searchParams.get('error') ||
          '';

        const hasRecoveryMarker = Boolean(
          code ||
          hashType === 'recovery' ||
          accessToken ||
          hashParams.get('error') ||
          searchParams.get('error'),
        );

        const { data: { session: initialSession } } = await supabase.auth.getSession();

        // Secure route: if user is already authenticated and this is not a recovery-link entry, block access
        if (initialSession?.user && !hasRecoveryMarker) {
          navigate('/', { replace: true });
          return;
        }

        // Handle direct error redirects from verify endpoint (e.g. #error=access_denied&error_code=otp_expired)
        if (rawUrlError) {
          setError(classifyErrorMessage(rawUrlError));
          return;
        }

        // If session is already there (SDK already processed URL), show form immediately
        if (initialSession?.user && hasRecoveryMarker) {
          setReady();
          return;
        }

        if (!hasRecoveryMarker) {
          setError('invalid');
          return;
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (!isActive) return;
          if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session && hasRecoveryMarker)) {
            setReady();
            subscription.unsubscribe();
          }
        });

        let tokenErrorMessage: string | null = null;

        // PKCE flow
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) tokenErrorMessage = error.message;
        }

        // Hash implicit flow
        if (!code && hashType === 'recovery' && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) tokenErrorMessage = error.message;
        }

        const hasSessionAfterExchange = await waitForSession();
        subscription.unsubscribe();

        if (hasSessionAfterExchange) {
          setReady();
          return;
        }

        if (tokenErrorMessage) {
          setError(classifyErrorMessage(tokenErrorMessage));
          return;
        }

        setError('invalid');
      } catch {
        setError('network');
      }
    };

    handlePasswordReset();

    return () => {
      isActive = false;
    };
  }, [navigate]);

  const allRulesPassed = passwordRules.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allRulesPassed && passwordsMatch && !loading;
  const strength = password.length > 0 ? getStrength(password) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await supabase.auth.signOut();
      toast({ title: 'Password updated', description: 'Your password has been reset successfully. Please log in.' });
      navigate('/login');
    }

    setLoading(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <Card className="w-full max-w-md mx-4 shadow-xl border-0">
          <CardContent className="pt-8 text-center space-y-4">
            <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
            <p className="text-muted-foreground">Verifying your reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isValidSession) {
    const errorConfig = {
      expired: {
        icon: <Clock className="h-12 w-12 mx-auto text-warning" />,
        title: 'Link Expired',
        message: 'This reset link has expired or was already consumed. Please request a new one.',
      },
      used: {
        icon: <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground" />,
        title: 'Link Already Used',
        message: 'This reset link has already been used. Please request a new one if needed.',
      },
      invalid: {
        icon: <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />,
        title: 'Invalid Link',
        message: 'This reset link is invalid or malformed. Please request a new one.',
      },
      network: {
        icon: <XCircle className="h-12 w-12 mx-auto text-destructive" />,
        title: 'Connection Error',
        message: 'Something went wrong verifying your link. Please try again.',
      },
    };

    const config = errorConfig[errorType || 'invalid'];

    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <Card className="w-full max-w-md mx-4 shadow-xl border-0">
          <CardContent className="pt-8 text-center space-y-4">
            {config.icon}
            <h2 className="text-lg font-semibold text-foreground">{config.title}</h2>
            <p className="text-muted-foreground text-sm">{config.message}</p>
            <div className="flex flex-col gap-2 pt-2">
              <Link to="/forgot-password">
                <Button className="w-full">Request New Reset Link</Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" className="w-full">Back to Login</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30">
      <Card className="w-full max-w-md mx-4 shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <img src={alHamraLogo} alt="Al Hamra Logo" className="mx-auto mb-4 h-24 w-auto object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Set New Password</h1>
          <p className="text-muted-foreground text-sm mt-1">Enter your new password below</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {strength && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${strength.colorClass} rounded-full transition-all duration-300`}
                        style={{ width: `${strength.percent}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{strength.label}</span>
                  </div>

                  <ul className="space-y-0.5">
                    {passwordRules.map((rule, i) => {
                      const passed = rule.test(password);
                      return (
                        <li
                          key={i}
                          className={`flex items-center gap-1.5 text-xs ${passed ? 'text-success' : 'text-muted-foreground'}`}
                        >
                          {passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirm(!showConfirm)}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {loading ? 'Updating...' : 'Reset Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
