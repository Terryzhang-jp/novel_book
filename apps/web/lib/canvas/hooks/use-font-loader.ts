/**
 * useFontLoader Hook
 *
 * 字体不再全部在 app/layout.tsx 里静态 import（那样会让每个页面都背上
 * 305 KB gzip 的渲染阻塞 CSS，见 lib/fonts/registry.ts 的说明）。
 *
 * 现在的策略：
 *   1. 进入画布时，只加载**当前画布里实际用到**的字体
 *   2. 用户打开字体下拉框时，再预加载全部候选字体（ensureAllFonts）
 *
 * 这样"打开画布"和"想换字体"这两件事的代价被分开了。
 */

import { useEffect, useCallback } from "react";
import { useCanvasStore } from "../canvas-store";
import { JOURNAL_FONTS } from "@/types/storage";
import { loadFontFamily, preloadFonts, GLOBAL_FONT } from "@/lib/fonts/registry";

/**
 * 收集画布上所有元素实际使用的字体族。
 * 杂志模式下元素分散在各页里，两种模式都要扫。
 */
function collectUsedFonts(
  elements: { fontFamily?: string }[],
  pages: { elements: { fontFamily?: string }[] }[] | undefined
): string[] {
  const used = new Set<string>();
  for (const el of elements) {
    if (el.fontFamily) used.add(el.fontFamily);
  }
  for (const page of pages ?? []) {
    for (const el of page.elements) {
      if (el.fontFamily) used.add(el.fontFamily);
    }
  }
  used.delete(GLOBAL_FONT); // 已全局加载，不必再拉
  return [...used];
}

export function useFontLoader() {
  const { loadedFonts, setFontLoaded, elements, pages } = useCanvasStore();

  // 只加载画布上真正用到的字体
  useEffect(() => {
    const used = collectUsedFonts(elements, pages);
    if (used.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const font of used) {
        await loadFontFamily(font);
        // 卸载后不要再写 store，避免 React 报 setState on unmounted
        if (cancelled) return;
        setFontLoaded(font);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [elements, pages, setFontLoaded]);

  // 全局字体始终视为可用
  useEffect(() => {
    if (!loadedFonts[GLOBAL_FONT]) setFontLoaded(GLOBAL_FONT);
  }, [loadedFonts, setFontLoaded]);

  /**
   * 预加载全部候选字体 —— 挂在字体下拉框的 onOpen / onFocus 上，
   * 这样用户看到的下拉列表里每一项都是真实字形的预览。
   */
  const ensureAllFonts = useCallback(async () => {
    await preloadFonts(JOURNAL_FONTS);
    for (const font of JOURNAL_FONTS) setFontLoaded(font);
  }, [setFontLoaded]);

  return { loadedFonts, ensureAllFonts };
}
