import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, FileDown, ZoomIn, ZoomOut, AlertTriangle, Paperclip } from 'lucide-react';
import type { PrintPreferences } from '@/lib/memo-pdf';
import { DEFAULT_PRINT_PREFERENCES } from '@/lib/memo-pdf';
import {
  canMergeAttachment,
  attachmentDisplayKind,
  formatFileSize,
  type BundleAttachment,
} from '@/lib/attachments-bundle';

interface PrintPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  htmlContent: string;
  onPrint: (prefs: PrintPreferences) => void;
  savedPreferences?: Partial<PrintPreferences>;
  // Attachments available on the memo. The dialog lets the user pick
  // which to include in the separate attachments-bundle PDF (only PDFs
  // and PNG/JPEG images are mergeable; others are shown but disabled).
  attachments?: BundleAttachment[];
}

const PrintPreviewDialog = ({ open, onClose, htmlContent, onPrint, savedPreferences, attachments = [] }: PrintPreviewDialogProps) => {
  const [prefs, setPrefs] = useState<PrintPreferences>({
    ...DEFAULT_PRINT_PREFERENCES,
    ...savedPreferences,
  });
  const [zoom, setZoom] = useState(70);

  // When the dialog opens, default to "no attachments selected" so the
  // user has to opt in. Default-include would surprise users who just
  // want a quick memo print.
  useEffect(() => {
    if (open) {
      setPrefs((p) => ({ ...p, selectedAttachmentIds: [] }));
    }
  }, [open]);

  const mergeableAttachments = attachments.filter(canMergeAttachment);
  const allMergeableSelected =
    mergeableAttachments.length > 0 &&
    mergeableAttachments.every((a) => prefs.selectedAttachmentIds.includes(a.id));
  const totalSelectedSize = attachments
    .filter((a) => prefs.selectedAttachmentIds.includes(a.id))
    .reduce((sum, a) => sum + (a.file_size || 0), 0);
  const sizeWarn = totalSelectedSize > 50 * 1024 * 1024; // > 50 MB

  const toggleAttachment = (id: string) => {
    setPrefs((p) => {
      const already = p.selectedAttachmentIds.includes(id);
      return {
        ...p,
        selectedAttachmentIds: already
          ? p.selectedAttachmentIds.filter((x) => x !== id)
          : [...p.selectedAttachmentIds, id],
      };
    });
  };

  const toggleAllMergeable = () => {
    setPrefs((p) => ({
      ...p,
      selectedAttachmentIds: allMergeableSelected
        ? []
        : mergeableAttachments.map((a) => a.id),
    }));
  };

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
          {/* Preview area — simulates Chrome print preview */}
          <div
            className="flex-1 rounded-lg overflow-auto p-6 flex flex-col items-center"
            style={{ background: '#525659' }}
          >
            <div className="text-xs text-white/60 text-center mb-3 font-medium">
              Front Page
            </div>
            <div
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top center',
                width: `${100 / (zoom / 100)}%`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                className="a4-page-frame"
                style={{
                  width: '210mm',
                  minHeight: '297mm',
                  background: 'white',
                  padding: '20mm 15mm',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  position: 'relative',
                }}
              >
                <iframe
                  srcDoc={previewHtml}
                  className="w-full border-0"
                  style={{ minHeight: '257mm', pointerEvents: 'none' }}
                  title="Print Preview"
                />
              </div>

              {prefs.blankBackPages && (
                <>
                  <div className="text-xs text-white/60 text-center mt-6 mb-3 font-medium">
                    Back Page (Blank)
                  </div>
                  <div
                    style={{
                      width: '210mm',
                      height: '297mm',
                      background: 'white',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ color: '#ccc', fontSize: '18px', fontWeight: 300 }}>Blank</span>
                  </div>
                </>
              )}
            </div>
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

            {/* Include Attachments — produces a separate downloaded PDF
                bundle alongside the memo print. Hidden when there are no
                attachments at all. */}
            {attachments.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Paperclip className="h-3 w-3" />
                    Include Attachments
                  </Label>
                  <Switch
                    checked={prefs.includeAttachments}
                    onCheckedChange={(v) => {
                      setPrefs((p) => ({
                        ...p,
                        includeAttachments: v,
                        // When turning off, drop selected ids so a future
                        // re-toggle starts clean.
                        selectedAttachmentIds: v ? p.selectedAttachmentIds : [],
                      }));
                    }}
                  />
                </div>

                {prefs.includeAttachments && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Selected attachments are bundled into a separate PDF
                      that downloads alongside the memo print.
                    </p>

                    {mergeableAttachments.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllMergeable}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        {allMergeableSelected ? 'Deselect all' : 'Select all (mergeable)'}
                      </button>
                    )}

                    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                      {attachments.map((att) => {
                        const mergeable = canMergeAttachment(att);
                        const checked = prefs.selectedAttachmentIds.includes(att.id);
                        const kind = attachmentDisplayKind(att);
                        const size = formatFileSize(att.file_size);
                        return (
                          <label
                            key={att.id}
                            className={`flex items-start gap-2 p-1.5 rounded border text-[11px] ${
                              mergeable
                                ? 'border-border hover:bg-muted/40 cursor-pointer'
                                : 'border-border/50 bg-muted/30 cursor-not-allowed'
                            }`}
                            title={
                              mergeable
                                ? att.file_name
                                : `${kind} files cannot be merged into a PDF`
                            }
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => mergeable && toggleAttachment(att.id)}
                              disabled={!mergeable}
                              className="mt-0.5"
                            />
                            <span className="flex-1 min-w-0">
                              <span
                                className={`block font-medium leading-tight truncate ${
                                  mergeable ? 'text-foreground' : 'text-muted-foreground'
                                }`}
                              >
                                {att.file_name}
                              </span>
                              <span className="block text-[10px] text-muted-foreground mt-0.5">
                                {kind}{size ? ` · ${size}` : ''}
                                {!mergeable && ' · cannot include in PDF'}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {sizeWarn && (
                      <p className="text-[10px] text-warning leading-snug">
                        Selected attachments exceed 50&nbsp;MB. Large bundles may
                        take a moment to generate.
                      </p>
                    )}

                    {prefs.selectedAttachmentIds.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {prefs.selectedAttachmentIds.length} selected · {formatFileSize(totalSelectedSize)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
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
