/**
 * DecorationToolbar Component
 * 
 * Toolbar for adding and managing decorations
 */

'use client';

import { Smile, Type, Square, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { ToolbarAction } from './types';

interface DecorationToolbarProps {
    selectedElement: any | null;
    onAction: (action: ToolbarAction) => void;
}

export function DecorationToolbar({ selectedElement, onAction }: DecorationToolbarProps) {
    return (
        <div className="flex items-center gap-2 p-2 bg-white border border-border rounded-lg shadow-lg">
            {/* Add Tools */}
            <div className="flex items-center gap-1 pr-2 border-r border-border">
                <button
                    onClick={() => onAction({ type: 'add-sticker' })}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Add Sticker"
                >
                    <Smile className="w-5 h-5" />
                </button>
                <button
                    onClick={() => onAction({ type: 'add-text' })}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Add Text Box"
                >
                    <Type className="w-5 h-5" />
                </button>
                <button
                    onClick={() => onAction({ type: 'add-shape', shape: 'circle' })}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Add Shape"
                >
                    <Square className="w-5 h-5" />
                </button>
            </div>

            {/* Element Controls (only show when element is selected) */}
            {selectedElement && (
                <div className="flex items-center gap-1 pl-2">
                    <button
                        onClick={() => onAction({ type: 'bring-forward' })}
                        className="p-2 hover:bg-accent rounded-md transition-colors"
                        title="Bring Forward"
                    >
                        <ArrowUp className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => onAction({ type: 'send-backward' })}
                        className="p-2 hover:bg-accent rounded-md transition-colors"
                        title="Send Backward"
                    >
                        <ArrowDown className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => onAction({ type: 'delete' })}
                        className="p-2 hover:bg-red-50 rounded-md transition-colors text-red-600"
                        title="Delete"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
}
