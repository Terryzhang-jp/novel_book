import { useState } from 'react';
import { STICKER_CATEGORIES, getStickersByCategory } from '@/lib/journal/stickers';
import { X } from 'lucide-react';

interface StickerPickerProps {
    onSelect: (sticker: string) => void;
    onClose: () => void;
}

export function StickerPicker({ onSelect, onClose }: StickerPickerProps) {
    const [activeCategory, setActiveCategory] = useState<string>(STICKER_CATEGORIES[0].id);
    const stickers = getStickersByCategory(activeCategory);

    return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-80 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-gray-700">Add Sticker</h3>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
                >
                    <X className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            {/* Categories */}
            <div className="flex items-center gap-1 p-2 border-b border-gray-100 overflow-x-auto no-scrollbar">
                {STICKER_CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${activeCategory === cat.id
                            ? 'bg-blue-50 text-blue-600'
                            : 'hover:bg-gray-50 text-gray-600'
                            }`}
                    >
                        <span>{cat.icon}</span>
                        <span>{cat.name}</span>
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="p-3 grid grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                {stickers.map(sticker => (
                    <button
                        key={sticker.id}
                        onClick={() => onSelect(sticker.content)}
                        className="aspect-square flex items-center justify-center text-2xl hover:bg-gray-50 rounded-lg transition-transform hover:scale-110 active:scale-95"
                        title={sticker.label}
                    >
                        {sticker.content}
                    </button>
                ))}
            </div>
        </div>
    );
}
