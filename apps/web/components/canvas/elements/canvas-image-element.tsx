/**
 * CanvasImageElement Component
 *
 * Renders image elements on the canvas with support for:
 * - Drag and drop
 * - Transform (resize, rotate)
 * - Cross-origin loading
 */

"use client";

import { memo } from "react";
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type { CanvasElement } from "@/types/storage";
import Konva from "konva";

interface CanvasImageElementProps {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
}

function CanvasImageElementComponent({
  element,
  isSelected,
  onSelect,
  onUpdate,
}: CanvasImageElementProps) {
  // Load image with cross-origin support for external URLs
  const [image] = useImage(element.src || "", "anonymous");

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onUpdate(element.id, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    onUpdate(element.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(5, (element.width || 100) * scaleX),
      height: Math.max(5, (element.height || 100) * scaleY),
      rotation: node.rotation(),
    });

    // Reset scale after applying to width/height
    node.scaleX(1);
    node.scaleY(1);
  };

  if (!element.src) {
    return null;
  }

  return (
    <KonvaImage
      id={element.id}
      image={image}
      x={element.x}
      y={element.y}
      width={element.width}
      height={element.height}
      rotation={element.rotation || 0}
      opacity={element.opacity ?? 1}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
    />
  );
}

export const CanvasImageElement = memo(CanvasImageElementComponent);
