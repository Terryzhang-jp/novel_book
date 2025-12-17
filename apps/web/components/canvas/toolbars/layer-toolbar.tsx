/**
 * LayerToolbar Component
 *
 * Right-side toolbar for layer operations and image actions:
 * - Remove background (for images)
 * - Magic edit (for images)
 * - Layer ordering (bring forward, send backward, etc.)
 */

"use client";

import { memo } from "react";
import {
  ArrowUp,
  ArrowDown,
  BringToFront,
  SendToBack,
  Scissors,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useCanvasStore } from "@/lib/canvas/canvas-store";
import type { CanvasElement } from "@/types/storage";

interface LayerToolbarProps {
  selectedElement: CanvasElement | null;
  onRemoveBackground: () => void;
  onMagicEdit: () => void;
  visible: boolean;
}

function LayerToolbarComponent({
  selectedElement,
  onRemoveBackground,
  onMagicEdit,
  visible,
}: LayerToolbarProps) {
  const { moveLayer, selectedId, isProcessingBg, editingState } = useCanvasStore();

  // Don't show if no selection or while editing text
  if (!selectedId || editingState) {
    return null;
  }

  const isImage = selectedElement?.type === "image";

  return (
    <div
      className={`fixed top-24 right-8 z-50 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-x-0"
          : "opacity-0 translate-x-4 pointer-events-none"
      }`}
    >
      <div className="bg-white/95 backdrop-blur-lg rounded-xl shadow-xl p-2 flex flex-col gap-2 border border-gray-200">
        {/* Image-specific actions */}
        {isImage && (
          <>
            <ToolbarButton
              icon={
                isProcessingBg ? (
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                ) : (
                  <Scissors className="w-5 h-5" />
                )
              }
              onClick={onRemoveBackground}
              disabled={isProcessingBg}
              title="Remove Background"
            />
            <ToolbarButton
              icon={<Sparkles className="w-5 h-5 text-indigo-600" />}
              onClick={onMagicEdit}
              title="Magic Edit"
            />
            <div className="h-px bg-gray-200 my-1" />
          </>
        )}

        {/* Layer ordering */}
        <ToolbarButton
          icon={<BringToFront className="w-5 h-5" />}
          onClick={() => moveLayer(selectedId, "top")}
          title="Bring to Front"
        />
        <ToolbarButton
          icon={<ArrowUp className="w-5 h-5" />}
          onClick={() => moveLayer(selectedId, "up")}
          title="Bring Forward"
        />
        <ToolbarButton
          icon={<ArrowDown className="w-5 h-5" />}
          onClick={() => moveLayer(selectedId, "down")}
          title="Send Backward"
        />
        <ToolbarButton
          icon={<SendToBack className="w-5 h-5" />}
          onClick={() => moveLayer(selectedId, "bottom")}
          title="Send to Back"
        />
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}

function ToolbarButton({ icon, onClick, title, disabled }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
      title={title}
    >
      {icon}
    </button>
  );
}

export const LayerToolbar = memo(LayerToolbarComponent);
