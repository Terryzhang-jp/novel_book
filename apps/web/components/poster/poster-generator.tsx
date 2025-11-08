'use client';

/**
 * 海报生成器核心组件
 * 负责渲染所有模板并转换为图片
 */

import { useCallback, useState } from 'react';
import type { PosterData, TemplateId } from '@/lib/poster/types';
import { elementToBlob } from '@/lib/poster/html-to-image';
import { downloadFile, downloadAsZip, generateFilename } from '@/lib/poster/batch-download';

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

interface PosterGeneratorProps {
  data: PosterData;
  onGenerating?: (templateId: TemplateId) => void;
  onComplete?: (templateId: TemplateId, blob: Blob) => void;
  onError?: (templateId: TemplateId, error: Error) => void;
}

export function PosterGenerator({ data, onGenerating, onComplete, onError }: PosterGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  /**
   * 生成单个模板的图片
   */
  const generateSingle = useCallback(async (templateId: TemplateId): Promise<Blob | null> => {
    const elementId = `${templateId}-template`;
    const element = document.getElementById(elementId);

    if (!element) {
      throw new Error(`Template element not found: ${elementId}`);
    }

    try {
      onGenerating?.(templateId);
      const blob = await elementToBlob(element as HTMLElement, { format: 'png', scale: 2 });
      onComplete?.(templateId, blob);
      return blob;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      onError?.(templateId, err);
      throw err;
    }
  }, [onGenerating, onComplete, onError]);

  /**
   * 生成并下载单个模板
   */
  const downloadSingle = useCallback(async (templateId: TemplateId) => {
    setIsGenerating(true);
    try {
      const blob = await generateSingle(templateId);
      if (blob) {
        const filename = generateFilename(templateId, data.title);
        await downloadFile(blob, filename);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [generateSingle, data.title]);

  /**
   * 批量生成所有模板
   */
  const generateAll = useCallback(async (): Promise<Array<{ templateId: TemplateId; blob: Blob }>> => {
    const templates: TemplateId[] = [
      'minimal',
      'polaroid',
      'magazine',
      'vintage',
      'modern',
      'travel-diary',
      'film',
      'gallery',
      'panorama',
      'story',
    ];

    const results: Array<{ templateId: TemplateId; blob: Blob }> = [];

    for (const templateId of templates) {
      try {
        const blob = await generateSingle(templateId);
        if (blob) {
          results.push({ templateId, blob });
        }
      } catch (error) {
        console.error(`Failed to generate ${templateId}:`, error);
        // 继续生成其他模板
      }
    }

    return results;
  }, [generateSingle]);

  /**
   * 批量下载所有模板为ZIP
   */
  const downloadAll = useCallback(async () => {
    setIsGenerating(true);
    try {
      const results = await generateAll();

      const files = results.map(({ templateId, blob }) => ({
        blob,
        filename: generateFilename(templateId, data.title),
      }));

      const zipName = data.title ? `${data.title}-posters.zip` : 'posters.zip';
      await downloadAsZip(files, zipName);
    } finally {
      setIsGenerating(false);
    }
  }, [generateAll, data.title]);

  /**
   * 批量生成选定的模板
   */
  const downloadSelected = useCallback(async (templateIds: TemplateId[]) => {
    setIsGenerating(true);
    try {
      const results: Array<{ blob: Blob; filename: string }> = [];

      for (const templateId of templateIds) {
        try {
          const blob = await generateSingle(templateId);
          if (blob) {
            results.push({
              blob,
              filename: generateFilename(templateId, data.title),
            });
          }
        } catch (error) {
          console.error(`Failed to generate ${templateId}:`, error);
        }
      }

      if (results.length === 1) {
        // 单个文件直接下载
        await downloadFile(results[0].blob, results[0].filename);
      } else if (results.length > 1) {
        // 多个文件打包为ZIP
        const zipName = data.title ? `${data.title}-posters.zip` : 'posters.zip';
        await downloadAsZip(results, zipName);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [generateSingle, data.title]);

  return (
    <>
      {/* 隐藏的模板渲染区域 - 用于生成图片 */}
      <div className="fixed -left-[10000px] -top-[10000px] pointer-events-none">
        <MinimalTemplate data={data} id="minimal-template" />
        <PolaroidTemplate data={data} id="polaroid-template" />
        <MagazineTemplate data={data} id="magazine-template" />
        <VintageTemplate data={data} id="vintage-template" />
        <ModernTemplate data={data} id="modern-template" />
        <TravelDiaryTemplate data={data} id="travel-diary-template" />
        <FilmTemplate data={data} id="film-template" />
        <GalleryTemplate data={data} id="gallery-template" />
        <PanoramaTemplate data={data} id="panorama-template" />
        <StoryTemplate data={data} id="story-template" />
      </div>

      {/* 导出API - 通过props暴露给父组件 */}
      <div style={{ display: 'none' }}>
        {/* This component doesn't render anything visible */}
        {/* Export functions are exposed via callbacks */}
      </div>
    </>
  );
}

// Hook to expose generator methods
export function usePosterGenerator() {
  return {
    downloadSingle: async (templateId: TemplateId, data: PosterData) => {
      const elementId = `${templateId}-template`;
      const element = document.getElementById(elementId);
      if (!element) throw new Error(`Template not found: ${elementId}`);

      const blob = await elementToBlob(element as HTMLElement, { format: 'png', scale: 2 });
      const filename = generateFilename(templateId, data.title);
      await downloadFile(blob, filename);
    },
  };
}

// 导出类型
export type PosterGeneratorHandle = {
  generateSingle: (templateId: TemplateId) => Promise<Blob | null>;
  downloadSingle: (templateId: TemplateId) => Promise<void>;
  generateAll: () => Promise<Array<{ templateId: TemplateId; blob: Blob }>>;
  downloadAll: () => Promise<void>;
  downloadSelected: (templateIds: TemplateId[]) => Promise<void>;
  isGenerating: boolean;
};
