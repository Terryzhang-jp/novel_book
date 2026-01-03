'use client';

/**
 * ImageCropper - Image cropping modal
 *
 * Allows users to crop images with:
 * - Free form cropping
 * - Aspect ratio presets
 * - Preview of result
 */

import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check, RotateCcw, Square, RectangleHorizontal, RectangleVertical, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageCropperProps {
  imageSrc: string;
  onComplete: (croppedImageDataUrl: string) => void;
  onClose: () => void;
}

type AspectRatioPreset = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

const ASPECT_PRESETS: { id: AspectRatioPreset; label: string; icon: React.ReactNode; ratio?: number }[] = [
  { id: 'free', label: 'Free', icon: <Maximize2 className="w-4 h-4" /> },
  { id: '1:1', label: '1:1', icon: <Square className="w-4 h-4" />, ratio: 1 },
  { id: '4:3', label: '4:3', icon: <RectangleHorizontal className="w-4 h-4" />, ratio: 4 / 3 },
  { id: '3:4', label: '3:4', icon: <RectangleVertical className="w-4 h-4" />, ratio: 3 / 4 },
  { id: '16:9', label: '16:9', icon: <RectangleHorizontal className="w-4 h-4" />, ratio: 16 / 9 },
  { id: '9:16', label: '9:16', icon: <RectangleVertical className="w-4 h-4" />, ratio: 9 / 16 },
];

function getCroppedImg(
  image: HTMLImageElement,
  crop: PixelCrop
): string {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = crop.width * scaleX;
  canvas.height = crop.height * scaleY;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No 2d context');
  }

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL('image/png');
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export function ImageCropper({ imageSrc, onComplete, onClose }: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspectPreset, setAspectPreset] = useState<AspectRatioPreset>('free');
  const [imageLoaded, setImageLoaded] = useState(false);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setImageLoaded(true);
    // Set initial crop to center 80% of image
    setCrop({
      unit: '%',
      x: 10,
      y: 10,
      width: 80,
      height: 80,
    });
  }, []);

  const handleAspectChange = useCallback((preset: AspectRatioPreset) => {
    setAspectPreset(preset);
    if (imgRef.current && preset !== 'free') {
      const presetConfig = ASPECT_PRESETS.find(p => p.id === preset);
      if (presetConfig?.ratio) {
        const { width, height } = imgRef.current;
        setCrop(centerAspectCrop(width, height, presetConfig.ratio));
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    setCrop({
      unit: '%',
      x: 10,
      y: 10,
      width: 80,
      height: 80,
    });
    setAspectPreset('free');
  }, []);

  const handleApply = useCallback(() => {
    if (!imgRef.current || !completedCrop) {
      console.error('Cannot crop: missing image ref or crop data');
      return;
    }

    try {
      const croppedDataUrl = getCroppedImg(imgRef.current, completedCrop);
      onComplete(croppedDataUrl);
      onClose();
    } catch (error) {
      console.error('Crop error:', error);
    }
  }, [completedCrop, onComplete, onClose]);

  const aspect = aspectPreset === 'free'
    ? undefined
    : ASPECT_PRESETS.find(p => p.id === aspectPreset)?.ratio;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      {/* Modal */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Crop Image</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* Aspect Ratio Presets */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
          {ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleAspectChange(preset.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                aspectPreset === preset.id
                  ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              )}
            >
              {preset.icon}
              <span>{preset.label}</span>
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset</span>
          </button>
        </div>

        {/* Crop Area */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800/50">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
            className="max-h-[60vh]"
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              onLoad={onImageLoad}
              crossOrigin="anonymous"
              style={{ maxHeight: '60vh', maxWidth: '100%' }}
            />
          </ReactCrop>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!completedCrop}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Apply Crop</span>
          </button>
        </div>
      </div>
    </div>
  );
}
