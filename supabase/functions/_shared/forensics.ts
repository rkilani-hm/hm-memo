// Forensic analysis helpers — pure-Deno, no native deps.
// Used by memo-fraud-check to extract metadata signals from binary attachments
// without sending bytes to a model. Cheap, deterministic, auditable.

const decoder = new TextDecoder("utf-8", { fatal: false });
const ascii = new TextDecoder("latin1");

// ============================================================
// Magic-byte / format detection
// ============================================================
export function detectActualMime(bytes: Uint8Array): string | null {
  if (bytes.length < 8) return null;
  // PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  // WEBP — RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  // TIFF
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)) return "image/tiff";
  // ZIP-family (DOCX/XLSX/PPTX/odt/etc)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "application/zip";
  return null;
}

// ============================================================
// PDF analysis
// ============================================================
export interface PdfForensics {
  isPdf: boolean;
  pdfVersion?: string;
  producer?: string;
  creator?: string;
  creationDate?: string;
  modDate?: string;
  title?: string;
  author?: string;
  // structural
  startxrefCount: number;
  eofCount: number;
  hasIncrementalUpdate: boolean;     // multiple %%EOF + startxref pairs
  containsJavaScript: boolean;
  containsLaunch: boolean;           // /Launch action == auto-execute, very rare in legit invoices
  embeddedFiles: number;             // /EmbeddedFile count
  formFields: number;                // /AcroForm count (rough)
  pageCount?: number;
  acroFormPresent: boolean;
  encrypted: boolean;
  // signature presence
  hasDigitalSignature: boolean;
  // raw text scrape (rough, just for keyword cues — not for accurate extraction)
  rawTextSample: string;
}

