/**
 * CanvasRichText Component
 *
 * Renders text/sticker elements on the canvas using native Konva.Text
 * for proper font support and auto-height adjustment.
 */

"use client";

import { useRef, useEffect } from "react";
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

function CanvasRichTextComponent({
  element,
  isSelected,
  onSelect,
  onUpdate,
  onDblClick,
}: CanvasRichTextProps) {
  const textRef = useRef<Konva.Text>(null);

  const width = element.width || 200;
  const fontSize = element.fontSize || 24;
  const fontFamily = element.fontFamily || "ZCOOL XiaoWei";

  // 将 HTML 转换为纯文本，保留换行
  const htmlToText = (html: string): string => {
    return html
      .replace(/<br\s*\/?>/gi, "\n")           // <br> -> 换行
      .replace(/<\/div><div>/gi, "\n")          // </div><div> -> 换行
      .replace(/<\/p><p>/gi, "\n")              // </p><p> -> 换行
      .replace(/<div>/gi, "")                   // 移除开始 div
      .replace(/<\/div>/gi, "\n")               // </div> -> 换行
      .replace(/<p>/gi, "")                     // 移除开始 p
      .replace(/<\/p>/gi, "\n")                 // </p> -> 换行
      .replace(/<[^>]*>/g, "")                  // 移除其他 HTML 标签
      .replace(/&nbsp;/g, " ")                  // &nbsp; -> 空格
      .replace(/\n+/g, "\n")                    // 合并多个换行
      .trim();
  };

  const content = element.text || (element.html ? htmlToText(element.html) : "");
  const fill = element.fill || "#333333";

  // 自动调整高度
  useEffect(() => {
    if (textRef.current) {
      const textNode = textRef.current;
      const newHeight = textNode.height();

      // 只有当高度变化超过阈值时才更新，避免频繁更新
      if (element.height && Math.abs(newHeight - element.height) > 5) {
        onUpdate(element.id, { height: newHeight });
      }
    }
  }, [content, width, fontSize, fontFamily, element.id, element.height, onUpdate]);

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

export const CanvasRichText = CanvasRichTextComponent;

