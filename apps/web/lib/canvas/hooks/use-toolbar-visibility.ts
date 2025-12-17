/**
 * useToolbarVisibility Hook
 *
 * Auto-hides toolbar after inactivity.
 * Shows toolbar on mouse movement.
 */

import { useEffect, useRef } from "react";
import { useCanvasStore } from "../canvas-store";
import { CANVAS_CONFIG } from "@/types/storage";

export function useToolbarVisibility() {
  const { showToolbar, setShowToolbar } = useCanvasStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleMouseMove = () => {
      setShowToolbar(true);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout to hide
      timeoutRef.current = setTimeout(() => {
        setShowToolbar(false);
      }, CANVAS_CONFIG.TOOLBAR_HIDE_DELAY_MS);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [setShowToolbar]);

  return showToolbar;
}
