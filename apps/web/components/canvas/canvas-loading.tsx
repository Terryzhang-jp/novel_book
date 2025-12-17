/**
 * CanvasLoading Component
 *
 * Full-screen loading state for the canvas.
 */

"use client";

import { memo } from "react";
import { Loader2 } from "lucide-react";

function CanvasLoadingComponent() {
  return (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
        <p className="text-white text-lg">Loading your journal...</p>
      </div>
    </div>
  );
}

export const CanvasLoading = memo(CanvasLoadingComponent);
