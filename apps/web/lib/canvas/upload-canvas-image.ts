/**
 * Canvas Image Upload Utility
 *
 * 客户端即时上传图片工具
 * 在用户添加图片时立即上传到 Supabase Storage，只存储 URL 在 state 中
 * 解决保存时 payload 过大的问题
 */

/**
 * 压缩图片
 * @param dataUrl - base64 data URL
 * @param maxWidth - 最大宽度（默认 2048px）
 * @param quality - JPEG 质量（默认 0.85）
 */
export function compressImage(
  dataUrl: string,
  maxWidth = 2048,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        // 计算缩放比例
        const ratio = Math.min(1, maxWidth / img.width);

        // 如果图片已经够小，直接返回原图
        if (ratio === 1) {
          resolve(dataUrl);
          return;
        }

        // 创建 canvas 进行压缩
        const canvas = document.createElement("canvas");
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // 绘制并压缩
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 根据原始格式决定输出格式
        // PNG 保持 PNG（透明度），其他转 JPEG
        const isPng = dataUrl.includes("image/png");
        const outputFormat = isPng ? "image/png" : "image/jpeg";
        const outputQuality = isPng ? undefined : quality;

        const compressed = canvas.toDataURL(outputFormat, outputQuality);
        resolve(compressed);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error("Failed to load image for compression"));
    };

    img.src = dataUrl;
  });
}

/**
 * 将 base64 data URL 转换为 Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(",");
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

/**
 * 上传图片到 Canvas 项目
 * 使用 FormData 而非 JSON，避免大型 base64 字符串序列化导致的栈溢出
 *
 * @param projectId - Canvas 项目 ID
 * @param imageDataUrl - base64 data URL
 * @param options - 可选配置
 * @returns Supabase Storage 公开 URL
 */
export async function uploadCanvasImage(
  projectId: string,
  imageDataUrl: string,
  options?: {
    compress?: boolean; // 是否压缩（默认 true）
    maxWidth?: number; // 最大宽度（默认 2048）
    quality?: number; // JPEG 质量（默认 0.85）
  }
): Promise<string> {
  const { compress = true, maxWidth = 2048, quality = 0.85 } = options || {};

  let dataToUpload = imageDataUrl;

  // 压缩图片（可选）
  if (compress) {
    try {
      dataToUpload = await compressImage(imageDataUrl, maxWidth, quality);
    } catch (error) {
      console.warn("Image compression failed, using original:", error);
      // 压缩失败时使用原图
    }
  }

  // 转换为 Blob 并使用 FormData 上传
  // 这避免了 JSON.stringify 对大型 base64 字符串的栈溢出问题
  const blob = dataUrlToBlob(dataToUpload);
  const formData = new FormData();
  formData.append("projectId", projectId);
  formData.append("image", blob, `image-${Date.now()}.${blob.type.split("/")[1] || "png"}`);

  const response = await fetch("/api/canvas/upload-image", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to upload image: ${response.status}`);
  }

  const { url } = await response.json();
  return url;
}

/**
 * 获取图片尺寸
 * @param imageUrl - 图片 URL 或 data URL
 * @returns 宽高信息
 */
export function getImageDimensions(
  imageUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    img.src = imageUrl;
  });
}

/**
 * 计算适配尺寸（保持宽高比）
 * @param originalWidth - 原始宽度
 * @param originalHeight - 原始高度
 * @param maxWidth - 最大宽度
 * @param maxHeight - 最大高度（可选）
 * @returns 适配后的宽高
 */
export function calculateFitDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight?: number
): { width: number; height: number } {
  let ratio = Math.min(1, maxWidth / originalWidth);

  if (maxHeight) {
    ratio = Math.min(ratio, maxHeight / originalHeight);
  }

  return {
    width: originalWidth * ratio,
    height: originalHeight * ratio,
  };
}
