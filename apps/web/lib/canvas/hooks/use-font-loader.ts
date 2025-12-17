/**
 * useFontLoader Hook
 *
 * For Fontsource fonts, we don't need to dynamically load them
 * since they are bundled with the app. This hook just returns
 * the loaded fonts state for compatibility.
 */

import { useEffect } from "react";
import { useCanvasStore } from "../canvas-store";
import { JOURNAL_FONTS } from "@/types/storage";

export function useFontLoader() {
  const { loadedFonts, setFontLoaded } = useCanvasStore();

  useEffect(() => {
    // Fontsource fonts are already loaded via layout.tsx imports
    // Just mark them as loaded for the UI
    JOURNAL_FONTS.forEach((font) => {
      if (!loadedFonts[font]) {
        setFontLoaded(font);
      }
    });
  }, [loadedFonts, setFontLoaded]);

  return loadedFonts;
}

