/**
 * CanvasRichText Component
 *
 * Renders text/sticker elements on the canvas using native Konva.Text
 * for proper font support and auto-height adjustment.
 */

"use client";

import { useRef, useEffect, useCallback, memo, useMemo } from "react";
import { Text, Group, Rect } from "react-konva";
import type { CanvasElement } from "@/types/storage";
import Konva from "konva";

interface CanvasRichTextProps {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
  onDblClick: () => void;
}

// 将 HTML 转换为纯文本，保留换行（移到组件外避免重复创建）
const htmlToText = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div><div>/gi, "\n")
    .replace(/<\/p><p>/gi, "\n")
    .replace(/<div>/gi, "")
    .replace(/<\/div>/gi, "\n")
    .replace(/<p>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
};

function CanvasRichTextComponent({
  element,
  isSelected,
  onSelect,
  onUpdate,
  onDblClick,
}: CanvasRichTextProps) {
  const textRef = useRef<Konva.Text>(null);
  const lastHeightRef = useRef<number>(element.height || 0);

  const width = element.width || 200;
  const fontSize = element.fontSize || 24;
  const fontFamily = element.fontFamily || "ZCOOL XiaoWei";
  const content = element.text || (element.html ? htmlToText(element.html) : "");
  const fill = element.fill || "#333333";

  // 使用 useCallback 稳定高度更新函数
  const updateHeight = useCallback(() => {
    if (!textRef.current) return;

    const newHeight = textRef.current.height();
    // 只有当高度变化超过阈值且与上次不同时才更新
    if (Math.abs(newHeight - lastHeightRef.current) > 5) {
      lastHeightRef.current = newHeight;
      onUpdate(element.id, { height: newHeight });
    }
  }, [element.id, onUpdate]);

  // 自动调整高度 - 只在内容/尺寸变化时触发，不依赖 onUpdate
  useEffect(() => {
    // 延迟执行，等待 Konva 完成渲染
    const timer = requestAnimationFrame(() => {
      updateHeight();
    });
    return () => cancelAnimationFrame(timer);
  }, [content, width, fontSize, fontFamily, updateHeight]);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onUpdate(element.id, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const scaleX = node.scaleX();

    // 只更新宽度，高度由文本内容决定
    const newWidth = Math.max(80, width * scaleX);

    onUpdate(element.id, {
      x: node.x(),
      y: node.y(),
      width: newWidth,
      rotation: node.rotation(),
    });

    // 重置 scale
    node.scaleX(1);
    node.scaleY(1);
  };

  return (
    <Group
      id={element.id}
      x={element.x}
      y={element.y}
      rotation={element.rotation || 0}
      opacity={element.opacity ?? 1}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
    >
      {/* 背景区域（用于检测点击） */}
      <Rect
        width={width}
        height={textRef.current?.height() || fontSize * 1.4}
        fill="transparent"
      />

      {/* 文本 */}
      <Text
        ref={textRef}
        text={content}
        width={width}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fill={fill}
        wrap="word"
        lineHeight={1.4}
        verticalAlign="top"
      />
    </Group>
  );
}

export const CanvasRichText = memo(CanvasRichTextComponent);

