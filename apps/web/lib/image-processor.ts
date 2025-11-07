/**
 * 专业图像调整处理类
 * 使用Canvas API实现类似Lightroom的调整功能
 * 支持Web Worker异步处理（可选）
 */

import { applyAllAdjustments } from './image-adjustments';
import { createImageWorker, type WorkerMessage, type WorkerResponse } from './workers/image-worker-factory';

export interface ImageAdjustments {
  // 光线调整
  brightness: number;      // -100 to 100
  contrast: number;        // -100 to 100
  exposure: number;        // -100 to 100
  highlights: number;      // -100 to 100
  shadows: number;         // -100 to 100
  whites: number;          // -100 to 100
  blacks: number;          // -100 to 100

  // 颜色调整
  saturation: number;      // -100 to 100
  vibrance: number;        // -100 to 100
  temperature: number;     // -100 to 100
  tint: number;            // -100 to 100

  // 细节调整
  clarity: number;         // -100 to 100
  sharpness: number;       // 0 to 100
}

export class ImageProcessor {
  // 尺寸控制常量
  private readonly MAX_CANVAS_DIMENSION = 2048; // 最大边长，防止内存溢出
  private readonly MIN_CANVAS_DIMENSION = 512;  // 最小边长，保证质量

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private originalImageData: ImageData | null = null;
  private originalImageDimensions: { width: number; height: number } | null = null; // 保存原始图片尺寸

  // Web Worker支持
  private worker: Worker | null = null;
  private useWorker: boolean = false; // 默认禁用Worker，使用同步处理
  private workerInitialized: boolean = false;