const PDF_TRAILER_RE = /\/Producer\s*\(((?:[^()\\]|\\.)*)\)/;
const PDF_PROD_HEX_RE = /\/Producer\s*<([0-9A-Fa-f]+)>/;
const PDF_CREATOR_RE = /\/Creator\s*\(((?:[^()\\]|\\.)*)\)/;
const PDF_CREATOR_HEX_RE = /\/Creator\s*<([0-9A-Fa-f]+)>/;
const PDF_TITLE_RE = /\/Title\s*\(((?:[^()\\]|\\.)*)\)/;
const PDF_AUTHOR_RE = /\/Author\s*\(((?:[^()\\]|\\.)*)\)/;
const PDF_CREATIONDATE_RE = /\/CreationDate\s*\(D:([0-9'+\-Z]+)\)/;
const PDF_MODDATE_RE = /\/ModDate\s*\(D:([0-9'+\-Z]+)\)/;

function decodePdfString(raw: string): string {
  // PDF strings can be escaped: \(, \), \\, octal escapes, etc. Cheap approx.
  return raw
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function decodeHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const c = parseInt(clean.substring(i, i + 2), 16);
    if (!isNaN(c)) out += String.fromCharCode(c);
  }
  // strip common UTF-16 BOM
  if (out.charCodeAt(0) === 0xfe && out.charCodeAt(1) === 0xff) {
    let utf16 = "";
    for (let i = 2; i + 1 < out.length; i += 2) {
      utf16 += String.fromCharCode((out.charCodeAt(i) << 8) | out.charCodeAt(i + 1));
    }
    return utf16;
  }
  return out;
}

export function analyzePdf(bytes: Uint8Array): PdfForensics {
  const head = ascii.decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  const isPdf = head.startsWith("%PDF-");
  const pdfVersion = isPdf ? head.match(/^%PDF-(\d+\.\d+)/)?.[1] : undefined;

  if (!isPdf) {
    return {
      isPdf: false,
      startxrefCount: 0,
      eofCount: 0,
      hasIncrementalUpdate: false,
      containsJavaScript: false,
      containsLaunch: false,
      embeddedFiles: 0,
      formFields: 0,
      acroFormPresent: false,
      encrypted: false,
      hasDigitalSignature: false,
      rawTextSample: "",
    };
  }

  // Decode whole file as latin1 (1-byte safe) for pattern scanning.
  // (Real extraction needs proper PDF parsing; this is enough for forensic cues.)
  const text = ascii.decode(bytes);

  const matchOne = (re: RegExp, hexRe?: RegExp): string | undefined => {
    const m = text.match(re);
    if (m) return decodePdfString(m[1]);
    if (hexRe) {
      const h = text.match(hexRe);
      if (h) return decodeHexString(h[1]);
    }
    return undefined;
  };

  const producer = matchOne(PDF_TRAILER_RE, PDF_PROD_HEX_RE);
  const creator = matchOne(PDF_CREATOR_RE, PDF_CREATOR_HEX_RE);
  const title = matchOne(PDF_TITLE_RE);
  const author = matchOne(PDF_AUTHOR_RE);
  const creationDate = text.match(PDF_CREATIONDATE_RE)?.[1];
  const modDate = text.match(PDF_MODDATE_RE)?.[1];

  const startxrefCount = (text.match(/startxref/g) || []).length;
  const eofCount = (text.match(/%%EOF/g) || []).length;
  const hasIncrementalUpdate = startxrefCount > 1 || eofCount > 1;
  const containsJavaScript = /\/JavaScript|\/JS\b/.test(text);
  const containsLaunch = /\/Launch\b/.test(text);
  const embeddedFiles = (text.match(/\/EmbeddedFile\b/g) || []).length;
  const acroFormPresent = /\/AcroForm\b/.test(text);
  const formFields = (text.match(/\/Type\s*\/Annot[^>]*\/Subtype\s*\/Widget/g) || []).length;
  const encrypted = /\/Encrypt\b/.test(text);
  const hasDigitalSignature =
    /\/Type\s*\/Sig\b/.test(text) || /\/ByteRange\s*\[/.test(text);
  const pageCountMatch = text.match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/);
  const pageCount = pageCountMatch ? parseInt(pageCountMatch[1], 10) : undefined;

  // Pull a rough sample of human-readable text (ASCII only, dedup whitespace)
  const sample = text
    .replace(/[\x00-\x08\x0E-\x1F\x7F]/g, " ")
    .replace(/[^\x20-\x7E\n]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 4000);

  return {
    isPdf: true,
    pdfVersion,
    producer,
    creator,
    creationDate,
    modDate,
    title,
    author,
    startxrefCount,
    eofCount,
    hasIncrementalUpdate,
    containsJavaScript,
    containsLaunch,
    embeddedFiles,
    formFields,
    acroFormPresent,
    encrypted,
    hasDigitalSignature,
    pageCount,
    rawTextSample: sample,
  };
}

// ============================================================
// JPEG / EXIF analysis (no external deps)
// ============================================================
export interface ImageForensics {
  format: "jpeg" | "png" | "webp" | "gif" | "tiff" | "unknown";
  width?: number;
  height?: number;
  // EXIF (jpeg only here)
  software?: string;
  make?: string;
  model?: string;
  dateTimeOriginal?: string;
  modifyDate?: string;
  // PNG ancillary chunks
  pngTextChunks: Array<{ keyword: string; value: string }>;
  // structural
  hasMultipleApp1: boolean;     // jpeg: multiple Exif APP1 segments
  jpegSegments: string[];       // marker codes seen
  pngChunks: string[];          // chunk types seen
  rawDescriptionSample?: string;
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}
function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? (bytes[offset]) | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] * 0x1000000)
    : (bytes[offset] * 0x1000000) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | (bytes[offset + 3]);
}

function parseExifFromTiff(tiff: Uint8Array): {
  software?: string;
  make?: string;
  model?: string;
  dateTimeOriginal?: string;
  modifyDate?: string;
} {
  // tiff[0..1] = "II" (little) or "MM" (big), tiff[2..3] = 0x002A
  if (tiff.length < 8) return {};
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  const be = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!le && !be) return {};

  const ifdOffset = readUint32(tiff, 4, le);
  if (ifdOffset + 2 > tiff.length) return {};

  const tagsToRead: Record<number, keyof ReturnType<typeof parseExifFromTiff>> = {
    0x010f: "make",
    0x0110: "model",
    0x0131: "software",
    0x0132: "modifyDate",
    0x9003: "dateTimeOriginal",
  };

  const out: Record<string, string> = {};

  function readIfd(offset: number, depth = 0) {
    if (depth > 2) return;
    if (offset + 2 > tiff.length) return;
    const count = readUint16(tiff, offset, le);
    let p = offset + 2;
    for (let i = 0; i < count; i++) {
      if (p + 12 > tiff.length) return;
      const tag = readUint16(tiff, p, le);
      const type = readUint16(tiff, p + 2, le);
      const len = readUint32(tiff, p + 4, le);
      const valueOrOffset = readUint32(tiff, p + 8, le);

      // ExifIFDPointer
      if (tag === 0x8769) {
        readIfd(valueOrOffset, depth + 1);
      }

      if (tagsToRead[tag] && type === 2 /* ASCII */) {
        const start = len > 4 ? valueOrOffset : p + 8;
        if (start + len <= tiff.length) {
          const slice = tiff.subarray(start, start + len);
          // strip trailing NULs
          let end = slice.length;
          while (end > 0 && slice[end - 1] === 0) end--;
          const str = new TextDecoder("ascii").decode(slice.subarray(0, end));
          out[tagsToRead[tag]] = str;
        }
      }
      p += 12;
    }
  }

  readIfd(ifdOffset);
  return out;
}

export function analyzeImage(bytes: Uint8Array): ImageForensics {
  const fmt = detectActualMime(bytes);
  const out: ImageForensics = {
    format: "unknown",
    pngTextChunks: [],
    hasMultipleApp1: false,
    jpegSegments: [],
    pngChunks: [],
  };

  if (fmt === "image/jpeg") {
    out.format = "jpeg";
    let p = 2; // skip SOI
    let app1Count = 0;
    while (p + 4 < bytes.length) {
      if (bytes[p] !== 0xff) break;
      const marker = bytes[p + 1];
      out.jpegSegments.push(marker.toString(16));
      if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
      const segLen = readUint16(bytes, p + 2, false);
      if (segLen < 2) break;

      // SOFx (0xC0..0xCF except 0xC4, 0xCC, 0xC8) gives dimensions
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc &&
        p + 2 + segLen <= bytes.length
      ) {
        // SOF: [precision 1B, height 2B, width 2B, ...]
        out.height = readUint16(bytes, p + 5, false);
        out.width = readUint16(bytes, p + 7, false);
      }

      if (marker === 0xe1) {
        app1Count++;
        // APP1 — could be Exif or XMP
        const segStart = p + 4;
        const segEnd = p + 2 + segLen;
        if (segEnd <= bytes.length) {
          // Check Exif\0\0 prefix
          const head = ascii.decode(bytes.subarray(segStart, Math.min(segStart + 6, segEnd)));
          if (head.startsWith("Exif\0\0")) {
            const tiff = bytes.subarray(segStart + 6, segEnd);
            const exif = parseExifFromTiff(tiff);
            Object.assign(out, exif);
          } else if (head.startsWith("http:/") || head.startsWith("http://")) {
            // XMP — just extract human-readable text
            const xmpText = ascii.decode(bytes.subarray(segStart, segEnd));
            const swMatch = xmpText.match(/<xmp:CreatorTool>([^<]+)</);
            if (swMatch && !out.software) out.software = swMatch[1];
          }
        }
      }
      p += 2 + segLen;
    }
    out.hasMultipleApp1 = app1Count > 1;
  } else if (fmt === "image/png") {
    out.format = "png";
    // PNG: 8-byte signature, then chunks of [length 4B][type 4B][data][crc 4B]
    if (bytes.length >= 24) {
      // IHDR is the first chunk
      const ihdrLen = readUint32(bytes, 8, false);
      const ihdrType = ascii.decode(bytes.subarray(12, 16));
      if (ihdrType === "IHDR" && ihdrLen >= 8) {
        out.width = readUint32(bytes, 16, false);
        out.height = readUint32(bytes, 20, false);
      }
    }
    let p = 8;
    while (p + 12 <= bytes.length) {
      const len = readUint32(bytes, p, false);
      const type = ascii.decode(bytes.subarray(p + 4, p + 8));
      out.pngChunks.push(type);
      const dataStart = p + 8;
      const dataEnd = dataStart + len;
      if (dataEnd > bytes.length) break;
      if (type === "tEXt" || type === "iTXt") {
        const data = bytes.subarray(dataStart, dataEnd);
        const nullIdx = data.indexOf(0);
        if (nullIdx > 0) {
          const keyword = ascii.decode(data.subarray(0, nullIdx));
          const value = ascii.decode(data.subarray(nullIdx + 1)).replace(/\0+/g, " ").trim();
          out.pngTextChunks.push({ keyword, value });
          if (keyword.toLowerCase() === "software" && !out.software) out.software = value;
        }
      }
      if (type === "IEND") break;
      p = dataEnd + 4; // +4 CRC
    }
  } else if (fmt === "image/webp") {
    out.format = "webp";
  } else if (fmt === "image/gif") {
    out.format = "gif";
  } else if (fmt === "image/tiff") {
    out.format = "tiff";
    const exif = parseExifFromTiff(bytes);
    Object.assign(out, exif);
  }

  return out;
}

