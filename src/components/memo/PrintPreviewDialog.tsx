import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Printer, FileDown, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import type { PrintPreferences } from '@/lib/memo-pdf';
import { DEFAULT_PRINT_PREFERENCES } from '@/lib/memo-pdf';

interface PrintPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  htmlContent: string;
  onPrint: (prefs: PrintPreferences) => void;
  savedPreferences?: Partial<PrintPreferences>;
}

const PrintPreviewDialog = ({ open, onClose, htmlContent, onPrint, savedPreferences }: PrintPreviewDialogProps) => {
  const [prefs, setPrefs] = useState<PrintPreferences>({
    ...DEFAULT_PRINT_PREFERENCES,
    ...savedPreferences,
  });
  const [zoom, setZoom] = useState(70);
  // Strip the full-page @page margins and print styles for preview rendering
  const previewHtml = htmlContent
    ? htmlContent
        .replace(/@page\s*\{[^}]*\}/g, '')
        .replace(/@page\s*:left\s*\{[^}]*\}/g, '')
        .replace(/@page\s*:right\s*\{[^}]*\}/g, '')
        .replace(/@page\s*\{[^}]*size:[^}]*\}/g, '')
    : '';

  const handlePrint = () => {
    onPrint(prefs);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            Print Preview
          </DialogTitle>
        </DialogHeader>

        {/* Printer reminder banner */}
        <Alert className="border-accent bg-accent/10">
          <AlertTriangle className="h-4 w-4 text-accent" />
          <AlertDescription className="text-sm font-medium">
            Set your printer to <strong>A4</strong> paper size and <strong>Double-Sided (Long Edge)</strong> for proper duplex printing.
          </AlertDescription>
        </Alert>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Preview area */}
          <div className="flex-1 border border-border rounded-lg overflow-auto bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground text-center mb-2 font-medium">
              Front Page
            </div>
            <div
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top center',
                width: `${100 / (zoom / 100)}%`,
              }}
            >
              <div
                className="bg-white shadow-lg mx-auto"
                style={{
                  width: '210mm',
                  minHeight: '297mm',
                  padding: '15mm',
                  border: '1px dashed hsl(var(--border))',
                  position: 'relative',
                }}
              >
                <iframe
                  srcDoc={previewHtml}
                  className="w-full border-0"
                  style={{ minHeight: '267mm', pointerEvents: 'none' }}
                  title="Print Preview"
                />
              </div>
            </div>
            {prefs.blankBackPages && (
              <>
                <div className="text-xs text-muted-foreground text-center mt-6 mb-2 font-medium">
                  Back Page (Blank)
                </div>
                <div
                  className="bg-white shadow-lg mx-auto flex items-center justify-center"
                  style={{
                    width: `calc(210mm * ${zoom / 100})`,
                    height: `calc(297mm * ${zoom / 100})`,
                    border: '1px dashed hsl(var(--border))',
                  }}
                >
                  <span className="text-muted-foreground/30 text-lg font-light">Blank</span>
                </div>
              </>
            )}
          </div>

          {/* Settings sidebar */}
          <div className="w-64 space-y-5 shrink-0 overflow-y-auto">
            {/* Zoom */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zoom</Label>
              <div className="flex items-center gap-2">
                <ZoomOut className="h-3 w-3 text-muted-foreground" />
                <Slider
                  value={[zoom]}
                  onValueChange={([v]) => setZoom(v)}
                  min={30}
                  max={150}
                  step={5}
                  className="flex-1"
                />
                <ZoomIn className="h-3 w-3 text-muted-foreground" />
              </div>
              <p className="text-xs text-center text-muted-foreground">{zoom}%</p>
            </div>

            {/* Duplex */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duplex Mode</Label>
              <Select value={prefs.duplexMode} onValueChange={(v) => setPrefs(p => ({ ...p, duplexMode: v as any }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long_edge">Long Edge (default)</SelectItem>
                  <SelectItem value="short_edge">Short Edge</SelectItem>
                  <SelectItem value="simplex">Single-Sided</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Blank back pages */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Blank Back Pages</Label>
              <Switch
                checked={prefs.blankBackPages}
                onCheckedChange={(v) => setPrefs(p => ({ ...p, blankBackPages: v }))}
              />
            </div>

            {/* Color mode */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color Mode</Label>
              <Select value={prefs.colorMode} onValueChange={(v) => setPrefs(p => ({ ...p, colorMode: v as any }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="color">Full Color</SelectItem>
                  <SelectItem value="grayscale">Grayscale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page numbers */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Page Numbers</Label>
              <Select value={prefs.pageNumberStyle} onValueChange={(v) => setPrefs(p => ({ ...p, pageNumberStyle: v as any }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom_center">Bottom Center</SelectItem>
                  <SelectItem value="bottom_right">Bottom Right</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePrint} className="gap-2">
            <FileDown className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrintPreviewDialog;
