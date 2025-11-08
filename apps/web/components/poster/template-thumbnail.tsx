'use client';

/**
 * 模板缩略图组件 - 设计师优化版
 * 使用固定高度和智能裁切，确保统一的视觉效果
 */

import { useState } from 'react';
import type { PosterData, TemplateId } from '@/lib/poster/types';
import { POSTER_TEMPLATES } from '@/lib/poster/template-config';

// 导入所有模板
import { MinimalTemplate } from './templates/minimal';
import { PolaroidTemplate } from './templates/polaroid';
import { MagazineTemplate } from './templates/magazine';
import { VintageTemplate } from './templates/vintage';
import { ModernTemplate } from './templates/modern';
import { TravelDiaryTemplate } from './templates/travel-diary';
import { FilmTemplate } from './templates/film';
import { GalleryTemplate } from './templates/gallery';
import { PanoramaTemplate } from './templates/panorama';
import { StoryTemplate } from './templates/story';

interface TemplateThumbnailProps {
  templateId: TemplateId;
  data: PosterData;
}

export function TemplateThumbnail({ templateId, data }: TemplateThumbnailProps) {
  const [thumbnailId] = useState(() => `thumbnail-${templateId}-${Math.random()}`);

  const templateComponents = {
    minimal: MinimalTemplate,
    polaroid: PolaroidTemplate,
    magazine: MagazineTemplate,
    vintage: VintageTemplate,
    modern: ModernTemplate,
    'travel-diary': TravelDiaryTemplate,
    film: FilmTemplate,
    gallery: GalleryTemplate,
    panorama: PanoramaTemplate,
    story: StoryTemplate,
  };

  const TemplateComponent = templateComponents[templateId];

  // 获取模板配置
  const template = POSTER_TEMPLATES.find(t => t.id === templateId);
  if (!template) return null;

  // 固定预览容器尺寸 - 16:10 黄金比例
  const previewWidth = 320;
  const previewHeight = 200;

  // 计算缩放比例 - 让模板完整显示（保持宽高比）
  const scaleX = previewWidth / template.width;
  const scaleY = previewHeight / template.height;
  const scale = Math.min(scaleX, scaleY); // 使用较小的缩放比例确保完整显示

  const scaledWidth = template.width * scale;
  const scaledHeight = template.height * scale;

  // 计算偏移以居中
  const offsetX = (previewWidth - scaledWidth) / 2;
  const offsetY = (previewHeight - scaledHeight) / 2;

  return (
    <div
      className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-xl overflow-hidden"
      style={{
        width: `${previewWidth}px`,
        height: `${previewHeight}px`,
      }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          left: `${offsetX / scale}px`,
          top: `${offsetY / scale}px`,
          width: `${template.width}px`,
          height: `${template.height}px`,
        }}
      >
        <TemplateComponent data={data} id={thumbnailId} />
      </div>

      {/* 优雅的渐变遮罩 - 增强深度感 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/5 via-transparent to-transparent pointer-events-none" />
    </div>
  );
}
