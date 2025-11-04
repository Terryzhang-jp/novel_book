/**
 * Photo Sidebar Component
 *
 * Collapsible sidebar showing user's photo gallery in document editor
 * - Toggle open/closed
 * - Grid view of photos
 * - Click to insert into document
 * - Category filter
 * - Loading and empty states
 */

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Loader2 } from 'lucide-react';
import type { Photo, PhotoCategory } from '@/types/storage';

interface PhotoSidebarProps {
  onPhotoInsert?: (photoUrl: string, align?: 'left' | 'center' | 'right') => void;
  onOpenChange?: (isOpen: boolean) => void;
}

export function PhotoSidebar({ onPhotoInsert, onOpenChange }: PhotoSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | 'all'>('all');

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    onOpenChange?.(newState);
  };

  /**
   * Fetch user's photos
   */
  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/photos');

      if (response.ok) {
        const data = await response.json();
        setPhotos(data.photos || []);
      }
    } catch (error) {
      console.error('Failed to fetch photos:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Filter photos by category
   */
  const filteredPhotos = selectedCategory === 'all'
    ? photos
    : photos.filter(photo => photo.category === selectedCategory);

  /**
   * Handle photo click to insert into document
   */
  const handlePhotoClick = (photo: Photo) => {
    if (onPhotoInsert) {
      onPhotoInsert(photo.fileUrl, 'left');
    }
  };

  /**
   * Category filter buttons
   */
  const categories: Array<{ value: PhotoCategory | 'all'; label: string; emoji: string }> = [
    { value: 'all', label: 'All', emoji: '🌟' },
    { value: 'time-location', label: 'Time+Loc', emoji: '📍⏰' },
    { value: 'time-only', label: 'Time', emoji: '⏰' },
    { value: 'location-only', label: 'Location', emoji: '📍' },
    { value: 'neither', label: 'Neither', emoji: '📷' },
  ];

  return (
    <>
      {/* Toggle Button (when closed) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => handleToggle(true)}
          className="fixed left-[264px] top-1/2 -translate-y-1/2 z-[100] p-3 bg-primary text-primary-foreground rounded-r-lg shadow-2xl hover:bg-primary/90 transition-all hover:scale-110 hover:shadow-xl"
          style={{ left: '264px' }}
          aria-label="Open photo sidebar"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-40 bg-card border-r border-border transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '320px' }}
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-foreground">Photos</h2>
            </div>
            <button
              type="button"
              onClick={() => handleToggle(false)}
              className="p-1 hover:bg-accent rounded transition-colors"
              aria-label="Close photo sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Filter */}
        <div className="p-3 border-b border-border">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  selectedCategory === cat.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <span className="mr-1">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photos Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Loading photos...</p>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {selectedCategory === 'all'
                  ? 'No photos yet'
                  : 'No photos in this category'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredPhotos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => handlePhotoClick(photo)}
                  className="relative aspect-square bg-muted rounded-lg overflow-hidden transition-all group cursor-pointer hover:ring-2 hover:ring-primary"
                  title={`Click to insert: ${photo.fileName}`}
                >
                  <Image
                    src={photo.fileUrl}
                    alt={photo.fileName}
                    fill
                    className="object-cover"
                    sizes="150px"
                    unoptimized
                  />

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded">
                        Insert
                      </div>
                    </div>
                  </div>

                  {/* Category badge */}
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded">
                    {photo.category === 'time-location' && '📍⏰'}
                    {photo.category === 'time-only' && '⏰'}
                    {photo.category === 'location-only' && '📍'}
                    {photo.category === 'neither' && '📷'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer with photo count */}
        <div className="p-3 border-t border-border bg-muted">
          <p className="text-xs text-muted-foreground text-center">
            {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''}
            {selectedCategory !== 'all' && ` in this category`}
          </p>
        </div>
      </div>

      {/* Overlay (when sidebar is open) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={() => handleToggle(false)}
        />
      )}
    </>
  );
}