// ============================================================
// Suspicious pattern lists (used to grade signals)
// ============================================================

// Known image-editing software fingerprints. Presence in EXIF Software tag
// or XMP CreatorTool is a signal — a high one if combined with no Make/Model.
export const EDITING_SOFTWARE_PATTERNS = [
  /adobe\s*photoshop/i,
  /photoshop/i,
  /gimp/i,
  /paint\.net/i,
  /pixlr/i,
  /affinity\s*photo/i,
  /corel\s*photo/i,
  /\bpaint\b/i,
  /capture one/i,
  /lightroom/i,
];

// Software fingerprints that are usually neutral on PDFs (legit ERPs)
export const LEGIT_PDF_PRODUCERS = [
  /sap\b/i,
  /oracle/i,
  /netsuite/i,
  /quickbooks/i,
  /tally/i,
  /microsoft®?\s*word/i,
  /microsoft®?\s*excel/i,
  /libreoffice/i,
  /openoffice/i,
  /ghostscript/i,
  /tcpdf/i,
  /itextsharp/i,
  /itext/i,
  /fpdf/i,
  /reportlab/i,
  /docusign/i,
  /odoo/i,
  /zoho/i,
  /xero/i,
  /\bcrystal\s*reports?\b/i,
];

// Producers that are high-risk red flags on financial documents
export const SUSPICIOUS_PDF_PRODUCERS = [
  /adobe\s*acrobat\b(?!.*\bdistiller\b)/i,    // hand-edited Acrobat saves are suspicious on invoices
  /acrobat\s*pro/i,
  /\bpdfescape\b/i,
  /\bsmallpdf\b/i,
  /\bilovepdf\b/i,
  /\bsejda\b/i,
  /\bpdfill\b/i,
  /\bnitro\s*pdf\b/i,
  /\bfoxit\s*phantom\b/i,
];
