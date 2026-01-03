'use client';

/**
 * MagazineNavigation - 翻页导航控制
 *
 * 提供左右箭头按钮进行翻页
 */

import { useCanvasStore } from '@/lib/canvas/canvas-store';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MagazineNavigationProps {
  direction: 'prev' | 'next';
}

export function MagazineNavigation({ direction }: MagazineNavigationProps) {
  const { currentSpreadIndex, nextSpread, prevSpread, getTotalSpreads } = useCanvasStore();

  const totalSpreads = getTotalSpreads();
  const isPrev = direction === 'prev';

  const canNavigate = isPrev
    ? currentSpreadIndex > 0
    : currentSpreadIndex < totalSpreads - 1;

  const handleClick = () => {
    if (isPrev) {
      prevSpread();
    } else {
      nextSpread();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!canNavigate}
      className={cn(
        'w-12 h-12 rounded-full flex items-center justify-center transition-all',
        'bg-background border border-border shadow-md',
        canNavigate
          ? 'hover:bg-muted hover:scale-110 cursor-pointer'
          : 'opacity-30 cursor-not-allowed'
      )}
      aria-label={isPrev ? 'Previous spread' : 'Next spread'}
    >
      {isPrev ? (
        <ChevronLeft className="w-6 h-6" />
      ) : (
        <ChevronRight className="w-6 h-6" />
      )}
    </button>
  );
}
