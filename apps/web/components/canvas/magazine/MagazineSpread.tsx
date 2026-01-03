'use client';

/**
 * MagazineSpread - 杂志展开视图
 *
 * 渲染一个 spread（双页展开）：
 * - spread 0: 封面（单页居中）
 * - spread 1+: 左右两页并排
 */

import { useCanvasStore } from '@/lib/canvas/canvas-store';
import { MagazinePage } from './MagazinePage';
import { A4_CONFIG } from '@/types/storage';
import { cn } from '@/lib/utils';

interface MagazineSpreadProps {
  spreadIndex: number;
}

export function MagazineSpread({ spreadIndex }: MagazineSpreadProps) {
  const { getSpreadPages, enterEditMode, pages } = useCanvasStore();
  const [leftPage, rightPage] = getSpreadPages(spreadIndex);

  const isCover = spreadIndex === 0;

  // 计算页面索引
  const leftPageIndex = isCover ? 0 : spreadIndex * 2 - 1;
  const rightPageIndex = leftPageIndex + 1;

  return (
    <div
      className={cn(
        'flex gap-1 transition-all duration-300',
        isCover ? 'justify-center' : 'justify-center'
      )}
      style={{
        perspective: '2000px',
      }}
    >
      {/* Left Page (or Cover) */}
      {leftPage && (
        <MagazinePage
          page={leftPage}
          pageIndex={leftPageIndex}
          position={isCover ? 'center' : 'left'}
          onClick={() => enterEditMode(leftPageIndex)}
        />
      )}

      {/* Right Page (not shown for cover) */}
      {!isCover && rightPage && (
        <MagazinePage
          page={rightPage}
          pageIndex={rightPageIndex}
          position="right"
          onClick={() => enterEditMode(rightPageIndex)}
        />
      )}

      {/* Empty Right Page Placeholder */}
      {!isCover && !rightPage && pages.length > 1 && (
        <div
          className="bg-card/50 border border-dashed border-border rounded-sm flex items-center justify-center"
          style={{
            width: A4_CONFIG.PREVIEW_WIDTH,
            height: A4_CONFIG.PREVIEW_HEIGHT,
          }}
        >
          <span className="text-muted-foreground text-sm">Empty</span>
        </div>
      )}
    </div>
  );
}
