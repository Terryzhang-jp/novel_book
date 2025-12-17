/**
 * TextPropertiesToolbar Component
 *
 * Floating toolbar for text element properties:
 * - Font family selection
 * - Font size
 * - Color picker
 *
 * 显示条件：选中文本元素时（包括编辑时）
 * 不显示条件：选中 sticker 时（emoji 不需要字体设置）
 */

"use client";

import { memo, useCallback } from "react";
import { Type } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas/canvas-store";
import { JOURNAL_FONTS } from "@/types/storage";
import type { CanvasElement } from "@/types/storage";

// 预设字体大小
const FONT_SIZE_PRESETS = [12, 16, 20, 24, 32, 48, 64, 96];

interface TextPropertiesToolbarProps {
  selectedElement: CanvasElement | null;
  visible: boolean;
}

function TextPropertiesToolbarComponent({
  selectedElement,
  visible,
}: TextPropertiesToolbarProps) {
  const { updateElement, editingState, elements } = useCanvasStore();

  // 编辑时从 elements 获取最新元素（editingState.id）
  const targetElement = editingState
    ? elements.find((el) => el.id === editingState.id)
    : selectedElement;

  // 只对 text 类型显示（不包括 sticker，emoji 不需要字体设置）
  const shouldShow = targetElement && targetElement.type === "text";

  const handleFontChange = useCallback(
    (fontFamily: string) => {
      if (targetElement) {
        updateElement(targetElement.id, { fontFamily });
      }
    },
    [targetElement, updateElement]
  );

  const handleFontSizeChange = useCallback(
    (fontSize: number) => {
      if (targetElement) {
        updateElement(targetElement.id, {
          fontSize: Math.max(8, Math.min(200, fontSize)),
        });
      }
    },
    [targetElement, updateElement]
  );

  const handleColorChange = useCallback(
    (fill: string) => {
      if (targetElement) {
        updateElement(targetElement.id, { fill });
      }
    },
    [targetElement, updateElement]
  );

  if (!shouldShow || !targetElement) {
    return null;
  }

  const currentFontSize = targetElement.fontSize || 24;

  return (
    <div
      className={`fixed top-24 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-4 pointer-events-none"
      }`}
    >
      <div className="bg-white/95 backdrop-blur-lg rounded-full shadow-xl px-4 py-2 flex items-center gap-2 border border-gray-200">
        {/* Icon */}
        <Type className="w-4 h-4 text-gray-500" />

        {/* Font Family */}
        <select
          value={targetElement.fontFamily || "Arial"}
          onChange={(e) => handleFontChange(e.target.value)}
          className="bg-transparent text-sm font-medium outline-none cursor-pointer"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {JOURNAL_FONTS.map((font) => (
            <option key={font} value={font} style={{ fontFamily: font }}>
              {font}
            </option>
          ))}
        </select>

        <Divider />

        {/* Font Size - 下拉预设 + 手动输入 */}
        <select
          value={FONT_SIZE_PRESETS.includes(currentFontSize) ? currentFontSize : ""}
          onChange={(e) => {
            const val = e.target.value;
            if (val) handleFontSizeChange(Number(val));
          }}
          className="bg-transparent text-sm outline-none cursor-pointer w-14"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <option value="" disabled>
            {currentFontSize}
          </option>
          {FONT_SIZE_PRESETS.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>

        <Divider />

        {/* Color Picker */}
        <div className="relative">
          <input
            type="color"
            value={targetElement.fill || "#333333"}
            onChange={(e) => handleColorChange(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer border border-gray-300 bg-transparent"
            title="文字颜色"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-gray-300 mx-2" />;
}

export const TextPropertiesToolbar = memo(TextPropertiesToolbarComponent);
