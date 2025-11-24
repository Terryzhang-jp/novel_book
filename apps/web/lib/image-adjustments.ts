/**
 * 图像调整算法模块（纯函数）
 * 可在主线程和Web Worker中使用
 */

import type { ImageAdjustments } from './image-processor';

/**
 * 应用曝光调整
 * 优化 V2：进一步降低灵敏度，最大值从 2.3x 降低到 1.8x
 */
export function applyExposure(imageData: ImageData, value: number): void {
  if (value === 0) return;

  // V1: Math.pow(2, value / 80) -> max 2.3x
  // V2: Math.pow(2, value / 120) -> max 1.78x
  // V3: Math.pow(2, value / 200) -> max 1.41x (Reduced sensitivity)
  const factor = Math.pow(2, value / 200);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * factor);     // R
    data[i + 1] = Math.min(255, data[i + 1] * factor); // G
    data[i + 2] = Math.min(255, data[i + 2] * factor); // B
  }
}

/**
 * 应用亮度调整
 * 优化 V2：进一步限制调整范围，最大值从 +/-80 降低到 +/-40
 */
export function applyBrightness(imageData: ImageData, value: number): void {
  if (value === 0) return;

  // V1: (value / 100) * 80
  // V2: (value / 100) * 40 -> 仅允许约 15% 的总亮度变化，非常细腻
  // V3: (value / 100) * 30 -> Further reduced
  const adjustment = (value / 100) * 30;
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] += adjustment;     // R
    data[i + 1] += adjustment; // G
    data[i + 2] += adjustment; // B
  }
}

/**
 * 应用对比度调整
 * 优化 V2：降低对比度调整强度，输入值减半计算
 */
export function applyContrast(imageData: ImageData, value: number): void {
  if (value === 0) return;

  // 降低输入强度，让调节更平滑
  // V3: 0.6 -> 0.4
  const effectiveValue = value * 0.4;
  const factor = (259 * (effectiveValue + 255)) / (255 * (259 - effectiveValue));
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = factor * (data[i] - 128) + 128;         // R
    data[i + 1] = factor * (data[i + 1] - 128) + 128; // G
    data[i + 2] = factor * (data[i + 2] - 128) + 128; // B
  }
}

/**
 * 应用高光和阴影调整
 * 优化 V2：强度减半
 */
export function applyHighlightsShadows(
  imageData: ImageData,
  highlights: number,
  shadows: number
): void {
  if (highlights === 0 && shadows === 0) return;

  const data = imageData.data;
  // 降低强度系数
  // V3: 0.6 -> 0.4
  const intensity = 0.4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // 计算亮度
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // 高光调整（影响亮区）
    if (highlights !== 0 && luminance > 128) {
      const highlightFactor = ((luminance - 128) / 127) * (highlights / 100) * intensity;
      data[i] += r * highlightFactor;
      data[i + 1] += g * highlightFactor;
      data[i + 2] += b * highlightFactor;
    }

    // 阴影调整（影响暗区）
    if (shadows !== 0 && luminance < 128) {
      const shadowFactor = ((128 - luminance) / 128) * (shadows / 100) * intensity;
      data[i] += (255 - r) * shadowFactor;
      data[i + 1] += (255 - g) * shadowFactor;
      data[i + 2] += (255 - b) * shadowFactor;
    }
  }
}

/**
 * 应用白色和黑色调整
 * 优化 V2：强度减半
 */
export function applyWhitesBlacks(
  imageData: ImageData,
  whites: number,
  blacks: number
): void {
  if (whites === 0 && blacks === 0) return;

  const data = imageData.data;
  // 降低强度系数
  // V3: 0.6 -> 0.4
  const intensity = 0.4;
  const whitesFactor = (whites / 100) * intensity;
  const blacksFactor = (blacks / 100) * intensity;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // 白色调整（影响最亮区域）
    if (whites !== 0 && luminance > 200) {
      const factor = ((luminance - 200) / 55) * whitesFactor;
      data[i] += (255 - r) * factor;
      data[i + 1] += (255 - g) * factor;
      data[i + 2] += (255 - b) * factor;
    }

    // 黑色调整（影响最暗区域）
    if (blacks !== 0 && luminance < 55) {
      const factor = ((55 - luminance) / 55) * (blacksFactor / 2);
      data[i] = Math.max(0, r + r * factor);
      data[i + 1] = Math.max(0, g + g * factor);
      data[i + 2] = Math.max(0, b + b * factor);
    }
  }
}

/**
 * 应用色温调整
 * 优化 V2：进一步降低灵敏度
 */
