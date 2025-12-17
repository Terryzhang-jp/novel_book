/**
 * Sticker Data Library
 * 
 * Built-in stickers for canvas/journal features
 */

/**
 * Sticker type definition
 */
export interface Sticker {
    id: string;
    type: 'emoji' | 'svg' | 'image';
    content: string;  // emoji character, SVG string, or image URL
    label: string;
    category: string;
}

export const STICKER_CATEGORIES = [
    {
        id: 'emoji',
        name: 'Emoji',
        icon: '😊',
    },
    {
        id: 'nature',
        name: 'Nature',
        icon: '🌸',
    },
    {
        id: 'objects',
        name: 'Objects',
        icon: '📌',
    },
    {
        id: 'symbols',
        name: 'Symbols',
        icon: '⭐',
    },
] as const;

export const STICKERS: Record<string, Sticker[]> = {
    emoji: [
        { id: 'e1', type: 'emoji', content: '✨', label: 'Sparkles', category: 'emoji' },
        { id: 'e2', type: 'emoji', content: '💖', label: 'Heart', category: 'emoji' },
        { id: 'e3', type: 'emoji', content: '🌟', label: 'Star', category: 'emoji' },
        { id: 'e4', type: 'emoji', content: '🎉', label: 'Party', category: 'emoji' },
        { id: 'e5', type: 'emoji', content: '💕', label: 'Hearts', category: 'emoji' },
        { id: 'e6', type: 'emoji', content: '🌈', label: 'Rainbow', category: 'emoji' },
        { id: 'e7', type: 'emoji', content: '☀️', label: 'Sun', category: 'emoji' },
        { id: 'e8', type: 'emoji', content: '🌙', label: 'Moon', category: 'emoji' },
        { id: 'e9', type: 'emoji', content: '⭐', label: 'Star 2', category: 'emoji' },
        { id: 'e10', type: 'emoji', content: '💫', label: 'Dizzy', category: 'emoji' },
        { id: 'e11', type: 'emoji', content: '🎈', label: 'Balloon', category: 'emoji' },
        { id: 'e12', type: 'emoji', content: '🎀', label: 'Ribbon', category: 'emoji' },
    ],
    nature: [
        { id: 'n1', type: 'emoji', content: '🌸', label: 'Cherry Blossom', category: 'nature' },
        { id: 'n2', type: 'emoji', content: '🌺', label: 'Hibiscus', category: 'nature' },
        { id: 'n3', type: 'emoji', content: '🌻', label: 'Sunflower', category: 'nature' },
        { id: 'n4', type: 'emoji', content: '🌹', label: 'Rose', category: 'nature' },
        { id: 'n5', type: 'emoji', content: '🌷', label: 'Tulip', category: 'nature' },
        { id: 'n6', type: 'emoji', content: '🍀', label: 'Clover', category: 'nature' },
        { id: 'n7', type: 'emoji', content: '🌿', label: 'Herb', category: 'nature' },
        { id: 'n8', type: 'emoji', content: '🍂', label: 'Leaves', category: 'nature' },
        { id: 'n9', type: 'emoji', content: '🦋', label: 'Butterfly', category: 'nature' },
        { id: 'n10', type: 'emoji', content: '🐝', label: 'Bee', category: 'nature' },
        { id: 'n11', type: 'emoji', content: '🌲', label: 'Tree', category: 'nature' },
        { id: 'n12', type: 'emoji', content: '🌵', label: 'Cactus', category: 'nature' },
    ],
    objects: [
        { id: 'o1', type: 'emoji', content: '📌', label: 'Pin', category: 'objects' },
        { id: 'o2', type: 'emoji', content: '📍', label: 'Location', category: 'objects' },
        { id: 'o3', type: 'emoji', content: '✂️', label: 'Scissors', category: 'objects' },
        { id: 'o4', type: 'emoji', content: '📎', label: 'Paperclip', category: 'objects' },
        { id: 'o5', type: 'emoji', content: '📝', label: 'Note', category: 'objects' },
        { id: 'o6', type: 'emoji', content: '✏️', label: 'Pencil', category: 'objects' },
        { id: 'o7', type: 'emoji', content: '🖊️', label: 'Pen', category: 'objects' },
        { id: 'o8', type: 'emoji', content: '📚', label: 'Books', category: 'objects' },
        { id: 'o9', type: 'emoji', content: '📷', label: 'Camera', category: 'objects' },
        { id: 'o10', type: 'emoji', content: '✉️', label: 'Letter', category: 'objects' },
        { id: 'o11', type: 'emoji', content: '🎨', label: 'Palette', category: 'objects' },
        { id: 'o12', type: 'emoji', content: '🔖', label: 'Bookmark', category: 'objects' },
    ],
    symbols: [
        { id: 's1', type: 'emoji', content: '⭐', label: 'Star', category: 'symbols' },
        { id: 's2', type: 'emoji', content: '❤️', label: 'Heart', category: 'symbols' },
        { id: 's3', type: 'emoji', content: '💛', label: 'Yellow Heart', category: 'symbols' },
        { id: 's4', type: 'emoji', content: '💚', label: 'Green Heart', category: 'symbols' },
        { id: 's5', type: 'emoji', content: '💙', label: 'Blue Heart', category: 'symbols' },
        { id: 's6', type: 'emoji', content: '💜', label: 'Purple Heart', category: 'symbols' },
        { id: 's7', type: 'emoji', content: '☑️', label: 'Check', category: 'symbols' },
        { id: 's8', type: 'emoji', content: '✅', label: 'Check Mark', category: 'symbols' },
        { id: 's9', type: 'emoji', content: '❌', label: 'X', category: 'symbols' },
        { id: 's10', type: 'emoji', content: '➡️', label: 'Arrow', category: 'symbols' },
        { id: 's11', type: 'emoji', content: '🔺', label: 'Triangle', category: 'symbols' },
        { id: 's12', type: 'emoji', content: '🔶', label: 'Diamond', category: 'symbols' },
    ],
};

/**
 * Get all stickers for a category
 */
export function getStickersByCategory(categoryId: string): Sticker[] {
    return STICKERS[categoryId] || [];
}

/**
 * Get all stickers
 */
export function getAllStickers(): Sticker[] {
    return Object.values(STICKERS).flat();
}

/**
 * Search stickers by label
 */
export function searchStickers(query: string): Sticker[] {
    const lowerQuery = query.toLowerCase();
    return getAllStickers().filter(sticker =>
        sticker.label.toLowerCase().includes(lowerQuery)
    );
}
