/**
 * Canvas Component Types
 */

export type ToolType = 'select' | 'brush' | 'text' | 'shape' | 'eraser' | 'eyedropper';

export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow' | 'star' | 'heart';

export interface CanvasElement {
    id: string;
    type: 'image' | 'text' | 'sticker' | 'shape' | 'drawing';
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    zIndex: number;
    data: Record<string, any>;
}

export interface ImageElementData {
    src: string;
    originalWidth: number;
    originalHeight: number;
}

export interface TextElementData {
    text: string;
    fontSize: number;
    fontFamily: string;
    fill: string;
    align: 'left' | 'center' | 'right';
    fontStyle: 'normal' | 'bold' | 'italic';
}

export interface ShapeElementData {
    shapeType: ShapeType;
    fill: string;
    stroke?: string;
    strokeWidth?: number;
}

export interface DrawingElementData {
    points: number[];
    stroke: string;
    strokeWidth: number;
    tension?: number;
}

export interface CanvasProject {
    id: string;
    userId: string;
    title: string;
    thumbnail?: string;
    canvasData: {
        width: number;
        height: number;
        backgroundColor: string;
        elements: CanvasElement[];
    };
    createdAt: string;
    updatedAt: string;
}
