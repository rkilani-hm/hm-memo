import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SignedImageProps {
  storagePath: string | null | undefined;
  bucket?: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Renders an image from a private Supabase storage bucket using signed URLs.
 * Accepts either a full public URL (extracts path) or a storage path.
 */
const SignedImage = ({ storagePath, bucket = 'signatures', alt = '', className, fallback }: SignedImageProps) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) return;

    const getSignedUrl = async () => {
      // Extract the storage path from a full URL if needed
      let path = storagePath;
      const bucketPrefix = `/storage/v1/object/public/${bucket}/`;
      const idx = path.indexOf(bucketPrefix);
      if (idx !== -1) {
        path = path.substring(idx + bucketPrefix.length);
      }
      // Also handle signed URL paths
      const signedPrefix = `/storage/v1/object/sign/${bucket}/`;
      const sidx = path.indexOf(signedPrefix);
      if (sidx !== -1) {
        path = path.substring(sidx + signedPrefix.length).split('?')[0];
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600);

      if (!error && data?.signedUrl) {
        setSignedUrl(data.signedUrl);
      }
    };

    getSignedUrl();
  }, [storagePath, bucket]);

  if (!storagePath) return <>{fallback}</> || null;
  if (!signedUrl) return <div className={className} />;

  return <img src={signedUrl} alt={alt} className={className} />;
};

export default SignedImage;
