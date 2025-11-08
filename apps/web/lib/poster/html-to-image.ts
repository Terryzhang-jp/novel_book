/**
 * HTML转图片工具 - html2canvas封装
 */

import html2canvas from 'html2canvas';
import type { ExportOptions } from './types';

/**
 * 将DOM元素转换为Canvas
 */
export async function elementToCanvas(
  element: HTMLElement,
  options?: Partial<ExportOptions>
): Promise<HTMLCanvasElement> {
  const scale = options?.scale || 2; // 默认2x分辨率，提高清晰度

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true, // 允许跨域图片
    allowTaint: false,
    backgroundColor: null, // 透明背景
    logging: false,
    imageTimeout: 15000,
    onclone: (clonedDoc) => {
      // 确保克隆的文档中的图片已加载
      const clonedElement = clonedDoc.getElementById(element.id);
      if (clonedElement) {
        clonedElement.style.display = 'block';
      }
    },
  });

  return canvas;
}

/**
 * 将Canvas转换为Blob
 */
export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  options?: Partial<ExportOptions>
): Promise<Blob> {
  const format = options?.format || 'png';
  const quality = options?.quality || 0.95;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      format === 'jpg' ? 'image/jpeg' : 'image/png',
      quality
    );
  });
}

/**
 * 将DOM元素直接转换为Blob（一步到位）
 */
export async function elementToBlob(
  element: HTMLElement,
  options?: Partial<ExportOptions>
): Promise<Blob> {
  const canvas = await elementToCanvas(element, options);
  return canvasToBlob(canvas, options);
}

/**
 * 将DOM元素转换为DataURL
 */
export async function elementToDataURL(
  element: HTMLElement,
  options?: Partial<ExportOptions>
): Promise<string> {
  const canvas = await elementToCanvas(element, options);
  const format = options?.format || 'png';
  const quality = options?.quality || 0.95;

  return canvas.toDataURL(
    format === 'jpg' ? 'image/jpeg' : 'image/png',
    quality
  );
}
