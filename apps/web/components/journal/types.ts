/**
 * Journal/Scrapbook Component Types
 * 
 * Type definitions for decoration layer functionality
 */

import type { DecorationElement } from '@/types/storage';

/**
 * Sticker data structure
 */
export interface Sticker {
    id: string;
    type: 'emoji' | 'svg' | 'image';
    content: string;  // emoji character, SVG string, or image URL
    label: string;
    category: string;
}

/**
 * Text box decoration data
 */
export interface TextBoxData {
    text: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    backgroundColor?: string;
    borderColor?: string;
}

/**
 * Shape decoration data
 */
export interface ShapeData {
    shape: 'circle' | 'rectangle' | 'line' | 'heart' | 'star';
    fillColor: string;
    strokeColor?: string;
    strokeWidth?: number;
}

/**
 * Drawing decoration data (SVG path)
 */
export interface DrawingData {
    path: string;  // SVG path data
    strokeColor: string;
    strokeWidth: number;
}

/**
 * Decoration toolbar action types
 */
export type ToolbarAction =
    | { type: 'add-sticker' }
    | { type: 'add-text' }
    | { type: 'add-shape'; shape: ShapeData['shape'] }
    | { type: 'delete' }
    | { type: 'bring-forward' }
    | { type: 'send-backward' }
    | { type: 'rotate'; angle: number };

/**
 * Decoration layer props
 */
export interface DecorationLayerProps {
    decorations: DecorationElement[];
    onUpdate: (decorations: DecorationElement[]) => void;
    isEditable: boolean;
    selectedId?: string;
    onSelect?: (id: string | null) => void;
}

/**
 * Decoration renderer props
 */
export interface DecorationRendererProps {
    element: DecorationElement;
    isSelected: boolean;
    isEditable: boolean;
    onUpdate: (updates: Partial<DecorationElement>) => void;
    onDelete: () => void;
}
