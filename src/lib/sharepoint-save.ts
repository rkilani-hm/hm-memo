import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import type { MemoData, PrintPreferences } from './memo-pdf';
import { DEFAULT_PRINT_PREFERENCES, prepareMemoData } from './memo-pdf';
import { buildMemoHtml } from './memo-pdf-html';
import type { PdfLayout } from '@/components/memo/PdfLayoutEditor';

/**
 * Generate a PDF blob from memo HTML using html2canvas + jsPDF.
 * This renders the memo in a hidden iframe, captures it as images,
 * and assembles a multi-page A4 PDF.
 */
async function generatePdfBlob(html: string): Promise<Blob> {
  // Create a hidden container to render the memo HTML
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: -10000px; left: -10000px;
    width: 794px; /* A4 width at 96dpi */
    background: white; z-index: -9999;
  `;
  container.innerHTML = html
    .replace(/<!DOCTYPE[^>]*>/i, '')
    .replace(/<html[^>]*>/i, '')
    .replace(/<\/html>/i, '')
    .replace(/<head>[\s\S]*?<\/head>/i, '')
    .replace(/<\/?body[^>]*>/gi, '');

  // Inject the styles from the HTML into the container
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    const styleEl = document.createElement('style');
    styleEl.textContent = styleMatch[1];
    container.prepend(styleEl);
  }

  document.body.appendChild(container);

  // Wait for images (signatures, logos) to load
  const images = container.querySelectorAll('img');
  await Promise.all(
    Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 3000); // Timeout per image
        })
    )
  );

  // Small delay to let CSS render
  await new Promise((r) => setTimeout(r, 500));

  // Capture at 2x scale for sharp PDF
  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    width: 794,
    windowWidth: 794,
    logging: false,
  });

  document.body.removeChild(container);

  // A4 dimensions in mm
  const pageWidth = 210;
  const pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // If content fits on one page
  if (imgHeight <= pageHeight) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
  } else {
    // Multi-page: slice the canvas into A4-sized pages
    const pageCanvasHeight = (pageHeight * canvas.width) / imgWidth;
    let yOffset = 0;
    let pageNum = 0;

    while (yOffset < canvas.height) {
      if (pageNum > 0) pdf.addPage();

      const sliceHeight = Math.min(pageCanvasHeight, canvas.height - yOffset);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, -yOffset);
      }

      const sliceImgHeight = (sliceHeight * imgWidth) / canvas.width;
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, sliceImgHeight);

      yOffset += pageCanvasHeight;
      pageNum++;
    }
  }

  return pdf.output('blob');
}

/**
 * Convert transmittal number to a safe filename.
 * e.g. "HM/IT-IM/0036/2026" → "HM-IT-IM-0036-2026"
 */
function transmittalToFileName(transmittalNo: string): string {
  return transmittalNo.replace(/\//g, '-');
}

/**
 * Extract the year from a transmittal number.
 * e.g. "HM/IT-IM/0036/2026" → "2026"
 */
function extractYear(transmittalNo: string): string {
  const parts = transmittalNo.split('/');
  const yearPart = parts[parts.length - 1];
  if (/^\d{4}$/.test(yearPart)) return yearPart;
  // Fallback: use current year
  return new Date().getFullYear().toString();
}

/**
 * Auto-save an approved memo as PDF to SharePoint.
 * Call this after a memo reaches 'approved' status.
 *
 * @param memoData - The full memo data (same as used for print preview)
 * @param pdfLayout - Optional PDF layout configuration
 * @returns Object with success status and SharePoint URL
 */
export async function saveApprovedMemoToSharePoint(
  memoData: MemoData,
  pdfLayout?: PdfLayout | null
): Promise<{ success: boolean; webUrl?: string; error?: string }> {
  try {
    const { memo } = memoData;
    const transmittalNo = memo.transmittal_no;
    const fileName = transmittalToFileName(transmittalNo);
    const year = extractYear(transmittalNo);

    console.log(`[SharePoint] Generating PDF for ${transmittalNo}...`);

    // Generate the memo HTML (same as print preview)
    const prepared = await prepareMemoData(memoData);
    const prefs: PrintPreferences = {
      ...DEFAULT_PRINT_PREFERENCES,
      blankBackPages: false,
      duplexMode: 'simplex',
    };
    const html = buildMemoHtml(memoData, prepared, prefs, pdfLayout);

    // Convert HTML to PDF blob
    const pdfBlob = await generatePdfBlob(html);

    // Convert blob to base64
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryStr = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binaryStr += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
    }
    const pdfBase64 = btoa(binaryStr);

    console.log(`[SharePoint] PDF generated (${(pdfBase64.length * 0.75 / 1024).toFixed(0)} KB). Uploading ${fileName}.pdf to /${year}/...`);

    // Call the edge function to upload to SharePoint
    const { data, error } = await supabase.functions.invoke('save-to-sharepoint', {
      body: {
        pdfBase64,
        fileName,
        year,
        transmittalNo,
      },
    });

    if (error) {
      console.error('[SharePoint] Edge function error:', error);
      return { success: false, error: error.message || 'Edge function call failed' };
    }

    if (data?.success) {
      console.log(`[SharePoint] ✅ Saved: ${data.path}`);
      return { success: true, webUrl: data.webUrl };
    } else {
      console.error('[SharePoint] Upload failed:', data?.error);
      return { success: false, error: data?.error || 'Upload failed' };
    }
  } catch (err: any) {
    console.error('[SharePoint] Error:', err);
    return { success: false, error: err.message || 'Unknown error' };
  }
}
