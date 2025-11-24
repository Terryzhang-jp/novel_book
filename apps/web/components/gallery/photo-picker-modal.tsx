"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { PhotoGrid } from "@/components/gallery/photo-grid";
import type { Photo } from "@/types/storage";

interface PhotoPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (photo: Photo) => void;
}

const PAGE_SIZE = 50;

export function PhotoPickerModal({ isOpen, onClose, onSelect }: PhotoPickerModalProps) {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const [userId, setUserId] = useState<string>("");
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    // Fetch photos
    const fetchPhotos = async (reset = false) => {
        try {
            if (reset) {
                setLoading(true);
                setOffset(0);
                setHasMore(true);
            } else {
                setLoadingMore(true);
            }

            const currentOffset = reset ? 0 : offset;
            const response = await fetch(`/api/photos?limit=${PAGE_SIZE}&offset=${currentOffset}&sortOrder=newest`);

            if (!response.ok) throw new Error("Failed to fetch photos");

            const data = await response.json();

            if (reset) {
                setPhotos(data.photos);
                setUserId(data.userId);
            } else {
                setPhotos(prev => [...prev, ...data.photos]);
            }

            setHasMore(data.photos.length === PAGE_SIZE);
            setOffset(currentOffset + data.photos.length);
        } catch (error) {
            console.error("Error fetching photos:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchPhotos(true);
        }
    }, [isOpen]);

    // Infinite scroll
    useEffect(() => {
        if (!isOpen) return;

        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                const target = entries[0];
                if (target.isIntersecting && hasMore && !loadingMore && !loading) {
                    fetchPhotos(false);
                }
            },
            { threshold: 0.1 }
        );

        if (loadMoreRef.current) {
            observerRef.current.observe(loadMoreRef.current);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [hasMore, loadingMore, loading, offset, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-background w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-xl font-semibold">Select a Photo</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-accent rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                            <PhotoGrid
                                photos={photos}
                                userId={userId}
                                onPhotoClick={(photoId) => {
                                    const photo = photos.find(p => p.id === photoId);
                                    if (photo) onSelect(photo);
                                }}
                            />

                            {/* Load More / End */}
                            <div ref={loadMoreRef} className="py-8 flex justify-center">
                                {loadingMore && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}
                                {!hasMore && photos.length > 0 && (
                                    <p className="text-sm text-muted-foreground">No more photos</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
