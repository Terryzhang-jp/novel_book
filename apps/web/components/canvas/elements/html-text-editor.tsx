/**
 * HtmlTextEditor Component
 *
 * Floating rich text editor overlay for editing text elements.
 * Uses contentEditable with execCommand for formatting.
 *
 * Features:
 * - Bold, Italic, Underline formatting
 * - Escape to close, Enter to confirm (Shift+Enter for newline)
 * - Auto-focus on mount
 * - Zoom-aware positioning and sizing
 * - Smart toolbar positioning (avoids screen edges)
 */

"use client";

import { useRef, useEffect, useState, memo } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import type { TextEditingState } from "@/types/storage";

interface HtmlTextEditorProps {
  editingState: TextEditingState;
  onChange: (html: string) => void;
  onBlur: () => void;
}

const TOOLBAR_HEIGHT = 40;
const TOOLBAR_MARGIN = 8;

function HtmlTextEditorComponent({
  editingState,
  onChange,
  onBlur,
}: HtmlTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [toolbarPosition, setToolbarPosition] = useState<"top" | "bottom">("top");

  const { x, y, width, height, zoom, style } = editingState;

  // 计算缩放后的字体大小
  const scaledFontSize = style.fontSize * zoom;

  // 计算工具栏位置（确保在视口内）
  useEffect(() => {
    const toolbarTop = y - TOOLBAR_HEIGHT - TOOLBAR_MARGIN;
    setToolbarPosition(toolbarTop < 10 ? "bottom" : "top");
  }, [y]);

  // Initialize editor content and focus
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = editingState.initialHtml;
      editorRef.current.focus();

      // Move cursor to end
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [editingState.initialHtml]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    onChange(e.currentTarget.innerHTML);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape: 取消编辑
    if (e.key === "Escape") {
      e.preventDefault();
      onBlur();
      return;
    }

    // Enter (without Shift): 确认编辑
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onBlur();
      return;
    }

    // Shift+Enter: 换行（默认行为，不阻止）
  };

  /**
   * Execute a formatting command
   */
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
      editorRef.current.focus();
    }
  };

  // 工具栏位置计算
  const toolbarStyle = {
    left: x,
    ...(toolbarPosition === "top"
      ? { top: y - TOOLBAR_HEIGHT - TOOLBAR_MARGIN }
      : { top: y + height + TOOLBAR_MARGIN }),
  };

  return (
    <>
      {/* Formatting toolbar */}
      <div
        className="fixed z-[60] bg-white shadow-xl rounded-lg border border-gray-200 flex items-center gap-1 p-1"
        style={toolbarStyle}
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          onClick={() => execCommand("bold")}
          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => execCommand("italic")}
          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => execCommand("underline")}
          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
          title="Underline (Ctrl+U)"
        >
          <Underline className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <span className="text-[10px] text-gray-400 px-1">Enter 确认 | Esc 取消</span>
      </div>

      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        className="fixed z-50 outline-none p-1 overflow-visible border-2 border-blue-400 rounded bg-white/80"
        style={{
          left: x,
          top: y,
          width: width,
          minHeight: Math.max(scaledFontSize * 1.5, 24),
          fontSize: scaledFontSize,
          fontFamily: style.fontFamily,
          color: style.fill,
          lineHeight: "1.2",
          wordWrap: "break-word",
        }}
      />
    </>
  );
}

export const HtmlTextEditor = memo(HtmlTextEditorComponent);
