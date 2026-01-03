'use client';

/**
 * MagazinePage - 单页渲染组件（预览模式）
 *
 * 使用 Konva 渲染页面内容的缩略预览
 * 点击进入编辑模式
 */

import { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage } from 'react-konva';
import type { MagazinePage as MagazinePageType } from '@/types/storage';
import { A4_CONFIG } from '@/types/storage';
import { cn } from '@/lib/utils';
import useImage from 'use-image';

interface MagazinePageProps {
  page: MagazinePageType;
  pageIndex: number;
  position: 'left' | 'right' | 'center';
  onClick: () => void;
}

// 预览和编辑尺寸的缩放比例
const PREVIEW_SCALE = A4_CONFIG.PREVIEW_WIDTH / A4_CONFIG.EDIT_WIDTH;

export function MagazinePage({ page, pageIndex, position, onClick }: MagazinePageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={cn(
        'relative bg-white rounded-sm overflow-hidden cursor-pointer transition-all duration-200',
        'shadow-lg hover:shadow-xl hover:scale-[1.02]',
        'border border-border/50'
      )}
      style={{
        width: A4_CONFIG.PREVIEW_WIDTH,
        height: A4_CONFIG.PREVIEW_HEIGHT,
      }}
    >
      {/* Page Number Badge */}
      <div
        className={cn(
          'absolute top-2 z-10 px-2 py-0.5 bg-background/80 backdrop-blur-sm rounded text-xs text-muted-foreground',
          position === 'left' ? 'right-2' : 'left-2'
        )}
      >
        {pageIndex === 0 ? 'Cover' : `Page ${pageIndex}`}
      </div>

      {/* Konva Stage for Preview */}
      <Stage
        width={A4_CONFIG.PREVIEW_WIDTH}
        height={A4_CONFIG.PREVIEW_HEIGHT}
        listening={false}
      >
        <Layer>
          {/* White Background */}
          <Rect
            x={0}
            y={0}
            width={A4_CONFIG.PREVIEW_WIDTH}
            height={A4_CONFIG.PREVIEW_HEIGHT}
            fill="white"
          />

          {/* Render Elements */}
          {page.elements.map((element) => {
            const scaledX = element.x * PREVIEW_SCALE;
            const scaledY = element.y * PREVIEW_SCALE;
            const scaledWidth = (element.width || 100) * PREVIEW_SCALE;
            const scaledHeight = (element.height || 50) * PREVIEW_SCALE;

            if (element.type === 'text' || element.type === 'sticker') {
              return (
                <Text
                  key={element.id}
                  x={scaledX}
                  y={scaledY}
                  width={scaledWidth}
                  text={element.text || ''}
                  fontSize={(element.fontSize || 16) * PREVIEW_SCALE}
                  fontFamily={element.fontFamily || 'Arial'}
                  fill={element.fill || '#000000'}
                  opacity={element.opacity ?? 1}
                  rotation={element.rotation || 0}
                />
              );
            }

            if (element.type === 'image' && element.src) {
              return (
                <PreviewImage
                  key={element.id}
                  src={element.src}
                  x={scaledX}
                  y={scaledY}
                  width={scaledWidth}
                  height={scaledHeight}
                  rotation={element.rotation || 0}
                  opacity={element.opacity ?? 1}
                />
              );
            }

            return null;
          })}
        </Layer>
      </Stage>

      {/* Empty State */}
      {page.elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
          <span className="text-sm">Click to edit</span>
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-primary/5 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
        <span className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-md shadow-lg">
          Edit Page
        </span>
      </div>
    </div>
  );
}

// Helper component for loading images
function PreviewImage({
  src,
  x,
  y,
  width,
  height,
  rotation,
  opacity,
}: {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}) {
  const [image] = useImage(src, 'anonymous');

  if (!image) return null;

  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={rotation}
      opacity={opacity}
    />
  );
}
