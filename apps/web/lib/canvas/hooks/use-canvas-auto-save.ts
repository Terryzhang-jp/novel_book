/**
 * useCanvasAutoSave Hook
 *
 * Handles automatic saving with:
 * - Debounced save
 * - Save on window unload
 * - Uses store's saveToServer for proper magazine mode support
 */

import { useEffect, useRef } from "react";
import { useCanvasStore } from "../canvas-store";
import { CANVAS_CONFIG } from "@/types/storage";

interface UseCanvasAutoSaveOptions {
  enabled?: boolean;
}

export function useCanvasAutoSave(options: UseCanvasAutoSaveOptions = {}) {
  const { enabled = true } = options;

  const {
    projectId,
    hasUnsavedChanges,
    saveStatus,
    saveToServer,
    isLoading,
    // Magazine mode
    isMagazineMode,
    pages,
    elements,
    viewport,
  } = useCanvasStore();

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 使用 store 的 saveToServer，它会正确处理杂志模式
  const triggerSave = async () => {
    if (!projectId || !enabled) return;
    await saveToServer();
  };

  // Debounced auto-save
  useEffect(() => {
    console.log("[AutoSave] Effect triggered", {
      enabled, isLoading, projectId, hasUnsavedChanges,
      elementsCount: elements.length,
      isMagazineMode,
      pagesCount: pages?.length
    });

    if (!enabled || isLoading || !projectId || !hasUnsavedChanges) {
      console.log("[AutoSave] Skipping save - conditions not met");
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout - 使用 store 的 saveToServer
    saveTimeoutRef.current = setTimeout(() => {
      triggerSave();
    }, CANVAS_CONFIG.SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
    // 依赖项：杂志模式下监听 pages 和 elements，非杂志模式只监听 elements
  }, [isMagazineMode ? pages : null, elements, viewport, enabled, isLoading, projectId, hasUnsavedChanges]);

  // Save before unload - try to save synchronously
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && projectId) {
        // Try to save using sendBeacon for reliable delivery
        const state = useCanvasStore.getState();
        const { elements, viewport, projectVersion, isMagazineMode, pages, currentPageIndex, magazineViewMode } = state;

        const saveData: Record<string, unknown> = {
          viewport,
          expectedVersion: projectVersion,
          isMagazineMode,
        };

        if (isMagazineMode) {
          let pagesToSave = pages;
          if (magazineViewMode === "edit") {
            pagesToSave = pages.map((page, idx) =>
              idx === currentPageIndex ? { ...page, elements } : page
            );
          }
          saveData.pages = pagesToSave;
          saveData.currentPageIndex = currentPageIndex;
          saveData.elements = [];
        } else {
          saveData.elements = elements;
        }

        // Use sendBeacon for reliable delivery during page unload
        const blob = new Blob([JSON.stringify(saveData)], { type: 'application/json' });
        navigator.sendBeacon(`/api/canvas/${projectId}`, blob);

        // Also show browser warning
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges, projectId]);

  return {
    saveStatus,
    hasUnsavedChanges,
    saveNow: triggerSave,
  };
}
