'use client';

import { useEffect, useState } from 'react';
import type { Photo } from '@/types/storage';
import { LayoutEngine, type MagazinePage } from '@/lib/mook/layout-engine';
import { cn } from '@/lib/utils';
import { MapPin, Calendar } from 'lucide-react';

interface MagazineViewProps {
    photos: Photo[];
    onClose: () => void;
}

export function MagazineView({ photos, onClose }: MagazineViewProps) {
    const [pages, setPages] = useState<MagazinePage[]>([]);

    useEffect(() => {
        const generatedPages = LayoutEngine.generateLayout(photos);
        setPages(generatedPages);
    }, [photos]);

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* Header */}
            <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-xl sticky top-0 z-20">
                <div className="font-serif font-bold text-xl tracking-tight">MOOK VIEW</div>
                <button
                    onClick={onClose}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
                >
                    Close
                </button>
            </div>

            {/* Magazine Scroll Container */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden snap-y snap-mandatory">
                {pages.map((page, index) => (
                    <div key={page.id} className="snap-start min-h-[calc(100vh-3.5rem)] w-full flex items-center justify-center p-4 md:p-8 bg-muted/10">
                        <PageRenderer page={page} pageNumber={index + 1} />
                    </div>
                ))}

                {/* End Cover */}
                <div className="snap-start min-h-[50vh] w-full flex flex-col items-center justify-center p-8 text-center">
                    <h2 className="font-serif text-3xl font-bold mb-2">The End</h2>
                    <p className="text-muted-foreground font-light">Created with Novel Mook Engine</p>
                </div>
            </div>
        </div>
    );
}

function PageRenderer({ page, pageNumber }: { page: MagazinePage; pageNumber: number }) {
    return (
        <div className="w-full max-w-5xl aspect-[3/4] md:aspect-[4/3] bg-card shadow-2xl rounded-sm overflow-hidden relative flex flex-col">
            {/* Page Content based on Template */}
            <div className="flex-1 relative">
                {page.template === 'hero' && <HeroTemplate page={page} />}
                {page.template === 'split-v' && <SplitVTemplate page={page} />}
                {page.template === 'split-h' && <SplitHTemplate page={page} />}
                {page.template === 'collage-3' && <Collage3Template page={page} />}
                {page.template === 'collage-4' && <Collage4Template page={page} />}
            </div>

            {/* Footer / Page Number */}
            <div className="h-8 md:h-12 bg-background border-t border-border/20 flex items-center justify-between px-6 text-[10px] md:text-xs text-muted-foreground font-mono uppercase tracking-widest">
                <span>{new Date(page.photos[0].metadata.dateTime || page.photos[0].createdAt).toLocaleDateString()}</span>
                <span>Page {pageNumber}</span>
                <span>{page.photos[0].metadata.location ? 'Location Data' : 'No Location'}</span>
            </div>
        </div>
    );
}

// --- Templates ---

function HeroTemplate({ page }: { page: MagazinePage }) {
    const photo = page.photos[0];
    return (
        <div className="w-full h-full relative group">
            <img
                src={photo.fileUrl}
                alt="Hero"
                className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 flex flex-col justify-end p-8 md:p-12">
                <h2 className="text-white font-serif text-4xl md:text-6xl font-bold mb-4 translate-y-4 group-hover:translate-y-0 transition-transform duration-700">
                    {page.title || 'Moment in Time'}
                </h2>
                {photo.metadata.location && (
                    <div className="flex items-center gap-2 text-white/80 text-sm uppercase tracking-widest">
                        <MapPin className="w-4 h-4" />
                        <span>{photo.metadata.location.latitude.toFixed(2)}°N, {photo.metadata.location.longitude.toFixed(2)}°E</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function SplitVTemplate({ page }: { page: MagazinePage }) {
    return (
        <div className="w-full h-full flex">
            <div className="w-1/2 h-full border-r border-white/20">
                <img src={page.photos[0].fileUrl} className="w-full h-full object-cover" alt="Split 1" />
            </div>
            <div className="w-1/2 h-full">
                <img src={page.photos[1].fileUrl} className="w-full h-full object-cover" alt="Split 2" />
            </div>
        </div>
    );
}

function SplitHTemplate({ page }: { page: MagazinePage }) {
    return (
        <div className="w-full h-full flex flex-col">
            <div className="h-1/2 w-full border-b border-white/20">
                <img src={page.photos[0].fileUrl} className="w-full h-full object-cover" alt="Split 1" />
            </div>
            <div className="h-1/2 w-full">
                <img src={page.photos[1].fileUrl} className="w-full h-full object-cover" alt="Split 2" />
            </div>
        </div>
    );
}

function Collage3Template({ page }: { page: MagazinePage }) {
    return (
        <div className="w-full h-full grid grid-cols-2 gap-1 p-1 bg-background">
            <div className="row-span-2 relative">
                <img src={page.photos[0].fileUrl} className="w-full h-full object-cover" alt="Main" />
            </div>
            <div className="relative">
                <img src={page.photos[1].fileUrl} className="w-full h-full object-cover" alt="Sub 1" />
            </div>
            <div className="relative">
                <img src={page.photos[2].fileUrl} className="w-full h-full object-cover" alt="Sub 2" />
            </div>
        </div>
    );
}

function Collage4Template({ page }: { page: MagazinePage }) {
    return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-1 p-1 bg-background">
            {page.photos.map((photo) => (
                <div key={photo.id} className="relative">
                    <img src={photo.fileUrl} className="w-full h-full object-cover" alt="Grid" />
                </div>
            ))}
        </div>
    );
}
