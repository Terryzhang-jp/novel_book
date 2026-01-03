'use client';

/**
 * PageThumbnails - 页面缩略图条
 *
 * 显示所有页面的缩略图，点击跳转到对应 spread
 */

import { useCanvasStore } from '@/lib/canvas/canvas-store';
import { A4_CONFIG } from '@/types/storage';
import { cn } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';

// 缩略图尺寸
const THUMB_WIDTH = 48;
const THUMB_HEIGHT = Math.round(THUMB_WIDTH / A4_CONFIG.ASPECT_RATIO);

export function PageThumbnails() {
  const {
    pages,
    currentSpreadIndex,
    goToSpread,
    addPage,
    deletePage,
    enterEditMode,
  } = useCanvasStore();

  // 计算页面所在的 spread 索引
  const getSpreadIndexForPage = (pageIndex: number): number => {
    if (pageIndex === 0) return 0; // 封面
    return Math.ceil(pageIndex / 2); // 其他页面两两配对
  };

  return (
    <div className="h-full flex items-center justify-center gap-2 px-4 overflow-x-auto">
      {pages.map((page, index) => {
        const spreadIndex = getSpreadIndexForPage(index);
        const isCurrentSpread = spreadIndex === currentSpreadIndex;

        return (
          <div
            key={page.id}
            className="relative group flex-shrink-0"
          >
            <button
              onClick={() => goToSpread(spreadIndex)}
              onDoubleClick={() => enterEditMode(index)}
              className={cn(
                'relative rounded overflow-hidden transition-all',
                'border-2',
                isCurrentSpread
                  ? 'border-primary shadow-lg scale-110'
                  : 'border-transparent hover:border-muted-foreground/30'
              )}
              style={{
                width: THUMB_WIDTH,
                height: THUMB_HEIGHT,
              }}
              title={index === 0 ? 'Cover' : `Page ${index}`}
            >
              {/* Thumbnail Background */}
              <div className="absolute inset-0 bg-white">
                {/* Simple element indicator dots */}
                {page.elements.length > 0 && (
                  <div className="absolute inset-1 flex flex-wrap gap-0.5 content-start">
                    {page.elements.slice(0, 6).map((el, i) => (
                      <div
                        key={i}
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          el.type === 'image' ? 'bg-blue-400' :
                          el.type === 'text' ? 'bg-gray-400' :
                          'bg-amber-400'
                        )}
                      />
                    ))}
                    {page.elements.length > 6 && (
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>
                )}
              </div>

              {/* Page Number */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent py-0.5">
                <span className="text-[8px] text-white font-medium">
                  {index === 0 ? 'C' : index}
                </span>
              </div>
            </button>

            {/* Delete button (shown on hover, not for cover if only page) */}
            {(index > 0 || pages.length > 1) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletePage(index);
                }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete page"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Add Page Button */}
      <button
        onClick={() => addPage()}
        className="flex-shrink-0 rounded border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center"
        style={{
          width: THUMB_WIDTH,
          height: THUMB_HEIGHT,
        }}
        title="Add new page"
      >
        <Plus className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}
