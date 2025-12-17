/**
 * CanvasHints Component
 *
 * Bottom-left hints showing keyboard shortcuts and controls.
 */

"use client";

import { memo } from "react";

interface CanvasHintsProps {
  visible: boolean;
}

function CanvasHintsComponent({ visible }: CanvasHintsProps) {
  return (
    <div
      className={`fixed bottom-8 left-8 z-50 transition-all duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-500 border border-gray-200">
        <div className="flex flex-col gap-1">
          <p>
            <kbd className="px-1 bg-gray-100 rounded">Scroll</kbd> to zoom
          </p>
          <p>
            <kbd className="px-1 bg-gray-100 rounded">Space</kbd> + drag to pan
          </p>
          <p>
            <kbd className="px-1 bg-gray-100 rounded">Ctrl+Z</kbd> undo |{" "}
            <kbd className="px-1 bg-gray-100 rounded">Ctrl+Shift+Z</kbd> redo
          </p>
          <p>
            <kbd className="px-1 bg-gray-100 rounded">Delete</kbd> to remove selected
          </p>
        </div>
      </div>
    </div>
  );
}

export const CanvasHints = memo(CanvasHintsComponent);
