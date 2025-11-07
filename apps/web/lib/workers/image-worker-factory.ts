/**
 * Web Worker Factory for Image Processing
 * 使用Blob创建内联Worker，避免文件路径问题
 */

/**
 * Worker消息类型
 */
export interface WorkerMessage {
  type: 'process';
  imageData: ImageData;
  adjustments: any;
}

export interface WorkerResponse {
  type: 'result' | 'error';
  imageData?: ImageData;
  error?: string;
}

/**
 * 创建图像处理Worker
 */
export function createImageWorker(): Worker | null {
  // 检查Worker支持
  if (typeof Worker === 'undefined') {
    console.warn('Web Workers not supported in this environment');
    return null;
  }

  try {
    // Worker代码字符串
    const workerCode = `
      // Import image adjustment functions
      // 注意：Worker中无法使用ES6 import，需要使用importScripts或内联代码

      // 内联所有图像处理函数
      function applyExposure(imageData, value) {
        if (value === 0) return;
        const factor = Math.pow(2, value / 25);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * factor);
          data[i + 1] = Math.min(255, data[i + 1] * factor);
          data[i + 2] = Math.min(255, data[i + 2] * factor);
        }
      }

      function applyBrightness(imageData, value) {
        if (value === 0) return;
        const adjustment = (value / 100) * 255;
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] += adjustment;
          data[i + 1] += adjustment;
          data[i + 2] += adjustment;
        }
      }

      function applyContrast(imageData, value) {
        if (value === 0) return;
        const factor = (259 * (value + 255)) / (255 * (259 - value));
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = factor * (data[i] - 128) + 128;
          data[i + 1] = factor * (data[i + 1] - 128) + 128;
          data[i + 2] = factor * (data[i + 2] - 128) + 128;
        }
      }

      function applyHighlightsShadows(imageData, highlights, shadows) {
        if (highlights === 0 && shadows === 0) return;
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

          if (highlights !== 0 && luminance > 128) {
            const highlightFactor = ((luminance - 128) / 127) * (highlights / 100);
            data[i] += r * highlightFactor;
            data[i + 1] += g * highlightFactor;
            data[i + 2] += b * highlightFactor;
          }

          if (shadows !== 0 && luminance < 128) {
            const shadowFactor = ((128 - luminance) / 128) * (shadows / 100);
            data[i] += (255 - r) * shadowFactor;
            data[i + 1] += (255 - g) * shadowFactor;
            data[i + 2] += (255 - b) * shadowFactor;
          }
        }
      }

      function applyWhitesBlacks(imageData, whites, blacks) {
        if (whites === 0 && blacks === 0) return;
        const data = imageData.data;
        const whitesFactor = whites / 100;
        const blacksFactor = blacks / 100;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

          if (whites !== 0 && luminance > 200) {
            const factor = ((luminance - 200) / 55) * whitesFactor;
            data[i] += (255 - r) * factor;
            data[i + 1] += (255 - g) * factor;
            data[i + 2] += (255 - b) * factor;
          }

          if (blacks !== 0 && luminance < 55) {
            const factor = ((55 - luminance) / 55) * (blacksFactor / 2);
            data[i] = Math.max(0, r + r * factor);
            data[i + 1] = Math.max(0, g + g * factor);
            data[i + 2] = Math.max(0, b + b * factor);
          }
        }
      }

      function applyTemperature(imageData, value) {
        if (value === 0) return;
        const data = imageData.data;
        const warmth = value / 100;
        for (let i = 0; i < data.length; i += 4) {
          if (warmth > 0) {
            data[i] += warmth * 50;
            data[i + 2] -= warmth * 50;
          } else {
            data[i] += warmth * 50;
            data[i + 2] -= warmth * 50;
          }
        }
      }

      function applyTint(imageData, value) {
        if (value === 0) return;
        const data = imageData.data;
        const tint = value / 100;
        for (let i = 0; i < data.length; i += 4) {
          if (tint > 0) {
            data[i] += tint * 30;
            data[i + 2] += tint * 30;
            data[i + 1] -= tint * 30;
          } else {
            data[i] += tint * 30;
            data[i + 1] -= tint * 30;
            data[i + 2] += tint * 30;
          }
        }
      }

      function applySaturation(imageData, value) {
        if (value === 0) return;
        const data = imageData.data;
        const factor = 1 + value / 100;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          data[i] = gray + factor * (r - gray);
          data[i + 1] = gray + factor * (g - gray);
          data[i + 2] = gray + factor * (b - gray);
        }
      }

      function applyVibrance(imageData, value) {
        if (value === 0) return;
        const data = imageData.data;
        const factor = value / 100;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const avg = (r + g + b) / 3;
          const saturation = max > 0 ? 1 - (3 * avg - max - avg) / (2 * max) : 0;
          const adjustment = factor * (1 - saturation) * 50;
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          data[i] += (r - gray) * adjustment;
          data[i + 1] += (g - gray) * adjustment;
          data[i + 2] += (b - gray) * adjustment;
        }
      }

      function applyClarity(imageData, value) {
        if (value === 0) return;
        const data = imageData.data;
        const factor = value / 100;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luminance > 50 && luminance < 205) {
            const contrastFactor = 1 + factor * 0.5;
            data[i] = 128 + (r - 128) * contrastFactor;
            data[i + 1] = 128 + (g - 128) * contrastFactor;
            data[i + 2] = 128 + (b - 128) * contrastFactor;
          }
        }
      }

      function applySharpness(imageData, value) {
        if (value === 0) return;
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const factor = value / 100;
        const kernel = [
          0, -factor, 0,
          -factor, 1 + 4 * factor, -factor,
          0, -factor, 0
        ];
        const tempData = new Uint8ClampedArray(data);
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            for (let c = 0; c < 3; c++) {
              let sum = 0;
              let i = 0;
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                  sum += tempData[idx] * kernel[i++];
                }
              }
              const idx = (y * width + x) * 4 + c;
              data[idx] = Math.max(0, Math.min(255, sum));
            }
          }
        }
      }

      // 主处理函数
      function applyAllAdjustments(imageData, adjustments) {
        applyExposure(imageData, adjustments.exposure || 0);
        applyBrightness(imageData, adjustments.brightness || 0);
        applyContrast(imageData, adjustments.contrast || 0);
        applyHighlightsShadows(imageData, adjustments.highlights || 0, adjustments.shadows || 0);
        applyWhitesBlacks(imageData, adjustments.whites || 0, adjustments.blacks || 0);
        applyTemperature(imageData, adjustments.temperature || 0);
        applyTint(imageData, adjustments.tint || 0);
        applySaturation(imageData, adjustments.saturation || 0);
        applyVibrance(imageData, adjustments.vibrance || 0);
        applyClarity(imageData, adjustments.clarity || 0);
        applySharpness(imageData, adjustments.sharpness || 0);
      }

      // Worker消息处理
      self.onmessage = function(e) {
        const { type, imageData, adjustments } = e.data;

        if (type === 'process') {
          try {
            console.log('[Worker] Processing image:', {
              size: imageData.width + 'x' + imageData.height,
              adjustments
            });

            // 应用所有调整
            applyAllAdjustments(imageData, adjustments);

            // 返回处理后的图像
            self.postMessage({
              type: 'result',
              imageData: imageData
            }, [imageData.data.buffer]); // Transferable object for better performance

            console.log('[Worker] Processing complete');
          } catch (error) {
            console.error('[Worker] Processing error:', error);
            self.postMessage({
              type: 'error',
              error: error.message || 'Unknown error'
            });
          }
        }
      };

      console.log('[Worker] Image processing worker initialized');
    `;

    // 创建Blob
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    // 创建Worker
    const worker = new Worker(workerUrl);

    // 清理URL（Worker创建后可以立即清理）
    URL.revokeObjectURL(workerUrl);

    console.log('Image processing worker created successfully');
    return worker;
  } catch (error) {
    console.error('Failed to create image processing worker:', error);
    return null;
  }
}
