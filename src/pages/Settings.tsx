import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { User, Pen, Save, Upload, Trash2, Lock } from 'lucide-react';
import { ChangePasswordCard } from '@/components/settings/ChangePasswordCard';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

const Settings = () => {
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const [fullName, setFullName] = useState('');
  const [initials, setInitials] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [signatureType, setSignatureType] = useState<string>('none');
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [departmentName, setDepartmentName] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setInitials(profile.initials || '');
      setJobTitle(profile.job_title || '');
      setEmail(profile.email || '');
      setSignatureType(profile.signature_type || 'none');
      setSignatureUrl(profile.signature_image_url || null);
    }
  }, [profile]);

  useEffect(() => {
    const fetchDept = async () => {
      if (!profile?.department_id) return;
      const { data } = await supabase
        .from('departments')
        .select('name')
        .eq('id', profile.department_id)
        .single();
      if (data) setDepartmentName(data.name);
    };
    fetchDept();
  }, [profile?.department_id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          initials,
          job_title: jobTitle,
          signature_type: signatureType,
          signature_image_url: signatureUrl,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const path = `${user.id}/signature.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('signatures').getPublicUrl(path);
      setSignatureUrl(data.publicUrl);
      setSignatureType('image');
      toast({ title: 'Signature uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // Drawing signature
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = 'hsl(213, 52%, 23%)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveDrawnSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !user) return;
    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to capture signature');
      const path = `${user.id}/signature-drawn.png`;
      const { error } = await supabase.storage
        .from('signatures')
        .upload(path, blob, { upsert: true, contentType: 'image/png' });
      if (error) throw error;

      const { data } = supabase.storage.from('signatures').getPublicUrl(path);
      setSignatureUrl(data.publicUrl);
      setSignatureType('drawn');
      toast({ title: 'Drawn signature saved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const userInitials = fullName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile & Settings</h1>
        <p className="text-muted-foreground">Manage your personal details and signature</p>
      </div>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">Personal Details</CardTitle>
              <CardDescription>Update your name, initials, and job title</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initials">Initials</Label>
              <Input
                id="initials"
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                maxLength={4}
                placeholder="e.g. JD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={departmentName || 'Not assigned'} disabled className="bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signature */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Pen className="h-5 w-5 text-accent" />
            Signature
          </CardTitle>
          <CardDescription>Set up your signature for memo approvals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Signature Method</Label>
            <Select value={signatureType} onValueChange={setSignatureType}>
              <SelectTrigger>
                <SelectValue placeholder="Choose signature method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No signature</SelectItem>
                <SelectItem value="initials">Use initials</SelectItem>
                <SelectItem value="image">Upload image</SelectItem>
                <SelectItem value="drawn">Draw signature</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {signatureType === 'initials' && (
            <div className="border border-border rounded-lg p-6 flex items-center justify-center bg-muted/30">
              <span className="text-2xl font-bold text-primary italic">
                {initials || userInitials}
              </span>
            </div>
          )}

          {signatureType === 'image' && (
            <div className="space-y-3">
              {signatureUrl && (
                <div className="border border-border rounded-lg p-4 bg-muted/30 flex items-center justify-center">
                  <img src={signatureUrl} alt="Signature" className="max-h-20 object-contain" />
                </div>
              )}
              <div className="flex gap-2">
                <Label
                  htmlFor="sig-upload"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Uploading...' : 'Upload Signature Image'}
                </Label>
                <input
                  id="sig-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSignatureUpload}
                  disabled={uploading}
                />
                {signatureUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSignatureUrl(null); }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                )}
              </div>
            </div>
          )}

          {signatureType === 'drawn' && (
            <div className="space-y-3">
              <div className="border border-border rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={150}
                  className="w-full cursor-crosshair"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearCanvas}>
                  Clear
                </Button>
                <Button size="sm" onClick={saveDrawnSignature} disabled={uploading}>
                  <Save className="h-4 w-4 mr-1" />
                  {uploading ? 'Saving...' : 'Save Drawn Signature'}
                </Button>
              </div>
              {signatureUrl && signatureType === 'drawn' && (
                <div className="border border-border rounded-lg p-4 bg-muted/30 flex items-center justify-center">
                  <img src={signatureUrl} alt="Saved signature" className="max-h-20 object-contain" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <ChangePasswordCard />

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={signOut} className="text-destructive border-destructive hover:bg-destructive/10">
          Sign Out
        </Button>
        <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

export default Settings;
