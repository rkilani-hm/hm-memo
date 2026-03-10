import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type Department = Tables<'departments'>;

export const fetchProfiles = async (): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return data || [];
};

export const fetchDepartments = async (): Promise<Department[]> => {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('name');
  if (error) throw error;
  return data || [];
};

export const getNextTransmittalNo = async (deptId: string): Promise<string> => {
  const { data, error } = await supabase.rpc('get_next_transmittal_no', { dept_id: deptId });
  if (error) throw error;
  return data;
};

export const uploadAttachment = async (
  memoId: string,
  file: File,
  userId: string
): Promise<{ fileUrl: string; fileName: string }> => {
  const filePath = `${memoId}/${crypto.randomUUID()}-${file.name}`;
  
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(filePath, file);
  if (uploadError) throw uploadError;

  // Store the storage path, not a public/signed URL
  const { error: insertError } = await supabase
    .from('memo_attachments')
    .insert({
      memo_id: memoId,
      file_name: file.name,
      file_url: filePath,
      file_size: file.size,
      file_type: file.type,
      uploaded_by: userId,
    });
  if (insertError) throw insertError;

  return { fileUrl: filePath, fileName: file.name };
};

/** Generate a signed URL for an attachment stored in the private bucket */
export const getAttachmentSignedUrl = async (fileUrl: string): Promise<string> => {
  // Extract path if it's a full URL, otherwise use as-is
  let path = fileUrl;
  const bucketPrefix = '/storage/v1/object/public/attachments/';
  const idx = path.indexOf(bucketPrefix);
  if (idx !== -1) {
    path = path.substring(idx + bucketPrefix.length);
  }

  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, 3600);

  if (error) throw error;
  return data.signedUrl;
};
