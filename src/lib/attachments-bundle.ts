// =====================================================================
// Attachments Bundle PDF
// =====================================================================
//
// When a user generates a memo PDF and chooses "Include Attachments",
// the memo itself goes through the existing native browser-print flow
// (which produces the highest-quality output). The selected attachments
// are bundled into a SEPARATE PDF and downloaded to the user.
//
// Why two outputs instead of one:
//   - The memo's native print flow uses the browser's print engine,
//     which renders HTML at full fidelity (correct fonts, vector
//     graphics, hairline borders, etc.). Replacing it with an
//     html2canvas → jsPDF rasterization to get a single merged file
//     would noticeably degrade the memo's print quality. Two clearly
//     labelled outputs is a fair trade.
//   - The user already has a "Print" dialog open from the memo. The
//     attachments bundle downloads in the background — they end up
//     with both files within seconds.
//
// What can be merged:
//   - PDFs:   pages copied directly into the bundle.
//   - Images: each embedded as one page (PNG, JPEG only — pdf-lib
//             doesn't support GIF/WebP/SVG natively).
//   - Other:  Word/Excel/ZIP/etc. cannot be merged into a PDF.
//             The dialog must NOT pass these into selectedAttachmentIds
//             — the dialog disables them at selection time.
//             If one slips through, we skip it with a console.warn
//             rather than failing the whole bundle.
//
// Bundle structure:
//   1. Cover page: "Attachments for memo <transmittal_no> — <subject>"
//                  with date and the list of files included.
//   2. For each selected attachment, a divider page with the filename
//      followed by the attachment's pages.
// =====================================================================

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getAttachmentSignedUrl } from './memo-api';

export type BundleAttachment = {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
};

/**
 * Returns true if a given attachment can be embedded into a merged PDF.
 * PDFs and PNG/JPEG images only.
 */
export function canMergeAttachment(att: BundleAttachment): boolean {
  const t = (att.file_type || '').toLowerCase();
  if (t === 'application/pdf') return true;
  if (t === 'image/png' || t === 'image/jpeg' || t === 'image/jpg') return true;
  // Heuristic fallback when MIME type is missing or wrong:
  const name = att.file_name.toLowerCase();
  if (name.endsWith('.pdf')) return true;
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return true;
  return false;
}

/**
 * Friendly category for the dialog UI to show next to the filename.
 */
