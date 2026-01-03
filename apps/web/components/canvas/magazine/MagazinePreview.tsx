'use client';

/**
 * MagazinePreview - 杂志预览模式
 *
 * 双页展开视图：
 * - 封面单独显示（spread 0）
 * - 其他页面两两配对显示
 * - 点击页面进入编辑模式
 */

import { useCanvasStore } from '@/lib/canvas/canvas-store';
import { MagazineSpread } from './MagazineSpread';
import { MagazineNavigation } from './MagazineNavigation';
import { PageThumbnails } from './PageThumbnails';
import { ChevronLeft, Plus, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MagazinePreview() {
  const {
    projectTitle,
    pages,
    currentSpreadIndex,
    saveStatus,
    addPage,
    getTotalSpreads,
  } = useCanvasStore();

  const totalSpreads = getTotalSpreads();

  return (
    <div className="fixed inset-0 bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back</span>
          </button>
        </div>

        <h1 className="font-serif font-bold text-lg tracking-tight">
          {projectTitle}
        </h1>

        <div className="flex items-center gap-2">
          {/* Save Status */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {saveStatus === 'saving' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Save className="w-4 h-4" />
                <span>Saved</span>
              </>
            )}
            {saveStatus === 'error' && (
              <span className="text-destructive">Save failed</span>
            )}
          </div>

          {/* Add Page Button */}
          <button
            onClick={() => addPage()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Page
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center overflow-hidden p-8">
        {/* Navigation + Spread */}
        <div className="flex items-center gap-8">
          <MagazineNavigation direction="prev" />

          <MagazineSpread spreadIndex={currentSpreadIndex} />

          <MagazineNavigation direction="next" />
        </div>

        {/* Page Indicator */}
        <div className="mt-6 text-sm text-muted-foreground">
          {currentSpreadIndex === 0 ? (
            <span>Cover</span>
          ) : (
            <span>
              Pages {currentSpreadIndex * 2 - 1}-{Math.min(currentSpreadIndex * 2, pages.length - 1)} of {pages.length}
            </span>
          )}
        </div>
      </main>

      {/* Footer - Thumbnails */}
      <footer className="h-24 border-t border-border bg-background/80 backdrop-blur-xl">
        <PageThumbnails />
      </footer>
    </div>
  );
}
