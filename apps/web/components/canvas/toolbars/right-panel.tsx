/**
 * Right Panel - Enhanced with Layer Management
 */

'use client';

import { Layers, Trash2, Eye, EyeOff } from 'lucide-react';
import { useCanvasStore } from '@/lib/canvas/canvas-store';

interface RightPanelProps {
    selectedElement: string | null;
}

export function RightPanel({ selectedElement }: RightPanelProps) {
    const { elements, updateElement, deleteElement, setSelectedId } = useCanvasStore();

    // Sort by zIndex (top to bottom)
    const sortedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex);

    const getElementLabel = (el: any) => {
        switch (el.type) {
            case 'text': return `Text: ${el.data.text.substring(0, 15)}...`;
            case 'drawing': return 'Drawing';
            case 'shape': return `Shape: ${el.data.shapeType}`;
            case 'image': return 'Image';
            default: return 'Element';
        }
    };

    return (
        <div className="w-64 bg-white border-l border-gray-200 flex flex-col">
            {/* Layers Header */}
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <Layers className="w-4 h-4" />
                    Layers ({elements.length})
                </div>
            </div>

            {/* Layers List */}
            <div className="flex-1 overflow-y-auto p-2">
                {sortedElements.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm mt-8">
                        No layers yet
                        <div className="text-xs mt-2">Use tools to add elements</div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {sortedElements.map((el, index) => (
                            <div
                                key={el.id}
                                onClick={() => setSelectedId(el.id)}
                                className={`
                  p-2 rounded-md cursor-pointer transition-all
                  ${selectedElement === el.id
                                        ? 'bg-blue-50 border border-blue-200'
                                        : 'hover:bg-gray-50 border border-transparent'
                                    }
                `}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium truncate">
                                            {getElementLabel(el)}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            Layer {sortedElements.length - index}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteElement(el.id);
                                        }}
                                        className="p1 hover:bg-red-50 rounded text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Properties Panel */}
            {selectedElement && (() => {
                const element = elements.find(el => el.id === selectedElement);
                if (!element) return null;

                return (
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                        <div className="text-xs font-semibold mb-3 text-gray-700">Properties</div>
                        <div className="space-y-3 text-xs">
                            {/* Opacity */}
                            <div>
                                <label className="text-gray-600 block mb-1">
                                    Opacity ({Math.round(element.opacity * 100)}%)
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={element.opacity * 100}
                                    onChange={(e) => {
                                        updateElement(element.id, {
                                            opacity: parseInt(e.target.value) / 100,
                                        });
                                    }}
                                    className="w-full accent-blue-600"
                                />
                            </div>

                            {/* Rotation */}
                            <div>
                                <label className="text-gray-600 block mb-1">
                                    Rotation ({Math.round(element.rotation)}°)
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    value={element.rotation}
                                    onChange={(e) => {
                                        updateElement(element.id, {
                                            rotation: parseInt(e.target.value),
                                        });
                                    }}
                                    className="w-full accent-blue-600"
                                />
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
