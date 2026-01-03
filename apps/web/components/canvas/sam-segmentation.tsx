/**
 * SAM Segmentation Component - Optimized
 *
 * Uses Segment Anything Model (SlimSAM) for intelligent click-to-select
 * background removal. User clicks on points to indicate what to keep/remove.
 */

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Loader2,
  MousePointer2,
  Eraser,
  Check,
  RotateCcw,
  Trash2,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";

// Lazy load transformers.js to avoid SSR issues
let SamModel: any = null;
let AutoProcessor: any = null;
let RawImage: any = null;
let modelLoadPromise: Promise<void> | null = null;

// Cache for loaded model
let cachedModel: any = null;
let cachedProcessor: any = null;

interface Point {
  x: number;
  y: number;
  label: 1 | 0; // 1 = foreground (keep), 0 = background (remove)
}

interface SamSegmentationProps {
  imageSrc: string;
  onComplete: (resultDataUrl: string) => void;
  onClose: () => void;
}

export function SamSegmentation({
  imageSrc,
  onComplete,
  onClose,
}: SamSegmentationProps) {
  const [isLoadingModel, setIsLoadingModel] = useState(!cachedModel);
  const [isProcessing, setIsProcessing] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(!!cachedModel);
  const [points, setPoints] = useState<Point[]>([]);
  const [maskData, setMaskData] = useState<ImageData | null>(null);
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [loadProgress, setLoadProgress] = useState(cachedModel ? 100 : 0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const segmentationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Image dimensions
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Load model (with caching)
  useEffect(() => {
    if (cachedModel && cachedProcessor) {
      setModelLoaded(true);
      setIsLoadingModel(false);
      return;
    }

    const loadModel = async () => {
      // Prevent duplicate loading
      if (modelLoadPromise) {
        await modelLoadPromise;
        setModelLoaded(true);
        setIsLoadingModel(false);
        return;
      }

      modelLoadPromise = (async () => {
        try {
          setLoadProgress(10);

          const transformers = await import("@huggingface/transformers");
          SamModel = transformers.SamModel;
          AutoProcessor = transformers.AutoProcessor;
          RawImage = transformers.RawImage;

          setLoadProgress(30);

          const modelId = "Xenova/slimsam-77-uniform";

          const [model, processor] = await Promise.all([
            SamModel.from_pretrained(modelId, {
              progress_callback: (progress: any) => {
                if (progress.progress) {
                  setLoadProgress(30 + Math.floor(progress.progress * 0.6));
                }
              },
            }),
            AutoProcessor.from_pretrained(modelId),
          ]);

          cachedModel = model;
          cachedProcessor = processor;

          setLoadProgress(100);
          setModelLoaded(true);
          toast.success("SAM model ready!");
        } catch (error) {
          console.error("Failed to load SAM model:", error);
          toast.error("Failed to load SAM model");
          modelLoadPromise = null;
        } finally {
          setIsLoadingModel(false);
        }
      })();

      await modelLoadPromise;
    };

    loadModel();
  }, []);

  // Load image immediately
  useEffect(() => {
    const img = new window.Image();

    const handleLoad = () => {
      imageRef.current = img;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });

      // Calculate display size
      const maxWidth = 600;
      const maxHeight = 500;
      const scale = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);

      setDisplaySize({
        width: Math.round(img.naturalWidth * scale),
        height: Math.round(img.naturalHeight * scale),
      });
      setImageLoaded(true);
    };

    img.onload = handleLoad;
    img.onerror = () => {
      // Retry without crossOrigin
      const retryImg = new window.Image();
      retryImg.onload = () => {
        imageRef.current = retryImg;
        handleLoad.call(retryImg);
      };
      retryImg.src = imageSrc;
    };

    if (!imageSrc.startsWith("data:") && !imageSrc.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.src = imageSrc;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageSrc]);

  // Draw base image on canvas when loaded
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;

    if (!canvas || !img || !imageLoaded || displaySize.width === 0) return;

    canvas.width = displaySize.width;
    canvas.height = displaySize.height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, displaySize.width, displaySize.height);
  }, [imageLoaded, displaySize]);

  // Draw overlay (mask + points) on separate canvas for performance
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || displaySize.width === 0) return;

    canvas.width = displaySize.width;
    canvas.height = displaySize.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, displaySize.width, displaySize.height);

    // Draw mask overlay
    if (maskData) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = imageSize.width;
      tempCanvas.height = imageSize.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.putImageData(maskData, 0, 0);
        ctx.globalAlpha = 0.4;
        ctx.drawImage(tempCanvas, 0, 0, displaySize.width, displaySize.height);
        ctx.globalAlpha = 1.0;
      }
    }

    // Draw points
    const scaleX = displaySize.width / imageSize.width;
    const scaleY = displaySize.height / imageSize.height;

    points.forEach((point) => {
      const x = point.x * scaleX;
      const y = point.y * scaleY;

      // Outer glow
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = point.label === 1 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";
      ctx.fill();

      // Main circle
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = point.label === 1 ? "#22c55e" : "#ef4444";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icon
      ctx.fillStyle = "white";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(point.label === 1 ? "+" : "-", x, y);
    });
  }, [points, maskData, displaySize, imageSize]);

  // Handle canvas click - immediate point addition
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!imageLoaded) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert to image coordinates
      const scaleX = imageSize.width / displaySize.width;
      const scaleY = imageSize.height / displaySize.height;

      const newPoint: Point = {
        x: Math.round(clickX * scaleX),
        y: Math.round(clickY * scaleY),
        label: mode === "add" ? 1 : 0,
      };

      setPoints((prev) => [...prev, newPoint]);
    },
    [imageLoaded, displaySize, imageSize, mode]
  );

  // Run segmentation when points change (debounced)
  useEffect(() => {
    if (points.length === 0 || !modelLoaded || !cachedModel || !cachedProcessor) {
      setMaskData(null);
      return;
    }

    // Clear previous timeout
    if (segmentationTimeoutRef.current) {
      clearTimeout(segmentationTimeoutRef.current);
    }

    segmentationTimeoutRef.current = setTimeout(async () => {
      setIsProcessing(true);

      try {
        const rawImage = await RawImage.read(imageSrc);

        const inputPoints = [points.map((p) => [p.x, p.y])];
        const inputLabels = [points.map((p) => p.label)];

        const inputs = await cachedProcessor(rawImage, {
          input_points: inputPoints,
          input_labels: inputLabels,
        });

        const outputs = await cachedModel(inputs);

        const masks = await cachedProcessor.post_process_masks(
          outputs.pred_masks,
          inputs.original_sizes,
          inputs.reshaped_input_sizes
        );

        const maskTensor = masks[0][0][0];

        // Create mask ImageData
        const imageData = new ImageData(imageSize.width, imageSize.height);

        for (let i = 0; i < maskTensor.data.length; i++) {
          const val = maskTensor.data[i] > 0 ? 255 : 0;
          imageData.data[i * 4] = 0;
          imageData.data[i * 4 + 1] = val; // Green
          imageData.data[i * 4 + 2] = 0;
          imageData.data[i * 4 + 3] = val > 0 ? 200 : 0;
        }

        setMaskData(imageData);
      } catch (error) {
        console.error("Segmentation error:", error);
      } finally {
        setIsProcessing(false);
      }
    }, 150); // Short debounce for responsiveness

    return () => {
      if (segmentationTimeoutRef.current) {
        clearTimeout(segmentationTimeoutRef.current);
      }
    };
  }, [points, modelLoaded, imageSrc, imageSize]);

  // Apply mask to create result
  const applyMask = useCallback(() => {
    if (!maskData || !imageRef.current) return;

    setIsProcessing(true);

    // Use requestAnimationFrame for smooth UI
    requestAnimationFrame(() => {
      try {
        const img = imageRef.current!;

        const resultCanvas = document.createElement("canvas");
        resultCanvas.width = imageSize.width;
        resultCanvas.height = imageSize.height;
        const ctx = resultCanvas.getContext("2d");

        if (!ctx) return;

        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, imageSize.width, imageSize.height);

        // Apply mask
        for (let i = 0; i < maskData.data.length / 4; i++) {
          if (maskData.data[i * 4 + 3] === 0) {
            imageData.data[i * 4 + 3] = 0; // Make transparent
          }
        }

        ctx.putImageData(imageData, 0, 0);
        setResultDataUrl(resultCanvas.toDataURL("image/png"));
      } catch (error) {
        console.error("Apply mask error:", error);
        toast.error("Failed to apply mask");
      } finally {
        setIsProcessing(false);
      }
    });
  }, [maskData, imageSize]);

  const clearPoints = () => {
    setPoints([]);
    setMaskData(null);
    setResultDataUrl(null);
  };

  const removeLastPoint = () => {
    setPoints((prev) => prev.slice(0, -1));
    setResultDataUrl(null);
  };

  const handleConfirm = () => {
    if (resultDataUrl) {
      onComplete(resultDataUrl);
      onClose();
    }
  };

  // Show image immediately, even while model loads
  const showCanvas = imageLoaded && displaySize.width > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[700px] max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-2">
            <MousePointer2 className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Smart Background Removal</h3>
            {isLoadingModel && (
              <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                Loading model...
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Instructions */}
          <div className="mb-3 p-2.5 bg-gray-50 rounded-lg text-sm text-gray-600">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <li>
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 bg-green-500 rounded-full inline-flex items-center justify-center text-white text-[10px]">+</span>
                  Click to <strong>keep</strong>
                </span>
              </li>
              <li>
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 bg-red-500 rounded-full inline-flex items-center justify-center text-white text-[10px]">-</span>
                  Click to <strong>remove</strong>
                </span>
              </li>
              <li>Green overlay = areas to keep</li>
            </ul>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setMode("add")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === "add"
                    ? "bg-green-500 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Plus className="w-4 h-4" />
                Keep
              </button>
              <button
                onClick={() => setMode("remove")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === "remove"
                    ? "bg-red-500 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Minus className="w-4 h-4" />
                Remove
              </button>
            </div>

            <div className="flex-1" />

            <button
              onClick={removeLastPoint}
              disabled={points.length === 0}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors"
              title="Undo last point"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={clearPoints}
              disabled={points.length === 0}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-30 transition-colors"
              title="Clear all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Canvas area */}
          <div
            className="relative flex items-center justify-center bg-[#f0f0f0] rounded-xl overflow-hidden"
            style={{
              minHeight: "400px",
              backgroundImage:
                "linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
            }}
          >
            {!showCanvas && (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <span className="text-sm text-gray-500">Loading image...</span>
              </div>
            )}

            {showCanvas && !resultDataUrl && (
              <div
                onClick={!isLoadingModel ? handleCanvasClick : undefined}
                className={`relative ${isLoadingModel ? "cursor-wait" : "cursor-crosshair"}`}
                style={{ width: displaySize.width, height: displaySize.height }}
              >
                {/* Base image canvas */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0"
                  style={{ width: displaySize.width, height: displaySize.height }}
                />
                {/* Overlay canvas (mask + points) */}
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute inset-0 pointer-events-none"
                  style={{ width: displaySize.width, height: displaySize.height }}
                />

                {/* Model loading overlay */}
                {isLoadingModel && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 rounded-lg">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
                    <p className="text-sm text-gray-600">Loading AI model...</p>
                    <div className="w-32 h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${loadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Processing indicator */}
                {isProcessing && !isLoadingModel && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-white/90 px-2 py-1 rounded-full shadow-sm">
                    <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                    <span className="text-xs text-gray-600">Processing...</span>
                  </div>
                )}
              </div>
            )}

            {resultDataUrl && (
              <img
                src={resultDataUrl}
                alt="Result"
                style={{ maxWidth: displaySize.width, maxHeight: displaySize.height }}
                className="object-contain"
              />
            )}
          </div>

          {/* Point count */}
          <div className="mt-2 text-xs text-gray-500 text-center">
            {points.length === 0 ? (
              <span>{isLoadingModel ? "Model loading... You can start clicking once ready" : "Click on the image to select areas"}</span>
            ) : (
              <span>
                {points.length} point{points.length !== 1 ? "s" : ""} •{" "}
                <span className="text-green-600">{points.filter((p) => p.label === 1).length} keep</span> •{" "}
                <span className="text-red-600">{points.filter((p) => p.label === 0).length} remove</span>
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>

          {!resultDataUrl ? (
            <button
              onClick={applyMask}
              disabled={!maskData || isProcessing || isLoadingModel}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Eraser className="w-4 h-4" />
              Remove Background
            </button>
          ) : (
            <>
              <button
                onClick={() => setResultDataUrl(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Edit More
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />
                Apply
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
