/**
 * useCanvasAutoSave Hook
 *
 * Handles automatic saving with:
 * - Debounced save (1.5s for elements, 3s for viewport)
 * - Retry on failure
 * - Save on window unload
 * - Version conflict detection
 */

import { useEffect, useRef, useCallback } from "react";
import { useCanvasStore } from "../canvas-store";
import { CANVAS_CONFIG } from "@/types/storage";
import { toast } from "sonner";

interface UseCanvasAutoSaveOptions {
  enabled?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export function useCanvasAutoSave(options: UseCanvasAutoSaveOptions = {}) {
  const { enabled = true, maxRetries = 3, retryDelay = 2000 } = options;

  const {
    projectId,
    elements,
    viewport,
    hasUnsavedChanges,
    saveStatus,
    saveToServer,
    setSaveStatus,
    isLoading,
    hasConflict,
    projectVersion,
    resolveConflict,
  } = useCanvasStore();

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const lastSavedRef = useRef({ elements: "", viewport: "" });

  // Check if data has actually changed
  const hasDataChanged = useCallback(() => {
    const elementsStr = JSON.stringify(elements);
    const viewportStr = JSON.stringify(viewport);

    const changed =
      elementsStr !== lastSavedRef.current.elements ||
      viewportStr !== lastSavedRef.current.viewport;

    if (changed) {
      lastSavedRef.current = { elements: elementsStr, viewport: viewportStr };
    }

    return changed;
  }, [elements, viewport]);

  // Save with retry logic
  const saveWithRetry = useCallback(async () => {
    if (!projectId || !enabled || hasConflict) return;

    // Check if data actually changed
    if (!hasDataChanged()) {
      return;
    }

    setSaveStatus("saving");

    try {
      const response = await fetch(`/api/canvas/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements, viewport, expectedVersion: projectVersion }),
      });

      // 处理版本冲突
      if (response.status === 409) {
        const data = await response.json();
        setSaveStatus("error");

        // 存储服务器数据
        if (data.latestProject) {
          (window as any).__serverCanvasData = {
            elements: data.latestProject.elements,
            viewport: data.latestProject.viewport,
            version: data.latestProject.version,
          };
        }

        // 显示冲突提示
        toast.error("检测到版本冲突，其他地方有更新", {
          description: "请选择保留本地更改或使用服务器数据",
          duration: 10000,
          action: {
            label: "使用服务器数据",
            onClick: () => resolveConflict(true),
          },
        });

        retryCountRef.current = 0;
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      const data = await response.json();
      // 更新本地版本号
      useCanvasStore.getState().setServerData({
        elements: data.project.elements,
        viewport: data.project.viewport,
        version: data.project.version,
      });

      setSaveStatus("saved");
      retryCountRef.current = 0;
    } catch (error) {
      console.error("Save error:", error);

      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        setSaveStatus("saving");

        // Schedule retry
        setTimeout(() => {
          saveWithRetry();
        }, retryDelay);

        toast.warning(`保存失败，正在重试... (${retryCountRef.current}/${maxRetries})`);
      } else {
        setSaveStatus("error");
        retryCountRef.current = 0;
        toast.error("多次保存失败，请检查网络连接");
      }
    }
  }, [projectId, elements, viewport, enabled, maxRetries, retryDelay, setSaveStatus, hasDataChanged, hasConflict, projectVersion, resolveConflict]);

  // Debounced auto-save
  useEffect(() => {
    if (!enabled || isLoading || !projectId || !hasUnsavedChanges) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout
    saveTimeoutRef.current = setTimeout(() => {
      saveWithRetry();
    }, CANVAS_CONFIG.SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [elements, viewport, enabled, isLoading, projectId, hasUnsavedChanges, saveWithRetry]);

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Try to save synchronously (not guaranteed to complete)
        navigator.sendBeacon?.(
          `/api/canvas/${projectId}`,
          JSON.stringify({ elements, viewport })
        );

        // Show browser warning
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [projectId, elements, viewport, hasUnsavedChanges]);

  return {
    saveStatus,
    hasUnsavedChanges,
    hasConflict,
    saveNow: saveWithRetry,
    resolveConflict,
  };
}
