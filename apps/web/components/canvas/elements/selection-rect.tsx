/**
 * SelectionRect Component
 *
 * Renders a dashed rectangle during marquee selection.
 * Used to visualize the selection area when the user drags on the canvas.
 */

"use client";

import { Rect } from "react-konva";

interface SelectionRectProps {
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
}

export function SelectionRect({ rect }: SelectionRectProps) {
    if (!rect || (rect.width < 2 && rect.height < 2)) {
        return null;
    }

    return (
        <Rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            stroke="#3b82f6"
            strokeWidth={1}
            dash={[6, 3]}
            fill="rgba(59, 130, 246, 0.1)"
            listening={false}
        />
    );
}
