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
      // 所有上传路径都带 uuid/时间戳，内容永不变 —— 可以长期不可变缓存。
      // 此前默认只有 1 小时，导致同一张图被反复重新下载。
      // 见 PERFORMANCE-AUDIT.md 第六组 #14。
      cacheControl: options?.cacheControl || 'public, max-age=31536000, immutable',
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
export async function deleteFile(bucket: string, path: string): Promise<any> {
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
export async function listFiles(bucket: string, path: string): Promise<any> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .list(path);

  if (error) {
    throw error;
  }

  return data;
}
