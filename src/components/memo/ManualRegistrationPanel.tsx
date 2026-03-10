import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FileText, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { collectDeviceInfo, getClientIp, resolveIpGeolocation } from '@/lib/device-info';

interface ManualRegistrationPanelProps {
  step: {
    id: string;
    memo_id: string;
    approver_user_id: string;
    action_type: string;
    step_order: number;
    status: string;
  };
  principalName: string;
  principalTitle: string;
  memoTransmittalNo: string;
}

const ManualRegistrationPanel = ({
  step,
  principalName,
  principalTitle,
  memoTransmittalNo,
}: ManualRegistrationPanelProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [action, setAction] = useState<'approved' | 'rejected' | 'rework'>('approved');
  const [signingDate, setSigningDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Verify delegate's own password
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: currentUser?.email || '',
        password,
      });
      if (authError) {
        setPasswordError('Incorrect password. Please try again.');
        throw new Error('Password verification failed');
      }
      setPasswordError('');

      // Upload scan if provided
      let scanUrl: string | null = null;
      if (scanFile) {
        const scanPath = `${step.memo_id}/${step.id}-scan.${scanFile.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(scanPath, scanFile, { upsert: true });
        if (uploadError) throw uploadError;
        scanUrl = scanPath;
      }

      // Update approval step
      const { error: stepError } = await supabase
        .from('approval_steps')
        .update({
          status: action,
          signed_at: new Date().toISOString(),
          password_verified: true,
          comments: action !== 'approved' ? notes : (notes || null),
          signing_method: 'manual_paper',
          registered_by_user_id: user.id,
          date_of_physical_signing: signingDate ? new Date(signingDate).toISOString() : new Date().toISOString(),
          scan_attachment_url: scanUrl,
          registration_notes: notes || null,
        } as any)
        .eq('id', step.id);
      if (stepError) throw stepError;

      // If approved, advance workflow
      if (action === 'approved') {
        const { data: allSteps } = await supabase
          .from('approval_steps')
          .select('*')
          .eq('memo_id', step.memo_id)
          .order('step_order');

        const nextStep = allSteps?.find(s => s.step_order > step.step_order && s.status === 'pending');
        if (nextStep) {
          await supabase.from('memos').update({ current_step: nextStep.step_order }).eq('id', step.memo_id);
        } else {
          await supabase.from('memos').update({ status: 'approved' as any }).eq('id', step.memo_id);
        }
      } else {
        const newStatus = action === 'rejected' ? 'rejected' : 'rework';
        await supabase.from('memos').update({ status: newStatus as any }).eq('id', step.memo_id);
      }

      // Collect device info + IP for audit
      const deviceInfo = collectDeviceInfo();
      const clientIp = await getClientIp();
      const geo = clientIp ? await resolveIpGeolocation(clientIp) : { city: null, country: null };

      // Audit log
      await supabase.from('audit_log').insert({
        memo_id: step.memo_id,
        user_id: user.id,
        action: action === 'approved'
          ? (step.action_type === 'initial' ? 'manual_initial_registered' : 'manual_signature_registered')
          : (action === 'rejected' ? 'manual_rejection_registered' : 'manual_rework_registered'),
        action_detail: action,
        on_behalf_of_user_id: step.approver_user_id,
        on_behalf_of_name: principalName,
        signing_method: 'manual_paper',
        transmittal_no: memoTransmittalNo,
        password_verified: true,
        scan_attachment_url: scanUrl,
        notes: notes || null,
        previous_status: 'pending',
        new_status: action,
        ip_address: clientIp,
        ip_geolocation_city: geo.city,
        ip_geolocation_country: geo.country,
        ...deviceInfo,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-steps'] });
      queryClient.invalidateQueries({ queryKey: ['memo'] });
      toast({
        title: action === 'approved'
          ? `Manual ${step.action_type === 'initial' ? 'initial' : 'signature'} registered`
          : action === 'rejected' ? 'Rejection registered' : 'Rework request registered',
        description: `Registered on behalf of ${principalName}`,
      });
      setPassword('');
      setNotes('');
      setScanFile(null);
    },
    onError: (e: Error) => {
      if (e.message !== 'Password verification failed') {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      }
    },
  });

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-accent" />
          Manual Signature Registration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          You are acting as delegate for: <strong className="text-foreground">{principalName}</strong> ({principalTitle})
        </p>
        <p className="text-sm text-muted-foreground">
          This step requires: <Badge variant="outline" className="ml-1">{step.action_type === 'initial' ? 'INITIALS' : 'SIGNATURE'}</Badge>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action Selection */}
        <div className="space-y-2">
          <Label>Action</Label>
          <RadioGroup value={action} onValueChange={(v) => setAction(v as any)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="approved" id="manual-approve" />
              <Label htmlFor="manual-approve" className="font-normal">
                Approved — Signed on paper
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="rejected" id="manual-reject" />
              <Label htmlFor="manual-reject" className="font-normal">
                Rejected — Approver declined (specify reason below)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="rework" id="manual-rework" />
              <Label htmlFor="manual-rework" className="font-normal">
                Rework — Approver requests changes (specify below)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Date of physical signing */}
        <div className="space-y-2">
          <Label>Date of physical signing</Label>
          <Input type="date" value={signingDate} onChange={(e) => setSigningDate(e.target.value)} />
        </div>

        {/* Scan upload */}
        <div className="space-y-2">
          <Label>Scan/Photo of signed page (optional)</Label>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="scan-upload"
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium"
            >
              <Upload className="h-4 w-4" />
              {scanFile ? scanFile.name : 'Upload scanned signed page'}
            </Label>
            <input
              id="scan-upload"
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setScanFile(e.target.files?.[0] || null)}
            />
            {scanFile && (
              <Button variant="ghost" size="sm" onClick={() => setScanFile(null)}>Remove</Button>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label>
            Notes / Reference
            {action !== 'approved' && <span className="text-destructive"> *</span>}
          </Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='e.g., "GM signed the printed copy during morning meeting. Original filed in GM office, cabinet 3."'
            rows={3}
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label>Enter YOUR password to confirm <span className="text-destructive">*</span></Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
            placeholder="Your login password (not the approver's)"
          />
          {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => registerMutation.mutate()}
            disabled={
              !password ||
              registerMutation.isPending ||
              (action !== 'approved' && !notes.trim())
            }
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <FileText className="h-4 w-4 mr-2" />
            {registerMutation.isPending ? 'Registering...' : 'Register Manual Signature'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ManualRegistrationPanel;
