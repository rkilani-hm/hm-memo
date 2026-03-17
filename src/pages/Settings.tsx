import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { User, Pen, Save, Upload, Trash2, Type, Printer } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ChangePasswordCard } from '@/components/settings/ChangePasswordCard';
import SignedImage from '@/components/memo/SignedImage';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

const Settings = () => {
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const iniCanvasRef = useRef<HTMLCanvasElement>(null);

  const [fullName, setFullName] = useState('');
  const [initials, setInitials] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [signatureType, setSignatureType] = useState<string>('none');
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [initialsImageUrl, setInitialsImageUrl] = useState<string | null>(null);
  const [initialsType, setInitialsType] = useState<'text' | 'image' | 'drawn'>('text');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [departmentName, setDepartmentName] = useState('');

  // Print preferences
  const [printDuplexMode, setPrintDuplexMode] = useState('long_edge');
  const [printBlankBackPages, setPrintBlankBackPages] = useState(true);
  const [printWatermark, setPrintWatermark] = useState(false);
  const [printIncludeAttachments, setPrintIncludeAttachments] = useState(false);
  const [printColorMode, setPrintColorMode] = useState('color');
  const [printPageNumberStyle, setPrintPageNumberStyle] = useState('bottom_center');
  const [printConfidentialityLine, setPrintConfidentialityLine] = useState('');
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setInitials(profile.initials || '');
      setJobTitle(profile.job_title || '');
      setEmail(profile.email || '');
      setSignatureType(profile.signature_type || 'none');
      setSignatureUrl(profile.signature_image_url || null);
      // initials_image_url is a new column, access via any
      setInitialsImageUrl((profile as any).initials_image_url || null);
      if ((profile as any).initials_image_url) {
        setInitialsType('image');
      }
      // Print preferences
      setPrintDuplexMode((profile as any).print_duplex_mode || 'long_edge');
      setPrintBlankBackPages((profile as any).print_blank_back_pages ?? true);
      setPrintWatermark((profile as any).print_watermark ?? false);
      setPrintIncludeAttachments((profile as any).print_include_attachments ?? false);
      setPrintColorMode((profile as any).print_color_mode || 'color');
      setPrintPageNumberStyle((profile as any).print_page_number_style || 'bottom_center');
      setPrintConfidentialityLine((profile as any).print_confidentiality_line || '');
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
          initials_image_url: initialsImageUrl,
          print_duplex_mode: printDuplexMode,
          print_blank_back_pages: printBlankBackPages,
          print_watermark: printWatermark,
          print_include_attachments: printIncludeAttachments,
          print_color_mode: printColorMode,
          print_page_number_style: printPageNumberStyle,
          print_confidentiality_line: printConfidentialityLine || null,
        } as any)
        .eq('user_id', user.id);

      if (error) throw error;
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File, pathSuffix: string) => {
    if (!user) throw new Error('Not authenticated');
    const path = `${user.id}/${pathSuffix}`;
    const { error } = await supabase.storage
      .from('signatures')
      .upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const uploadBlob = async (blob: Blob, pathSuffix: string) => {
    if (!user) throw new Error('Not authenticated');
    const path = `${user.id}/${pathSuffix}`;
    const { error } = await supabase.storage
      .from('signatures')
      .upload(path, blob, { upsert: true, contentType: 'image/png' });
    if (error) throw error;
    return path;
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const path = await uploadFile(file, `signature.${file.name.split('.').pop()}`);
      setSignatureUrl(path);
      setSignatureType('image');
      toast({ title: 'Signature uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleInitialsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const path = await uploadFile(file, `initials.${file.name.split('.').pop()}`);
      setInitialsImageUrl(path);
      setInitialsType('image');
      toast({ title: 'Initials image uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // Generic canvas drawing helpers
  const drawingRef = useRef<{ sig: boolean; ini: boolean }>({ sig: false, ini: false });

  const getCanvasPos = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const createDrawHandlers = (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    drawingKey: 'sig' | 'ini'
  ) => ({
    startDraw: (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawingRef.current[drawingKey] = true;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pos = getCanvasPos(canvas, clientX, clientY);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    },
    draw: (clientX: number, clientY: number) => {
      if (!drawingRef.current[drawingKey]) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pos = getCanvasPos(canvas, clientX, clientY);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = 'hsl(213, 52%, 23%)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    },
    endDraw: () => { drawingRef.current[drawingKey] = false; },
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    },
    // Mouse event wrappers
    onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawingRef.current[drawingKey] = true;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pos = getCanvasPos(canvas, e.clientX, e.clientY);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    },
    onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current[drawingKey]) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pos = getCanvasPos(canvas, e.clientX, e.clientY);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = 'hsl(213, 52%, 23%)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    },
    onMouseUp: () => { drawingRef.current[drawingKey] = false; },
  });

  const sigDraw = createDrawHandlers(sigCanvasRef, 'sig');
  const iniDraw = createDrawHandlers(iniCanvasRef, 'ini');

  const saveDrawnSignature = async () => {
    const canvas = sigCanvasRef.current;
    if (!canvas || !user) return;
    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to capture signature');
      const path = await uploadBlob(blob, 'signature-drawn.png');
      setSignatureUrl(path);
      setSignatureType('drawn');
      toast({ title: 'Drawn signature saved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const saveDrawnInitials = async () => {
    const canvas = iniCanvasRef.current;
    if (!canvas || !user) return;
    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to capture initials');
      const path = await uploadBlob(blob, 'initials-drawn.png');
      setInitialsImageUrl(path);
      setInitialsType('drawn');
      toast({ title: 'Drawn initials saved' });
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
        <p className="text-muted-foreground">Manage your personal details, signature and initials</p>
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
              <Label htmlFor="initials">Initials (Text)</Label>
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

      {/* Dual Signing Assets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Pen className="h-5 w-5 text-accent" />
            Signing Assets
          </CardTitle>
          <CardDescription>
            Manage your full signature (for approvals) and initials stamp (for quick endorsements) separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signature" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signature">Full Signature</TabsTrigger>
              <TabsTrigger value="initials-asset">Initials Stamp</TabsTrigger>
            </TabsList>

            {/* ── Full Signature Tab ── */}
            <TabsContent value="signature" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Signature Method</Label>
                <Select value={signatureType} onValueChange={setSignatureType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose signature method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No signature</SelectItem>
                    <SelectItem value="image">Upload image</SelectItem>
                    <SelectItem value="drawn">Draw signature</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {signatureType === 'image' && (
                <div className="space-y-3">
                  {signatureUrl && (
                    <div className="border border-border rounded-lg p-4 bg-white flex items-center justify-center">
                      <SignedImage storagePath={signatureUrl} alt="Signature" className="max-h-20 object-contain" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Label
                      htmlFor="sig-upload"
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium"
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? 'Uploading...' : 'Upload Image'}
                    </Label>
                    <input id="sig-upload" type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} disabled={uploading} />
                    {signatureUrl && (
                      <Button variant="outline" size="sm" onClick={() => setSignatureUrl(null)}>
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
                      ref={sigCanvasRef}
                      width={500}
                      height={150}
                      className="w-full cursor-crosshair"
                      style={{ touchAction: 'none' }}
                      onMouseDown={sigDraw.onMouseDown}
                      onMouseMove={sigDraw.onMouseMove}
                      onMouseUp={sigDraw.onMouseUp}
                      onMouseLeave={sigDraw.onMouseUp}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={sigDraw.clear}>Clear</Button>
                    <Button size="sm" onClick={saveDrawnSignature} disabled={uploading}>
                      <Save className="h-4 w-4 mr-1" />
                      {uploading ? 'Saving...' : 'Save Drawn Signature'}
                    </Button>
                  </div>
                  {signatureUrl && signatureType === 'drawn' && (
                    <div className="border border-border rounded-lg p-4 bg-white flex items-center justify-center">
                      <SignedImage storagePath={signatureUrl} alt="Saved signature" className="max-h-20 object-contain" />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── Initials Stamp Tab ── */}
            <TabsContent value="initials-asset" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Your initials stamp is used for workflow steps that require a quick "Initial" endorsement rather than a full signature.
              </p>

              <div className="space-y-2">
                <Label>Initials Method</Label>
                <Select value={initialsType} onValueChange={(v) => setInitialsType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Use text initials</SelectItem>
                    <SelectItem value="image">Upload initials image</SelectItem>
                    <SelectItem value="drawn">Draw initials</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {initialsType === 'text' && (
                <div className="border border-border rounded-lg p-6 flex items-center justify-center bg-muted/30">
                  <span className="text-3xl font-bold text-primary italic tracking-wider">
                    {initials || userInitials}
                  </span>
                </div>
              )}

              {initialsType === 'image' && (
                <div className="space-y-3">
                  {initialsImageUrl && (
                    <div className="border border-border rounded-lg p-4 bg-white flex items-center justify-center">
                      <SignedImage storagePath={initialsImageUrl} alt="Initials" className="max-h-16 object-contain" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Label
                      htmlFor="ini-upload"
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium"
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? 'Uploading...' : 'Upload Image'}
                    </Label>
                    <input id="ini-upload" type="file" accept="image/*" className="hidden" onChange={handleInitialsUpload} disabled={uploading} />
                    {initialsImageUrl && (
                      <Button variant="outline" size="sm" onClick={() => setInitialsImageUrl(null)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {initialsType === 'drawn' && (
                <div className="space-y-3">
                  <div className="border border-border rounded-lg overflow-hidden bg-white">
                    <canvas
                      ref={iniCanvasRef}
                      width={300}
                      height={100}
                      className="w-full cursor-crosshair"
                      style={{ touchAction: 'none' }}
                      onMouseDown={iniDraw.onMouseDown}
                      onMouseMove={iniDraw.onMouseMove}
                      onMouseUp={iniDraw.onMouseUp}
                      onMouseLeave={iniDraw.onMouseUp}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={iniDraw.clear}>Clear</Button>
                    <Button size="sm" onClick={saveDrawnInitials} disabled={uploading}>
                      <Save className="h-4 w-4 mr-1" />
                      {uploading ? 'Saving...' : 'Save Drawn Initials'}
                    </Button>
                  </div>
                  {initialsImageUrl && (
                    <div className="border border-border rounded-lg p-4 bg-white flex items-center justify-center">
                      <SignedImage storagePath={initialsImageUrl} alt="Saved initials" className="max-h-16 object-contain" />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Print Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Printer className="h-5 w-5 text-accent" />
            Print & PDF Preferences
          </CardTitle>
          <CardDescription>
            Default settings applied when printing or exporting memos as PDF. Can be overridden per print.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Duplex Mode</Label>
              <Select value={printDuplexMode} onValueChange={setPrintDuplexMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="long_edge">Double-Sided (Long Edge)</SelectItem>
                  <SelectItem value="short_edge">Double-Sided (Short Edge)</SelectItem>
                  <SelectItem value="simplex">Single-Sided</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color Mode</Label>
              <Select value={printColorMode} onValueChange={setPrintColorMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="color">Full Color</SelectItem>
                  <SelectItem value="grayscale">Grayscale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Page Numbers</Label>
              <Select value={printPageNumberStyle} onValueChange={setPrintPageNumberStyle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom_center">Bottom Center</SelectItem>
                  <SelectItem value="bottom_right">Bottom Right</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Confidentiality Line</Label>
              <Input
                value={printConfidentialityLine}
                onChange={(e) => setPrintConfidentialityLine(e.target.value)}
                placeholder="e.g. CONFIDENTIAL — For Internal Use Only"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-6 pt-2">
            <div className="flex items-center gap-2">
              <Switch checked={printBlankBackPages} onCheckedChange={setPrintBlankBackPages} />
              <Label className="text-sm">Blank back pages (duplex)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={printIncludeAttachments} onCheckedChange={setPrintIncludeAttachments} />
              <Label className="text-sm">Include attachments</Label>
            </div>
          </div>
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
