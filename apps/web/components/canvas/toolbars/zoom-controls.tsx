/**
 * ZoomControls Component
 *
 * Bottom-right zoom controls:
 * - Zoom in
 * - Current zoom percentage (click to reset)
 * - Zoom out
 */

"use client";

import { memo } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas/canvas-store";

interface ZoomControlsProps {
  visible: boolean;
}

function ZoomControlsComponent({ visible }: ZoomControlsProps) {
  const { viewport, zoomIn, zoomOut, resetView } = useCanvasStore();

  const zoomPercentage = Math.round(viewport.zoom * 100);

  return (
    <div
      className={`fixed bottom-8 right-8 z-50 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <div className="bg-white/95 backdrop-blur-lg rounded-xl shadow-xl p-2 flex flex-col gap-2 border border-gray-200">
        <button
          onClick={zoomIn}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>

        <button
          onClick={resetView}
          className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Reset View (click to reset)"
        >
          {zoomPercentage}%
        </button>

        <button
          onClick={zoomOut}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export const ZoomControls = memo(ZoomControlsComponent);
