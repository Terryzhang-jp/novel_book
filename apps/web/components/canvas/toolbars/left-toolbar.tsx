/**
 * Left Toolbar - Enhanced with Tool Actions
 */

'use client';

import { MousePointer2, Paintbrush, Type, Square, Eraser, Pipette } from 'lucide-react';
import type { ToolType } from '../types';
import { useCanvasStore } from '@/lib/canvas/canvas-store';
import { v4 as uuidv4 } from 'uuid';

interface LeftToolbarProps {
    selectedTool: string;
    onToolSelect: (tool: ToolType) => void;
}

const tools: { id: ToolType; icon: any; label: string; shortcut: string }[] = [
    { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
    { id: 'brush', icon: Paintbrush, label: 'Brush', shortcut: 'B' },
    { id: 'text', icon: Type, label: 'Text', shortcut: 'T' },
    { id: 'shape', icon: Square, label: 'Shape', shortcut: 'S' },
    { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
    { id: 'eyedropper', icon: Pipette, label: 'Eyedropper', shortcut: 'I' },
];

export function LeftToolbar({ selectedTool, onToolSelect }: LeftToolbarProps) {
    const { addElement, elements } = useCanvasStore();

    const handleToolClick = (toolId: ToolType) => {
        onToolSelect(toolId);

        // Auto-add elements for certain tools
        if (toolId === 'text') {
            // Add a text element
            addElement({
                id: uuidv4(),
                type: 'text',
                x: 200,
                y: 200,
                width: 200,
                height: 50,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                zIndex: elements.length,
                data: {
                    text: 'Double click to edit',
                    fontSize: 24,
                    fontFamily: 'Arial',
                    fill: '#000000',
                    align: 'left',
                    fontStyle: 'normal',
                },
            });
        } else if (toolId === 'shape') {
            // Add a rectangle shape
            addElement({
                id: uuidv4(),
                type: 'shape',
                x: 300,
                y: 300,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                zIndex: elements.length,
                data: {
                    shapeType: 'rectangle',
                    fill: '#FFD700',
                    stroke: '#FFA500',
                    strokeWidth: 2,
                },
            });
        }
    };

    return (
        <div className="w-16 bg-gray-900 flex flex-col items-center py-4 gap-2">
            {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                    <button
                        key={tool.id}
                        onClick={() => handleToolClick(tool.id)}
                        className={`
              w-12 h-12 rounded-lg flex items-center justify-center
              transition-all duration-200 relative group
              ${selectedTool === tool.id
                                ? 'bg-blue-600 text-white shadow-lg scale-110'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:scale-105'
                            }
            `}
                        title={`${tool.label} (${tool.shortcut})`}
                    >
                        <Icon className="w-5 h-5" />

                        {/* Tooltip */}
                        <div className="absolute left-full ml-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                            {tool.label}
                            <div className="text-gray-400 text-xs mt-0.5">{tool.shortcut}</div>
                        </div>

                        {/* Active indicator */}
                        {selectedTool === tool.id && (
                            <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-400 rounded-l-full" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
