/**
 * DecorationLayer Component
 * 
 * A layer overlaid on the document editor for journal/scrapbook decorations.
 * Supports adding, moving, resizing, and managing stickers, text boxes, and shapes.
 */

'use client';

import { useState } from 'react';
import type { DecorationElement } from '@/types/storage';
import type { DecorationLayerProps } from './types';
import { DecorationRenderer } from './decoration-renderer';

export function DecorationLayer({
    decorations,
    onUpdate,
    isEditable,
    selectedId,
    onSelect,
}: DecorationLayerProps) {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Handle element updates
    const handleElementUpdate = (id: string, updates: Partial<DecorationElement>) => {
        const updatedDecorations = decorations.map(dec =>
            dec.id === id ? { ...dec, ...updates } : dec
        );
        onUpdate(updatedDecorations);
    };

    // Handle element deletion
    const handleElementDelete = (id: string) => {
        const filtered = decorations.filter(dec => dec.id !== id);
        onUpdate(filtered);
        if (selectedId === id) {
            onSelect?.(null);
        }
    };

    // Handle drag start
    const handleDragStart = (id: string, e: React.MouseEvent) => {
        if (!isEditable) return;

        const element = decorations.find(dec => dec.id === id);
        if (!element) return;

        // Calculate offset from element position to mouse position
        setDraggedId(id);
        setDragOffset({
            x: e.clientX - element.position.x,
            y: e.clientY - element.position.y,
        });
        onSelect?.(id);

        // Prevent text selection while dragging
        e.preventDefault();
    };

    // Handle drag move
    const handleDragMove = (e: React.MouseEvent) => {
        if (!draggedId || !isEditable) return;

        const newPosition = {
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y,
        };

        handleElementUpdate(draggedId, { position: newPosition });
    };

    // Handle drag end
    const handleDragEnd = () => {
        setDraggedId(null);
    };

    // Sort decorations by zIndex
    const sortedDecorations = [...decorations].sort((a, b) => a.zIndex - b.zIndex);

    return (
        <div
            className="absolute inset-0 pointer-events-none z-10"
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
        >
            {sortedDecorations.map((element) => (
                <DecorationRenderer
                    key={element.id}
                    element={element}
                    isSelected={selectedId === element.id}
                    isEditable={isEditable}
                    onUpdate={(updates) => handleElementUpdate(element.id, updates)}
                    onDelete={() => handleElementDelete(element.id)}
                    onDragStart={(e) => handleDragStart(element.id, e)}
                />
            ))}
        </div>
    );
}
