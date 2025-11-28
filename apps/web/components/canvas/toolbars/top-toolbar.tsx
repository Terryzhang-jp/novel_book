/**
 * Top Toolbar - Enhanced with Functionality
 */

'use client';

import { Save, Download, ZoomIn, ZoomOut, Undo, Redo, FileText } from 'lucide-react';
import { useCanvasStore } from '@/lib/canvas/canvas-store';
import { useRef } from 'react';

export function TopToolbar() {
    const { undo, redo, historyIndex, history, zoom, setZoom, elements } = useCanvasStore();
    const stageRef = useRef<any>(null);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    // Export as PNG
    const handleExport = () => {
        // Get stage from global (we'll set this from CanvasStage)
        const stage = document.querySelector('canvas')?.parentElement as any;
        if (!stage) return;

        const dataURL = stage.toDataURL({ pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = 'canvas-creation.png';
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Save (placeholder - will integrate with Supabase later)
    const handleSave = () => {
        const data = {
            elements,
            timestamp: new Date().toISOString(),
        };
        console.log('Saving canvas:', data);
        // TODO: Save to Supabase
    };

    return (
        <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
            {/* Left: File Actions */}
            <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-sm font-medium hover:bg-gray-100 rounded-md flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Canvas Creation
                </button>
                <div className="w-px h-6 bg-gray-300" />
                <button
                    onClick={handleSave}
                    className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                    title="Save (Ctrl+S)"
                >
                    <Save className="w-4 h-4" />
                </button>
                <button
                    onClick={handleExport}
                    className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                    title="Export as PNG"
                >
                    <Download className="w-4 h-4" />
                </button>
            </div>

            {/* Center: History Controls */}
            <div className="flex items-center gap-2">
                <button
                    onClick={undo}
                    disabled={!canUndo}
                    className={`p-2 rounded-md transition-colors ${canUndo ? 'hover:bg-gray-100' : 'opacity-30 cursor-not-allowed'
                        }`}
                    title="Undo (Ctrl+Z)"
                >
                    <Undo className="w-4 h-4" />
                </button>
                <button
                    onClick={redo}
                    disabled={!canRedo}
                    className={`p-2 rounded-md transition-colors ${canRedo ? 'hover:bg-gray-100' : 'opacity-30 cursor-not-allowed'
                        }`}
                    title="Redo (Ctrl+Y)"
                >
                    <Redo className="w-4 h-4" />
                </button>
            </div>

            {/* Right: Zoom Controls */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
                    className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                    title="Zoom Out"
                >
                    <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-600 w-12 text-center">
                    {Math.round(zoom * 100)}%
                </span>
                <button
                    onClick={() => setZoom(Math.min(4, zoom + 0.25))}
                    className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                    title="Zoom In"
                >
                    <ZoomIn className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
