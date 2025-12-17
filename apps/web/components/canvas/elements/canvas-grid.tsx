/**
 * CanvasGrid Component
 *
 * Renders a soft dot grid overlay for the infinite canvas.
 * Creates a gentle, non-intrusive guide that feels like quality paper.
 *
 * Features:
 * - Soft dot pattern instead of harsh lines
 * - Warm color tone matching paper background
 * - Responsive to viewport pan/zoom
 * - Only renders visible dots
 */

"use client";

import { useMemo, memo } from "react";
import { Circle, Line } from "react-konva";
import type { CanvasViewport } from "@/types/storage";

// 点阵配置
const DOT_GRID_SIZE = 40; // 点之间的间距
const DOT_RADIUS = 1.5; // 点的半径
const DOT_COLOR = "#d4cfc7"; // 温暖的浅棕色

interface CanvasGridProps {
  viewport: CanvasViewport;
  stageWidth: number;
  stageHeight: number;
}

function CanvasGridComponent({
  viewport,
  stageWidth,
  stageHeight,
}: CanvasGridProps) {
  // Memoize dots to prevent expensive recalculations
  const gridDots = useMemo(() => {
    const dots: JSX.Element[] = [];
    const { x, y, zoom } = viewport;

    // 计算可见区域的世界坐标边界
    const padding = DOT_GRID_SIZE * 2;
    const startX = Math.floor((-x / zoom - padding) / DOT_GRID_SIZE) * DOT_GRID_SIZE;
    const endX = Math.ceil((-x / zoom + stageWidth / zoom + padding) / DOT_GRID_SIZE) * DOT_GRID_SIZE;
    const startY = Math.floor((-y / zoom - padding) / DOT_GRID_SIZE) * DOT_GRID_SIZE;
    const endY = Math.ceil((-y / zoom + stageHeight / zoom + padding) / DOT_GRID_SIZE) * DOT_GRID_SIZE;

    // 限制渲染的点数量以保持性能
    const maxDots = 2000;
    let dotCount = 0;

    for (let xPos = startX; xPos <= endX && dotCount < maxDots; xPos += DOT_GRID_SIZE) {
      for (let yPos = startY; yPos <= endY && dotCount < maxDots; yPos += DOT_GRID_SIZE) {
        dots.push(
          <Circle
            key={`dot-${xPos}-${yPos}`}
            x={xPos}
            y={yPos}
            radius={DOT_RADIUS / zoom}
            fill={DOT_COLOR}
            listening={false}
            perfectDrawEnabled={false}
          />
        );
        dotCount++;
      }
    }

    return dots;
  }, [viewport.x, viewport.y, viewport.zoom, stageWidth, stageHeight]);

  // 原点标记 - 更柔和的设计
  const originMarker = useMemo(() => {
    const { zoom } = viewport;
    const markerSize = 15 / zoom;
    const strokeWidth = 1.5 / zoom;

    return [
      // 水平线
      <Line
        key="origin-x"
        points={[-markerSize, 0, markerSize, 0]}
        stroke="#c4b5a0"
        strokeWidth={strokeWidth}
        opacity={0.6}
        listening={false}
      />,
      // 垂直线
      <Line
        key="origin-y"
        points={[0, -markerSize, 0, markerSize]}
        stroke="#c4b5a0"
        strokeWidth={strokeWidth}
        opacity={0.6}
        listening={false}
      />,
      // 中心点
      <Circle
        key="origin-center"
        x={0}
        y={0}
        radius={3 / zoom}
        fill="#c4b5a0"
        opacity={0.6}
        listening={false}
      />,
    ];
  }, [viewport.zoom]);

  return (
    <>
      {gridDots}
      {originMarker}
    </>
  );
}

export const CanvasGrid = memo(CanvasGridComponent);
