import type { Photo } from '@/types/storage';

export type PageTemplate =
    | 'hero'      // 1 photo: Full page immersive
    | 'split-v'   // 2 photos: Vertical split
    | 'split-h'   // 2 photos: Horizontal split
    | 'collage-3' // 3 photos: 1 big + 2 small
    | 'collage-4' // 4 photos: Grid
    | 'essay';    // 1 photo + text space

export interface MagazinePage {
    id: string;
    template: PageTemplate;
    photos: Photo[];
    title?: string;
    description?: string;
}

/**
 * Mook Layout Engine
 * Intelligently arranges photos into magazine-style pages.
 */
export class LayoutEngine {

    /**
     * Generates a magazine layout from a list of photos.
     */
    static generateLayout(photos: Photo[]): MagazinePage[] {
        const pages: MagazinePage[] = [];
        let currentPhotos = [...photos];

        // Sort by date to tell a chronological story
        currentPhotos.sort((a, b) => {
            const dateA = new Date(a.metadata.dateTime || a.createdAt).getTime();
            const dateB = new Date(b.metadata.dateTime || b.createdAt).getTime();
            return dateA - dateB;
        });

        while (currentPhotos.length > 0) {
            const page = this.createNextPage(currentPhotos);
            pages.push(page);
            // Remove used photos
            currentPhotos = currentPhotos.slice(page.photos.length);
        }

        return pages;
    }

    /**
     * Decides the best template for the next chunk of photos.
     */
    private static createNextPage(availablePhotos: Photo[]): MagazinePage {
        const remaining = availablePhotos.length;

        // 1. Hero Page (High priority for high-quality/landscape photos)
        // For now, we randomly assign Hero pages or if it's the very first page
        if (Math.random() > 0.8 || remaining === 1) {
            return {
                id: crypto.randomUUID(),
                template: 'hero',
                photos: [availablePhotos[0]],
                title: 'The Beginning', // Placeholder, could be derived from location/date
            };
        }

        // 2. Collage (3-4 photos)
        if (remaining >= 4 && Math.random() > 0.5) {
            return {
                id: crypto.randomUUID(),
                template: 'collage-4',
                photos: availablePhotos.slice(0, 4),
            };
        }

        if (remaining >= 3 && Math.random() > 0.5) {
            return {
                id: crypto.randomUUID(),
                template: 'collage-3',
                photos: availablePhotos.slice(0, 3),
            };
        }

        // 3. Split (2 photos)
        if (remaining >= 2) {
            const isVertical = Math.random() > 0.5;
            return {
                id: crypto.randomUUID(),
                template: isVertical ? 'split-v' : 'split-h',
                photos: availablePhotos.slice(0, 2),
            };
        }

        // Fallback to Hero if only 1 left (should be covered by first check but safe to have)
        return {
            id: crypto.randomUUID(),
            template: 'hero',
            photos: [availablePhotos[0]],
        };
    }
}
