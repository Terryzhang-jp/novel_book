/**
 * Photo Download Utilities
 *
 * Functions for downloading photos from the gallery:
 * - Single photo download
 * - Batch download as ZIP
 */

import JSZip from 'jszip';
import type { Photo } from '@/types/storage';

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

/**
 * Fetch a photo as ArrayBuffer from its URL
 */
async function fetchPhotoBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch photo: ${response.statusText}`);
  }
  return response.arrayBuffer();
}

/**
 * Generate a filename for download
 */
function generateDownloadFilename(photo: Photo): string {
  const originalName = photo.originalName || photo.fileName;

  // Handle legacy photos where originalName is "blob" due to compression bug
  // Use fileName as fallback but extract proper extension from MIME type
  if (originalName === 'blob' || originalName.endsWith('.blob')) {
    const mimeType = photo.metadata?.mimeType || 'image/jpeg';
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/heif': 'heif',
    };
    const extension = extMap[mimeType] || 'jpg';
    // Use timestamp from fileName as base (e.g., "1762397473014-ane65h.blob" -> "photo_1762397473014")
    const timestamp = photo.fileName.split('-')[0] || Date.now().toString();
    return `photo_${timestamp}.${extension}`;
  }

  const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  const baseName = originalName.replace(/\.[^/.]+$/, '');

  // Clean the base name (keep alphanumeric, Chinese, Japanese, underscores, hyphens)
  const cleanBaseName = baseName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff_-]/g, '_');

  return `${cleanBaseName}.${extension}`;
}

/**
 * Trigger file download using native approach
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Clean up the object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download a single photo
 */
export async function downloadPhoto(photo: Photo): Promise<void> {
  const filename = generateDownloadFilename(photo);
  const mimeType = getMimeType(filename);
  const buffer = await fetchPhotoBuffer(photo.fileUrl);
  const blob = new Blob([buffer], { type: mimeType });
  triggerDownload(blob, filename);
}

/**
 * Download multiple photos as a ZIP file
 */
export async function downloadPhotosAsZip(
  photos: Photo[],
  zipFilename: string = 'photos.zip'
): Promise<void> {
  if (photos.length === 0) {
    throw new Error('No photos to download');
  }

  const zip = new JSZip();

  // Track filenames to avoid duplicates
  const usedFilenames = new Set<string>();

  // Fetch all photos in parallel
  const downloadPromises = photos.map(async (photo) => {
    try {
      let filename = generateDownloadFilename(photo);
      const buffer = await fetchPhotoBuffer(photo.fileUrl);

      // Handle duplicate filenames by appending a number
      if (usedFilenames.has(filename)) {
        const extension = filename.split('.').pop() || 'jpg';
        const baseName = filename.replace(/\.[^/.]+$/, '');
        let counter = 1;
        while (usedFilenames.has(`${baseName}_${counter}.${extension}`)) {
          counter++;
        }
        filename = `${baseName}_${counter}.${extension}`;
      }

      usedFilenames.add(filename);
      // Convert ArrayBuffer to Uint8Array for JSZip
      return { filename, data: new Uint8Array(buffer) };
    } catch (error) {
      console.error(`Failed to fetch photo ${photo.id}:`, error);
      return null;
    }
  });

  const results = await Promise.all(downloadPromises);

  // Add successfully fetched photos to ZIP
  let addedCount = 0;
  for (const result of results) {
    if (result) {
      // Add as binary data with correct filename
      zip.file(result.filename, result.data, { binary: true });
      addedCount++;
    }
  }

  if (addedCount === 0) {
    throw new Error('Failed to download any photos');
  }

  // Generate and download ZIP
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  triggerDownload(zipBlob, zipFilename);
}

/**
 * Generate a ZIP filename with timestamp
 */
export function generateZipFilename(prefix: string = 'photos'): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}_${timestamp}.zip`;
}
