'use client';

/**
 * MagazineCanvas - 杂志模式主容器
 *
 * 负责切换预览模式和编辑模式：
 * - preview: 双页展开视图，可翻页浏览
 * - edit: 单页全屏编辑
 */

import { useCanvasStore } from '@/lib/canvas/canvas-store';
import { MagazinePreview } from './MagazinePreview';
import { MagazineEditor } from './MagazineEditor';

export function MagazineCanvas() {
  const magazineViewMode = useCanvasStore((state) => state.magazineViewMode);

  if (magazineViewMode === 'edit') {
    return <MagazineEditor />;
  }

  return <MagazinePreview />;
}
