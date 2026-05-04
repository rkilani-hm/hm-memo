import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const VendorLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Verify this user is actually a vendor (not a staff user accidentally landing here)
      const { data: vu } = await supabase
        .from('vendor_users' as any)
        .select('vendor_id, is_active')
        .eq('user_id', data.user!.id)
        .maybeSingle();
      if (!vu || !(vu as any).is_active) {
        await supabase.auth.signOut();
        throw new Error('This account is not registered as a supplier portal user. If you should have access, please contact our procurement team.');
      }
      navigate('/vendor/dashboard');
    } catch (err: any) {
      toast({
        title: 'Sign-in failed',
        description: err?.message || 'Please check your email and password.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-2">
          <div className="w-12 h-12 rounded-md bg-primary/10 mx-auto flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Supplier Portal</CardTitle>
          <CardDescription>Sign in to manage your supplier details with Al Hamra Real Estate</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Sign in
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              First time? Use the link in the email we sent you to set your password.
            </p>
            <p className="text-xs text-muted-foreground text-center" dir="rtl">
              المرة الأولى؟ يرجى استخدام الرابط في البريد الإلكتروني الذي أرسلناه لتعيين كلمة المرور.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorLogin;
