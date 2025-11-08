/**
 * 批量下载工具
 */

import { saveAs } from 'file-saver';
import JSZip from 'jszip';

/**
 * 下载单个文件
 */
export function downloadFile(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}

/**
 * 批量下载为ZIP
 */
export async function downloadAsZip(
  files: Array<{ blob: Blob; filename: string }>,
  zipFilename: string = 'posters.zip'
): Promise<void> {
  const zip = new JSZip();

  // 添加所有文件到ZIP
  files.forEach(({ blob, filename }) => {
    zip.file(filename, blob);
  });

  // 生成ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  // 下载ZIP
  saveAs(zipBlob, zipFilename);
}

/**
 * 生成文件名
 */
export function generateFilename(
  templateName: string,
  title?: string,
  ext: string = 'png'
): string {
  const timestamp = new Date().getTime();
  const titleStr = title ? `-${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')}` : '';
  return `poster-${templateName}${titleStr}-${timestamp}.${ext}`;
}
