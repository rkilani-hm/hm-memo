import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { MEMO_TYPE_OPTIONS } from '@/components/memo/TransmittedForGrid';
import { buildMemoHtml } from '@/lib/memo-pdf-html';
import type { PdfLayout } from '@/components/memo/PdfLayoutEditor';

type Profile = Tables<'profiles'>;

export interface MemoData {
  memo: Tables<'memos'>;
  fromProfile: Profile | undefined;
  toProfile: Profile | undefined;
  department: Tables<'departments'> | undefined;
  approvalSteps: Tables<'approval_steps'>[];
  attachments: Tables<'memo_attachments'>[];
  profiles: Profile[];
  departments?: Tables<'departments'>[];
  logoDataUrl: string;
}

export interface PrintPreferences {
  duplexMode: 'long_edge' | 'short_edge' | 'simplex';
  blankBackPages: boolean;
  watermark: boolean;
  includeAttachments: boolean;
  colorMode: 'color' | 'grayscale';
  pageNumberStyle: 'bottom_center' | 'bottom_right' | 'none';
  confidentialityLine: string | null;
}

export const DEFAULT_PRINT_PREFERENCES: PrintPreferences = {
  duplexMode: 'long_edge',
  blankBackPages: true,
  watermark: false,
  includeAttachments: false,
  colorMode: 'color',
  pageNumberStyle: 'bottom_center',
  confidentialityLine: null,
};

export async function getSignedImageDataUrl(storagePath: string, bucket = 'signatures'): Promise<string | null> {
  try {
    // If the value is already a data URL, return it directly
    if (storagePath.startsWith('data:')) {
      return storagePath;
    }

    let path = storagePath;
    const bucketPrefix = `/storage/v1/object/public/${bucket}/`;
    const idx = path.indexOf(bucketPrefix);
    if (idx !== -1) path = path.substring(idx + bucketPrefix.length);
    const signedPrefix = `/storage/v1/object/sign/${bucket}/`;
    const sidx = path.indexOf(signedPrefix);
    if (sidx !== -1) path = path.substring(sidx + signedPrefix.length).split('?')[0];

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return null;

    const response = await fetch(data.signedUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function getProfile(profiles: Profile[], userId: string) {
  return profiles.find((p) => p.user_id === userId);
}

export async function prepareMemoData(data: MemoData): Promise<{
  sigDataUrls: Record<string, string | null>;
  registeredByProfiles: Record<string, Profile | undefined>;
  senderSigDataUrl: string | null;
}> {
  const sigDataUrls: Record<string, string | null> = {};
  const registeredByProfiles: Record<string, Profile | undefined> = {};

  for (const step of data.approvalSteps) {
    if (step.signature_image_url) {
      sigDataUrls[step.id] = await getSignedImageDataUrl(step.signature_image_url);
    }
    if ((step as any).registered_by_user_id) {
      registeredByProfiles[step.id] = getProfile(data.profiles, (step as any).registered_by_user_id);
    }
  }

  let senderSigDataUrl: string | null = null;
  if (data.fromProfile?.signature_image_url) {
    senderSigDataUrl = await getSignedImageDataUrl(data.fromProfile.signature_image_url);
  }

  return { sigDataUrls, registeredByProfiles, senderSigDataUrl };
}

export async function generateMemoPdf(data: MemoData, prefs?: Partial<PrintPreferences>, pdfLayout?: PdfLayout | null): Promise<void> {
  const preferences = { ...DEFAULT_PRINT_PREFERENCES, ...prefs };
  const prepared = await prepareMemoData(data);
  const html = buildMemoHtml(data, prepared, preferences, pdfLayout);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Popup blocked. Please allow popups for this site.');
  }
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
  setTimeout(() => {
    printWindow.print();
  }, 2000);
}