export function applyTemperature(imageData: ImageData, value: number): void {
  if (value === 0) return;

  const data = imageData.data;
  const warmth = value / 100;
  // 降低系数: 25 -> 15 -> 10
  const strength = 10;

  for (let i = 0; i < data.length; i += 4) {
    if (warmth > 0) {
      // 温暖（增加红色，减少蓝色）
      data[i] += warmth * strength;     // R
      data[i + 2] -= warmth * strength; // B
    } else {
      // 冷色（减少红色，增加蓝色）
      data[i] += warmth * strength;     // R
      data[i + 2] -= warmth * strength; // B
    }
  }
}

/**
 * 应用色调调整
 * 优化 V2：进一步降低灵敏度
 */
export function applyTint(imageData: ImageData, value: number): void {
  if (value === 0) return;

  const data = imageData.data;
  const tint = value / 100;
  // 降低系数: 15 -> 10 -> 8
  const strength = 8;

  for (let i = 0; i < data.length; i += 4) {
    if (tint > 0) {
      // 品红
      data[i] += tint * strength;       // R
      data[i + 2] += tint * strength;   // B
      data[i + 1] -= tint * strength;   // G
    } else {
      // 绿色
      data[i] += tint * strength;       // R
      data[i + 1] -= tint * strength;   // G
      data[i + 2] += tint * strength;   // B
    }
  }
}

/**
 * 应用饱和度调整
 * 优化 V2：降低饱和度调整强度
 */
export function applySaturation(imageData: ImageData, value: number): void {
  if (value === 0) return;

  const data = imageData.data;
  // 降低强度: 100% -> 60% -> 40%
  const factor = 1 + (value / 100) * 0.4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // 计算灰度值
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // 调整饱和度
    data[i] = gray + factor * (r - gray);
    data[i + 1] = gray + factor * (g - gray);
    data[i + 2] = gray + factor * (b - gray);
  }
}

/**
 * 应用自然饱和度调整（只增强低饱和度颜色）
 * 优化 V2：降低强度
 */
export function applyVibrance(imageData: ImageData, value: number): void {
  if (value === 0) return;

  const data = imageData.data;
  const factor = value / 100;
  // 降低系数: 50 -> 30 -> 20
  const strength = 20;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const saturation = max > 0 ? 1 - (3 * avg - max - avg) / (2 * max) : 0;

    // 只对低饱和度区域应用
    const adjustment = factor * (1 - saturation) * strength;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] += (r - gray) * adjustment;
    data[i + 1] += (g - gray) * adjustment;
    data[i + 2] += (b - gray) * adjustment;
  }
}

/**
 * 应用清晰度调整（中间调对比度）
 * 优化 V2：降低强度
 */
export function applyClarity(imageData: ImageData, value: number): void {
  if (value === 0) return;

  const data = imageData.data;
  const factor = value / 100;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // 只对中间调应用（避免影响高光和阴影）
    if (luminance > 50 && luminance < 205) {
      // 降低系数: 0.5 -> 0.3 -> 0.2
      const contrastFactor = 1 + factor * 0.2;
      data[i] = 128 + (r - 128) * contrastFactor;
      data[i + 1] = 128 + (g - 128) * contrastFactor;
      data[i + 2] = 128 + (b - 128) * contrastFactor;
    }
  }
}

/**
 * 应用锐化调整
 * 优化 V2：大幅降低锐化强度，避免噪点
 */
export function applySharpness(imageData: ImageData, value: number): void {
  if (value === 0) return;

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  // 降低系数: /100 -> /300 -> /500 (非常微弱的锐化)
  const factor = value / 500;

  // 锐化卷积核
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

/**
 * 应用所有调整（主函数）
 */
export function applyAllAdjustments(
  imageData: ImageData,
  adjustments: Partial<ImageAdjustments>
): void {
  // 按顺序应用调整（顺序很重要）
  applyExposure(imageData, adjustments.exposure || 0);
  applyBrightness(imageData, adjustments.brightness || 0);
  applyContrast(imageData, adjustments.contrast || 0);
  applyHighlightsShadows(
    imageData,
    adjustments.highlights || 0,
    adjustments.shadows || 0
  );
  applyWhitesBlacks(
    imageData,
    adjustments.whites || 0,
    adjustments.blacks || 0
  );
  applyTemperature(imageData, adjustments.temperature || 0);
  applyTint(imageData, adjustments.tint || 0);
  applySaturation(imageData, adjustments.saturation || 0);
  applyVibrance(imageData, adjustments.vibrance || 0);
  applyClarity(imageData, adjustments.clarity || 0);
  applySharpness(imageData, adjustments.sharpness || 0);
}
