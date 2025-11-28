/**
 * DecorationRenderer Component
 * 
 * Renders individual decoration elements (stickers, text, shapes, drawings)
 */

'use client';

import type { DecorationElement } from '@/types/storage';
import type { TextBoxData, ShapeData, DrawingData } from './types';
import { Trash2, Move } from 'lucide-react';

interface DecorationRendererProps {
    element: DecorationElement;
    isSelected: boolean;
    isEditable: boolean;
    onUpdate: (updates: Partial<DecorationElement>) => void;
    onDelete: () => void;
    onDragStart: (e: React.MouseEvent) => void;
}

export function DecorationRenderer({
    element,
    isSelected,
    isEditable,
    onUpdate,
    onDelete,
    onDragStart,
}: DecorationRendererProps) {
    const { position, size, rotation, type, data } = element;

    // Render content based on type
    const renderContent = () => {
        switch (type) {
            case 'sticker':
                return <StickerRenderer data={data} />;
            case 'text':
                return <TextBoxRenderer data={data as TextBoxData} size={size} />;
            case 'shape':
                return <ShapeRenderer data={data as ShapeData} size={size} />;
            case 'drawing':
                return <DrawingRenderer data={data as DrawingData} size={size} />;
            default:
                return null;
        }
    };

    return (
        <div
            className="absolute pointer-events-auto group"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: size.width ? `${size.width}px` : 'auto',
                height: size.height ? `${size.height}px` : 'auto',
                transform: `rotate(${rotation}deg)`,
                zIndex: element.zIndex,
                cursor: isEditable ? 'move' : 'default',
            }}
            onMouseDown={isEditable ? onDragStart : undefined}
        >
            {/* Content */}
            <div
                className={`
          relative w-full h-full
          ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
          ${isEditable ? 'hover:ring-2 hover:ring-blue-300' : ''}
        `}
            >
                {renderContent()}

                {/* Edit controls (only show when editable and selected) */}
                {isEditable && isSelected && (
                    <div className="absolute -top-8 right-0 flex items-center gap-1 bg-white rounded-md shadow-lg border border-gray-200 p-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="p-1 hover:bg-red-50 rounded text-red-600"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Drag handle indicator */}
                {isEditable && (
                    <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Move className="w-3 h-3 text-gray-400" />
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Sticker Renderer
 */
function StickerRenderer({ data }: { data: any }) {
    const { type, content } = data;

    if (type === 'emoji') {
        return (
            <div className="text-4xl select-none" style={{ lineHeight: 1 }}>
                {content}
            </div>
        );
    }

    if (type === 'svg') {
        return (
            <div
                className="w-full h-full"
                dangerouslySetInnerHTML={{ __html: content }}
            />
        );
    }

    if (type === 'image') {
        return (
            <img
                src={content}
                alt="Sticker"
                className="w-full h-full object-contain"
                draggable={false}
            />
        );
    }

    return null;
}

/**
 * Text Box Renderer
 */
function TextBoxRenderer({ data, size }: { data: TextBoxData; size: { width: number; height: number } }) {
    return (
        <div
            className="w-full h-full px-2 py-1 select-none"
            style={{
                fontSize: `${data.fontSize}px`,
                fontFamily: data.fontFamily,
                color: data.color,
                backgroundColor: data.backgroundColor || 'transparent',
                border: data.borderColor ? `2px solid ${data.borderColor}` : 'none',
                minWidth: '100px',
                minHeight: '30px',
                wordBreak: 'break-word',
            }}
        >
            {data.text}
        </div>
    );
}

/**
 * Shape Renderer
 */
function ShapeRenderer({ data, size }: { data: ShapeData; size: { width: number; height: number } }) {
    const { shape, fillColor, strokeColor, strokeWidth } = data;

    const renderShape = () => {
        switch (shape) {
            case 'circle':
                return (
                    <svg width={size.width} height={size.height} viewBox="0 0 100 100">
                        <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill={fillColor}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth || 2}
                        />
                    </svg>
                );
            case 'rectangle':
                return (
                    <svg width={size.width} height={size.height} viewBox="0 0 100 100">
                        <rect
                            x="5"
                            y="5"
                            width="90"
                            height="90"
                            fill={fillColor}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth || 2}
                            rx="5"
                        />
                    </svg>
                );
            case 'heart':
                return (
                    <svg width={size.width} height={size.height} viewBox="0 0 100 100">
                        <path
                            d="M50,90 C50,90 10,60 10,35 C10,20 20,10 30,10 C40,10 50,20 50,20 C50,20 60,10 70,10 C80,10 90,20 90,35 C90,60 50,90 50,90 Z"
                            fill={fillColor}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth || 2}
                        />
                    </svg>
                );
            case 'star':
                return (
                    <svg width={size.width} height={size.height} viewBox="0 0 100 100">
                        <path
                            d="M50,10 L61,40 L92,40 L68,60 L78,90 L50,70 L22,90 L32,60 L8,40 L39,40 Z"
                            fill={fillColor}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth || 2}
                        />
                    </svg>
                );
            case 'line':
                return (
                    <svg width={size.width} height={size.height} viewBox="0 0 100 10">
                        <line
                            x1="0"
                            y1="5"
                            x2="100"
                            y2="5"
                            stroke={fillColor}
                            strokeWidth={strokeWidth || 3}
                        />
                    </svg>
                );
            default:
                return null;
        }
    };

    return <div className="w-full h-full">{renderShape()}</div>;
}

/**
 * Drawing Renderer (SVG Path)
 */
function DrawingRenderer({ data, size }: { data: DrawingData; size: { width: number; height: number } }) {
    return (
        <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
            <path
                d={data.path}
                fill="none"
                stroke={data.strokeColor}
                strokeWidth={data.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