  constructor(canvas: HTMLCanvasElement, options?: { useWorker?: boolean }) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('无法创建Canvas上下文');
    }
    this.ctx = context;

    // 配置Worker（仅在浏览器环境且用户启用时）
    if (options?.useWorker && typeof window !== 'undefined') {
      this.useWorker = true;
      this.initializeWorker();
    }
  }

  /**
   * 初始化Web Worker
   */
  private initializeWorker(): void {
    try {
      this.worker = createImageWorker();
      if (this.worker) {
        this.workerInitialized = true;
        console.log('Image processing worker initialized');
      } else {
        console.warn('Worker creation failed, falling back to synchronous processing');
        this.useWorker = false;
      }
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      this.useWorker = false;
    }
  }

  /**
   * 加载图片到Canvas
   */
  async loadImage(imageUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          // 保存原始图片尺寸
          this.originalImageDimensions = {
            width: img.width,
            height: img.height
          };

          // 计算Canvas的最优尺寸（防止内存溢出）
          const maxDimension = Math.max(img.width, img.height);
          let targetWidth = img.width;
          let targetHeight = img.height;

          if (maxDimension > this.MAX_CANVAS_DIMENSION) {
            // 需要缩小 - 按比例缩放，保持长宽比
            const scale = this.MAX_CANVAS_DIMENSION / maxDimension;
            targetWidth = Math.floor(img.width * scale);
            targetHeight = Math.floor(img.height * scale);

            console.log('Image downscaled:', {
              original: `${img.width}x${img.height}`,
              target: `${targetWidth}x${targetHeight}`,
              scale: scale.toFixed(2),
              memoryReduction: `${((1 - scale * scale) * 100).toFixed(1)}%`
            });
          } else if (maxDimension < this.MIN_CANVAS_DIMENSION) {
            // 图片太小 - 放大到最小尺寸
            const scale = this.MIN_CANVAS_DIMENSION / maxDimension;
            targetWidth = Math.floor(img.width * scale);
            targetHeight = Math.floor(img.height * scale);

            console.log('Image upscaled:', {
              original: `${img.width}x${img.height}`,
              target: `${targetWidth}x${targetHeight}`,
              scale: scale.toFixed(2)
            });
          } else {
            console.log('Image size optimal:', {
              size: `${img.width}x${img.height}`,
              noScalingNeeded: true
            });
          }

          // 设置Canvas尺寸
          this.canvas.width = targetWidth;
          this.canvas.height = targetHeight;

          // 启用高质量图片缩放
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.imageSmoothingQuality = 'high';

          // 绘制图片（自动缩放）
          this.ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          // 保存图像数据
          this.originalImageData = this.ctx.getImageData(
            0,
            0,
            this.canvas.width,
            this.canvas.height
          );

          console.log('Canvas initialized:', {
            canvasSize: `${this.canvas.width}x${this.canvas.height}`,
            memoryUsage: `~${((this.canvas.width * this.canvas.height * 4) / 1024 / 1024).toFixed(1)}MB`
          });

          resolve();
        } catch (err) {
          console.error('Canvas processing error:', err);
          reject(err);
        }
      };

      img.onerror = (e) => {
        console.error('Image load error:', e);
        console.error('Failed URL:', imageUrl);
        reject(new Error('图片加载失败 - 可能是CORS或网络问题'));
      };

      console.log('Starting to load image...');
      img.src = imageUrl;
    });
  }

  /**
   * 应用所有调整（同步模式）
   */
  applyAdjustments(adjustments: Partial<ImageAdjustments>): void {
    if (!this.originalImageData) {
      throw new Error('请先加载图片');
    }

    // 从原始图像开始
    const imageData = new ImageData(
      new Uint8ClampedArray(this.originalImageData.data),
      this.originalImageData.width,
      this.originalImageData.height
    );

    // 使用纯函数应用所有调整
    applyAllAdjustments(imageData, adjustments);

    // 更新Canvas
    this.ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 应用所有调整（异步模式，使用Worker）
   */
  async applyAdjustmentsAsync(adjustments: Partial<ImageAdjustments>): Promise<void> {
    if (!this.originalImageData) {
      throw new Error('请先加载图片');
    }

    // 如果Worker可用且已初始化，使用Worker
    if (this.useWorker && this.workerInitialized && this.worker) {
      return this.applyAdjustmentsWithWorker(adjustments);
    }

    // 否则使用同步方法（降级方案）
    this.applyAdjustments(adjustments);
  }

  /**
   * 使用Worker应用调整
   */
  private applyAdjustmentsWithWorker(adjustments: Partial<ImageAdjustments>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.originalImageData) {
        reject(new Error('Worker not available'));
        return;
      }

      // 克隆原始图像数据
      const imageData = new ImageData(
        new Uint8ClampedArray(this.originalImageData.data),
        this.originalImageData.width,
        this.originalImageData.height
      );

      // 设置Worker消息监听器
      const handleMessage = (e: MessageEvent<WorkerResponse>) => {
        const { type, imageData: processedData, error } = e.data;

        if (type === 'result' && processedData) {
          // 更新Canvas
          this.ctx.putImageData(processedData, 0, 0);
          this.worker?.removeEventListener('message', handleMessage);
          resolve();
        } else if (type === 'error') {
          console.error('Worker processing error:', error);
          this.worker?.removeEventListener('message', handleMessage);
          // 降级到同步处理
          this.applyAdjustments(adjustments);
          resolve();
        }
      };

      this.worker.addEventListener('message', handleMessage);

      // 发送处理请求
      const message: WorkerMessage = {
        type: 'process',
        imageData,
        adjustments
      };

      this.worker.postMessage(message, [imageData.data.buffer]);
    });
  }

  /**
   * 清理Worker资源
   */
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerInitialized = false;
    }
  }


  /**
   * 导出为Blob
   */
  async toBlob(type: string = 'image/jpeg', quality: number = 0.92): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        type,
        quality
      );
    });
  }

  /**
   * 重置到原始图像
   */
  reset(): void {
    if (this.originalImageData) {
      this.ctx.putImageData(this.originalImageData, 0, 0);
    }
  }

  /**
   * 获取原始图片尺寸
   */
  getOriginalDimensions(): { width: number; height: number } | null {
    return this.originalImageDimensions;
  }

  /**
   * 获取Canvas尺寸（处理后的尺寸）
   */
  getCanvasDimensions(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height
    };
  }

  /**
   * 获取尺寸信息摘要
   */
  getDimensionsSummary(): {
    original: { width: number; height: number } | null;
    canvas: { width: number; height: number };
    isScaled: boolean;
    scaleFactor: number | null;
    memoryUsageMB: number;
  } {
    const canvas = this.getCanvasDimensions();
    const original = this.originalImageDimensions;

    let isScaled = false;
    let scaleFactor: number | null = null;

    if (original) {
      isScaled = original.width !== canvas.width || original.height !== canvas.height;
      if (isScaled) {
        scaleFactor = canvas.width / original.width;
      }
    }

    const memoryUsageMB = (canvas.width * canvas.height * 4) / 1024 / 1024;

    return {
      original,
      canvas,
      isScaled,
      scaleFactor,
      memoryUsageMB
    };
  }
}
