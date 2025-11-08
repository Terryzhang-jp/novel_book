'use client';

/**
 * Tinder式滑动卡片视图
 * 一次展示一个完整模板，左右滑动切换
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { PosterData, TemplateId } from '@/lib/poster/types';
import { POSTER_TEMPLATES } from '@/lib/poster/template-config';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';

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

interface TemplateSwipeViewProps {
  posterData: PosterData;
  onTemplateClick?: (templateId: TemplateId) => void;
}

export function TemplateSwipeView({ posterData, onTemplateClick }: TemplateSwipeViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  const currentTemplate = POSTER_TEMPLATES[currentIndex];

  const templateComponents: Record<TemplateId, any> = {
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

  const TemplateComponent = templateComponents[currentTemplate.id];

  // 切换到下一个模板
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev < POSTER_TEMPLATES.length - 1) {
        setShowInfo(true);
        return prev + 1;
      }
      return prev;
    });
  }, []);

  // 切换到上一个模板
  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev > 0) {
        setShowInfo(true);
        return prev - 1;
      }
      return prev;
    });
  }, []);

  // 鼠标/触摸事件处理
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    startXRef.current = clientX;
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    const offset = clientX - startXRef.current;
    setDragOffset(offset);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 100; // 滑动阈值（像素）

    if (dragOffset > threshold) {
      goToPrev(); // 向右滑动，显示上一个
    } else if (dragOffset < -threshold) {
      goToNext(); // 向左滑动，显示下一个
    }

    setDragOffset(0);
  };

  // 鼠标事件
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX);
  };

  const onMouseUp = () => {
    handleDragEnd();
  };

  // 触摸事件
  const onTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientX);
  };

  const onTouchEnd = () => {
    handleDragEnd();
  };

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext]);

  // 计算缩放比例 - 让模板适应屏幕
  const containerMaxWidth = 900;
  const containerMaxHeight = 700;
  const scale = Math.min(
    containerMaxWidth / currentTemplate.width,
    containerMaxHeight / currentTemplate.height,
    1 // 不超过原始尺寸
  );

  const scaledWidth = currentTemplate.width * scale;
  const scaledHeight = currentTemplate.height * scale;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] py-8 px-4">
      {/* 顶部信息栏 */}
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <h2 className="text-3xl font-bold text-foreground">
            {currentTemplate.name}
          </h2>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <Info className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {showInfo && (
          <p className="text-sm text-muted-foreground mb-2 animate-in fade-in duration-300">
            {currentTemplate.description}
          </p>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="px-3 py-1 bg-secondary rounded-full font-medium">
            {currentTemplate.aspectRatio}
          </span>
          <span className="px-3 py-1 bg-secondary rounded-full font-medium">
            {currentTemplate.width} × {currentTemplate.height}
          </span>
          <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold">
            {currentIndex + 1} / {POSTER_TEMPLATES.length}
          </span>
        </div>
      </div>

      {/* 卡片容器 */}
      <div className="relative">
        {/* 导航按钮 */}
        {currentIndex > 0 && (
          <button
            onClick={goToPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-16 z-20 p-4 bg-background/80 backdrop-blur-sm border border-border rounded-full shadow-lg hover:bg-secondary transition-all hover:scale-110 active:scale-95"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {currentIndex < POSTER_TEMPLATES.length - 1 && (
          <button
            onClick={goToNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-16 z-20 p-4 bg-background/80 backdrop-blur-sm border border-border rounded-full shadow-lg hover:bg-secondary transition-all hover:scale-110 active:scale-95"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* 可滑动的卡片 */}
        <div
          ref={cardRef}
          className="relative cursor-grab active:cursor-grabbing select-none touch-none"
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
            transform: `translateX(${dragOffset}px) rotate(${dragOffset * 0.02}deg)`,
            transition: isDragging ? 'none' : 'transform 0.3s ease-out',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={() => {
            // 只有在没有拖动的情况下才触发点击
            if (Math.abs(dragOffset) < 10) {
              onTemplateClick?.(currentTemplate.id);
            }
          }}
        >
          {/* 阴影和边框 */}
          <div className="absolute inset-0 rounded-2xl shadow-2xl" />

          {/* 模板内容 */}
          <div
            className="relative rounded-2xl overflow-hidden bg-white shadow-2xl border-4 border-white hover:border-primary/30 transition-all duration-300"
            style={{
              width: '100%',
              height: '100%',
            }}
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                width: `${currentTemplate.width}px`,
                height: `${currentTemplate.height}px`,
              }}
            >
              <TemplateComponent data={posterData} id={`swipe-${currentTemplate.id}`} />
            </div>

            {/* 点击提示遮罩 */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors duration-300 flex items-center justify-center">
              <div className="opacity-0 hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm px-6 py-3 rounded-full shadow-lg">
                <p className="text-sm font-semibold text-gray-900">
                  点击编辑此模板
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 滑动提示 */}
        {currentIndex === 0 && (
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center text-xs text-muted-foreground animate-pulse">
            👈 滑动查看更多模板 👉
          </div>
        )}
      </div>

      {/* 进度指示器 */}
      <div className="mt-8 flex gap-2">
        {POSTER_TEMPLATES.map((template, index) => (
          <button
            key={template.id}
            onClick={() => {
              setCurrentIndex(index);
              setShowInfo(true);
            }}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === currentIndex
                ? 'w-8 bg-primary'
                : 'w-2 bg-border hover:bg-primary/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
