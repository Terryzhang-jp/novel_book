/**
 * Canvas Photo Sidebar Component
 *
 * Collapsible left sidebar for selecting photos from user's gallery
 * - Toggle open/closed with smooth animation
 * - Grid view of photos with category filter
 * - Click to add photo to canvas center
 * - Infinite scroll for loading more photos
 * - Loading and empty states
 */

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import type { Photo, PhotoCategory, PhotoStats } from "@/types/storage";
import { CANVAS_CONFIG } from "@/types/storage";

const PAGE_SIZE = 50;

interface CanvasPhotoSidebarProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  onPhotoSelect: (photoUrl: string, width: number, height: number) => void;
}

export function CanvasPhotoSidebar({
  isOpen,
  onToggle,
  onPhotoSelect,
}: CanvasPhotoSidebarProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | "all">("all");
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false); // Sync loading flag to prevent race conditions
  const isMountedRef = useRef(false);

  // Fetch photos when category changes (including initial mount)
  useEffect(() => {
    // Skip the first mount since we'll handle it in the same effect
    if (!isMountedRef.current) {
      isMountedRef.current = true;
    }

    setPhotos([]);
    setOffset(0);
    setHasMore(true);
    fetchPhotos(true, 0);
  }, [selectedCategory]);

  const fetchPhotos = async (isInitial = false, customOffset?: number) => {
    // Prevent concurrent fetches using sync ref
    if (isLoadingRef.current && !isInitial) return;

    const currentOffset = customOffset ?? offset;
    isLoadingRef.current = true;

    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: currentOffset.toString(),
      });

      if (selectedCategory !== "all") {
        params.set("category", selectedCategory);
      }

      const response = await fetch(`/api/photos?${params}`);

      if (response.ok) {
        const data = await response.json();
        const newPhotos: Photo[] = data.photos || [];

        if (isInitial) {
          setPhotos(newPhotos);
        } else {
          // Deduplicate when appending
          setPhotos(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const uniqueNew = newPhotos.filter(p => !existingIds.has(p.id));
            return [...prev, ...uniqueNew];
          });
        }

        setStats(data.stats || null);
        setHasMore(newPhotos.length === PAGE_SIZE);
        setOffset(currentOffset + newPhotos.length);
      }
    } catch (error) {
      console.error("Failed to fetch photos:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  };

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    // Use ref for immediate check to prevent race conditions
    if (!container || isLoadingRef.current || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Load more when within 100px of bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchPhotos(false);
    }
  }, [hasMore, offset, selectedCategory]);

  // Photos are already filtered by category from API
  // No client-side filtering needed
  const filteredPhotos = photos;

  // Calculate total for current view
  const getTotalForCategory = () => {
    if (!stats) return photos.length;
    if (selectedCategory === "all") return stats.total;
    return stats.byCategory[selectedCategory] || 0;
  };

  // Handle photo click - load image to get dimensions, then add to canvas
  const handlePhotoClick = useCallback(
    (photo: Photo) => {
      const img = new window.Image();
      img.onload = () => {
        // Scale down if too large
        const maxWidth = CANVAS_CONFIG.MAX_IMAGE_WIDTH;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = img.width * scale;
        const height = img.height * scale;

        onPhotoSelect(photo.fileUrl, width, height);
      };
      img.onerror = () => {
        // Fallback with default dimensions
        onPhotoSelect(photo.fileUrl, 300, 300);
      };
      img.src = photo.fileUrl;
    },
    [onPhotoSelect]
  );

  // Category filter options
  const categories: Array<{ value: PhotoCategory | "all"; label: string; emoji: string }> = [
    { value: "all", label: "All", emoji: "🌟" },
    { value: "time-location", label: "Time+Loc", emoji: "📍⏰" },
    { value: "time-only", label: "Time", emoji: "⏰" },
    { value: "location-only", label: "Location", emoji: "📍" },
    { value: "neither", label: "Other", emoji: "📷" },
  ];

  return (
    <>
      {/* Toggle Button (when closed) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 p-3 bg-white/95 backdrop-blur-lg text-gray-700 rounded-r-xl shadow-lg hover:bg-gray-50 transition-all hover:scale-105 border border-l-0 border-gray-200"
          aria-label="Open photo gallery"
        >
          <div className="flex flex-col items-center gap-1">
            <ImageIcon className="w-5 h-5" />
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-40 bg-white/95 backdrop-blur-lg border-r border-gray-200 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: "280px" }}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-gray-900">Photo Gallery</h2>
            </div>
            <button
              type="button"
              onClick={() => onToggle(false)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close photo gallery"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Filter */}
        <div className="p-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  selectedCategory === cat.value
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span className="mr-1">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photos Grid */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
              <p className="text-sm text-gray-500">Loading photos...</p>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ImageIcon className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">
                {selectedCategory === "all"
                  ? "No photos yet"
                  : "No photos in this category"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Upload photos in the Gallery section
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {filteredPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => handlePhotoClick(photo)}
                    className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden transition-all group cursor-pointer hover:ring-2 hover:ring-blue-500 hover:shadow-lg"
                    title={`Add to canvas: ${photo.originalName || photo.fileName}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbnailUrl || photo.fileUrl}
                      alt={photo.originalName || photo.fileName}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-full">
                          Add
                        </div>
                      </div>
                    </div>

                    {/* Category badge */}
                    <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded">
                      {photo.category === "time-location" && "📍⏰"}
                      {photo.category === "time-only" && "⏰"}
                      {photo.category === "location-only" && "📍"}
                      {photo.category === "neither" && "📷"}
                    </div>
                  </button>
                ))}
              </div>

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                  <span className="text-sm text-gray-500">Loading more...</span>
                </div>
              )}

              {/* End of list indicator */}
              {!hasMore && filteredPhotos.length > 0 && (
                <div className="text-center py-4 text-xs text-gray-400">
                  All photos loaded
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with photo count */}
        <div className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <p className="text-xs text-gray-500 text-center">
            {filteredPhotos.length} / {getTotalForCategory()} photo{getTotalForCategory() !== 1 ? "s" : ""}
            {selectedCategory !== "all" && ` in ${selectedCategory.replace("-", " ")}`}
          </p>
        </div>
      </div>
    </>
  );
}
