/**
 * StickerLibrary Component
 * 
 * A modal/sidebar showing available stickers for adding to the document
 */

'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { STICKER_CATEGORIES, getStickersByCategory, searchStickers } from '@/lib/journal/stickers';
import type { Sticker } from './types';

interface StickerLibraryProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (sticker: Sticker) => void;
}

export function StickerLibrary({ isOpen, onClose, onSelect }: StickerLibraryProps) {
    const [selectedCategory, setSelectedCategory] = useState<string>(STICKER_CATEGORIES[0].id);
    const [searchQuery, setSearchQuery] = useState('');

    if (!isOpen) return null;

    const displayStickers = searchQuery
        ? searchStickers(searchQuery)
        : getStickersByCategory(selectedCategory);

    const handleStickerClick = (sticker: Sticker) => {
        onSelect(sticker);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[600px] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold">Sticker Library</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-accent rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search stickers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                </div>

                {/* Categories */}
                {!searchQuery && (
                    <div className="flex gap-2 p-4 border-b border-border overflow-x-auto">
                        {STICKER_CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`
                  px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors
                  ${selectedCategory === cat.id
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted hover:bg-accent'
                                    }
                `}
                            >
                                <span className="mr-2">{cat.icon}</span>
                                {cat.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Stickers Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="grid grid-cols-6 gap-2">
                        {displayStickers.map((sticker) => (
                            <button
                                key={sticker.id}
                                onClick={() => handleStickerClick(sticker)}
                                className="
                  aspect-square flex items-center justify-center
                  text-4xl hover:bg-accent rounded-md transition-colors
                  cursor-pointer
                "
                                title={sticker.label}
                            >
                                {sticker.content}
                            </button>
                        ))}
                    </div>

                    {displayStickers.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            No stickers found
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