export function attachmentDisplayKind(att: BundleAttachment): string {
  const t = (att.file_type || '').toLowerCase();
  const name = att.file_name.toLowerCase();
  if (t === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'Image';
  if (/word|officedocument\.wordprocessingml/.test(t) || /\.docx?$/.test(name)) return 'Word';
  if (/excel|sheet/.test(t) || /\.xlsx?$/.test(name)) return 'Excel';
  if (t === 'application/zip' || name.endsWith('.zip')) return 'ZIP';
  return 'Other';
}

/**
 * Format a file size as a short human-readable string.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BuildBundleParams {
  attachments: BundleAttachment[];
  selectedIds: string[];
  memoSubject: string;
  transmittalNo: string;
}

/**
 * Build a single PDF that bundles the selected attachments. Returns a
 * Blob the caller can download.
 *
 * Failures on individual attachments are tolerated — they're logged
 * and skipped, and the bundle continues with the rest. A failed file
 * does NOT block the bundle from completing. The bundle's cover page
 * lists what was actually included.
 */
export async function buildAttachmentsBundle({
  attachments,
  selectedIds,
  memoSubject,
  transmittalNo,
}: BuildBundleParams): Promise<{ blob: Blob; included: BundleAttachment[]; skipped: BundleAttachment[] }> {
  const selected = attachments.filter((a) => selectedIds.includes(a.id));
  if (selected.length === 0) {
    throw new Error('No attachments selected');
  }

  const bundle = await PDFDocument.create();
  const helvetica = await bundle.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await bundle.embedFont(StandardFonts.HelveticaBold);

  const included: BundleAttachment[] = [];
  const skipped: BundleAttachment[] = [];

  // ---- Process each attachment ----------------------------------------
  for (const att of selected) {
    if (!canMergeAttachment(att)) {
      console.warn(`Skipping non-mergeable attachment: ${att.file_name}`);
      skipped.push(att);
      continue;
    }

    try {
      const signedUrl = await getAttachmentSignedUrl(att.file_url);
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const buf = new Uint8Array(await response.arrayBuffer());

      const isPdf =
        (att.file_type || '').toLowerCase() === 'application/pdf' ||
        att.file_name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        // Copy every page from the source PDF, prefixed with a divider page
        // bearing the filename so readers can navigate the bundle.
        addDividerPage(bundle, helveticaBold, helvetica, att.file_name);
        const sourcePdf = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pageCount = sourcePdf.getPageCount();
        const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
        const copied = await bundle.copyPages(sourcePdf, pageIndices);
        copied.forEach((p) => bundle.addPage(p));
      } else {
        // Image — embed as a single page sized to the image's aspect ratio.
        addDividerPage(bundle, helveticaBold, helvetica, att.file_name);
        const isPng = (att.file_type || '').includes('png') || att.file_name.toLowerCase().endsWith('.png');
        const embedded = isPng
          ? await bundle.embedPng(buf)
          : await bundle.embedJpg(buf);

        // Fit the image into A4 portrait at most (595 × 842 pt).
        const A4_W = 595;
        const A4_H = 842;
        const margin = 36;
        const maxW = A4_W - margin * 2;
        const maxH = A4_H - margin * 2;
        const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
        const drawW = embedded.width * scale;
        const drawH = embedded.height * scale;

        const page = bundle.addPage([A4_W, A4_H]);
        page.drawImage(embedded, {
          x: (A4_W - drawW) / 2,
          y: (A4_H - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }

      included.push(att);
    } catch (e) {
      console.warn(`Failed to merge attachment ${att.file_name}:`, e);
      skipped.push(att);
    }
  }

  // ---- Build the cover page (inserted at the start) -------------------
  if (included.length === 0) {
    throw new Error(
      'None of the selected attachments could be merged. Check the file types — only PDF, PNG, and JPEG are supported.',
    );
  }

  const cover = bundle.insertPage(0, [595, 842]);
  drawCoverPage(cover, helveticaBold, helvetica, {
    transmittalNo,
    memoSubject,
    included,
    skipped,
  });

  const bytes = await bundle.save();
  // pdf-lib returns Uint8Array; convert to a fresh ArrayBuffer that
  // satisfies BlobPart's type (Uint8Array isn't directly assignable
  // in some TS configurations because of SharedArrayBuffer concerns).
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  return { blob, included, skipped };
}

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

function addDividerPage(
  bundle: PDFDocument,
  fontBold: any,
  font: any,
  fileName: string,
): void {
  const page = bundle.addPage([595, 842]);
  const { width, height } = page.getSize();
  page.drawText('ATTACHMENT', {
    x: 60,
    y: height / 2 + 30,
    size: 11,
    font: fontBold,
    color: rgb(0.6, 0.05, 0.1), // brand red — matches Al Hamra primary
  });
  page.drawText(fileName, {
    x: 60,
    y: height / 2,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
    maxWidth: width - 120,
  });
  page.drawLine({
    start: { x: 60, y: height / 2 - 20 },
    end: { x: width - 60, y: height / 2 - 20 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
}

interface CoverParams {
  transmittalNo: string;
  memoSubject: string;
  included: BundleAttachment[];
  skipped: BundleAttachment[];
}

function drawCoverPage(page: any, fontBold: any, font: any, params: CoverParams): void {
  const { width, height } = page.getSize();
  const margin = 60;
  let cursor = height - margin - 20;

  // Header eyebrow
  page.drawText('MEMO ATTACHMENTS', {
    x: margin,
    y: cursor,
    size: 10,
    font: fontBold,
    color: rgb(0.6, 0.05, 0.1),
  });
  cursor -= 30;

  // Big title
  page.drawText('Attachments Bundle', {
    x: margin,
    y: cursor,
    size: 28,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursor -= 30;

  // Memo identifier
  page.drawText(`${params.transmittalNo}`, {
    x: margin,
    y: cursor,
    size: 12,
    font: fontBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  cursor -= 20;

  page.drawText(params.memoSubject, {
    x: margin,
    y: cursor,
    size: 12,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
    maxWidth: width - margin * 2,
  });
  cursor -= 30;

  // Date
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  page.drawText(`Generated: ${dateStr}`, {
    x: margin,
    y: cursor,
    size: 10,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  cursor -= 40;

  // Divider
  page.drawLine({
    start: { x: margin, y: cursor },
    end: { x: width - margin, y: cursor },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  cursor -= 25;

  // Files included
  page.drawText(`Files included (${params.included.length})`, {
    x: margin,
    y: cursor,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  cursor -= 18;

  for (const att of params.included) {
    page.drawText(`•  ${att.file_name}`, {
      x: margin + 8,
      y: cursor,
      size: 10,
      font: font,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth: width - margin * 2 - 8,
    });
    cursor -= 16;
  }

  // Files skipped (only if any)
  if (params.skipped.length > 0) {
    cursor -= 14;
    page.drawText(`Files not included (${params.skipped.length})`, {
      x: margin,
      y: cursor,
      size: 11,
      font: fontBold,
      color: rgb(0.5, 0.3, 0.05),
    });
    cursor -= 14;
    page.drawText('These file types cannot be merged into a PDF and were skipped.', {
      x: margin,
      y: cursor,
      size: 9,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    cursor -= 14;

    for (const att of params.skipped) {
      page.drawText(`•  ${att.file_name}`, {
        x: margin + 8,
        y: cursor,
        size: 10,
        font: font,
        color: rgb(0.5, 0.3, 0.05),
        maxWidth: width - margin * 2 - 8,
      });
      cursor -= 16;
    }
  }
}

/**
 * Convenience: trigger a browser download of the bundle Blob.
 */
export function downloadBundleBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke later — some browsers need a tick to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
