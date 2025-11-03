/**
 * Supabase Storage Helper Functions
 *
 * Utilities for uploading and managing files in Supabase Storage
 */

import { supabaseAdmin } from './admin';

/**
 * Upload a file to Supabase Storage
 *
 * @param bucket - Storage bucket name (e.g., 'photos')
 * @param path - File path within bucket (e.g., 'userId/gallery/filename.jpg')
 * @param file - File buffer or Blob
 * @param options - Upload options
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: Buffer | Blob,
  options?: {
    contentType?: string;
    cacheControl?: string;
    upsert?: boolean;
  }
) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, file, {
      contentType: options?.contentType,
      cacheControl: options?.cacheControl || '3600',
      upsert: options?.upsert || false,
    });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get public URL for a file
 *
 * @param bucket - Storage bucket name
 * @param path - File path within bucket
 */
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Delete a file from Supabase Storage
 *
 * @param bucket - Storage bucket name
 * @param path - File path within bucket
 */
export async function deleteFile(bucket: string, path: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    throw error;
  }

  return data;
}

/**
 * List files in a directory
 *
 * @param bucket - Storage bucket name
 * @param path - Directory path (e.g., 'userId/gallery')
 */
export async function listFiles(bucket: string, path: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .list(path);

  if (error) {
    throw error;
  }

  return data;
}
