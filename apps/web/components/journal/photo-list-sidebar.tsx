/**
 * Photo List Sidebar Component
 *
 * Displays photos in a waterfall/grid layout for journal entry selection.
 *
 * Features:
 * - Visual indicators for photos with/without captions (💬 icon)
 * - Highlight selected photo
 * - Scrollable list
 * - Show photo thumbnails with metadata
 *
 * Props:
 * - photos: Array of photo objects
 * - selectedPhotoId: Currently selected photo ID
 * - onPhotoSelect: Callback when photo is clicked
 */

'use client';

import Image from 'next/image';
import { MessageSquare, Calendar } from 'lucide-react';
import type { Photo } from '@/types/storage';
import { extractTextFromJSON, isJSONContentEmpty } from '@/lib/utils/json-content';

interface PhotoListSidebarProps {
  photos: Photo[];
  selectedPhotoId: string | null;
  onPhotoSelect: (photoId: string) => void;
  userId: string;
}

export function PhotoListSidebar({
  photos,
  selectedPhotoId,
  onPhotoSelect,
  userId,
}: PhotoListSidebarProps) {
  /**
   * Format date for display
   */
  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'No date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (photos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-muted-foreground">No photos uploaded yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Upload photos from the gallery page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Photos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </p>
      </div>

      {/* Photo List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {photos.map((photo) => {
          const isSelected = photo.id === selectedPhotoId;
          const hasDescription = !isJSONContentEmpty(photo.description);
          const descriptionPreview = extractTextFromJSON(photo.description, 100);
          const imageUrl = `/images/${userId}/gallery/${photo.fileName}`;

          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => onPhotoSelect(photo.id)}
              className={`
                w-full text-left p-3 rounded-lg border transition-all
                ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-md'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-accent'
                }
              `}
            >
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="relative w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-muted">
                  <Image
                    src={imageUrl}
                    alt={photo.fileName}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate">
                      {photo.originalName || photo.fileName}
                    </p>
                    {hasDescription && (
                      <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </div>
                  {photo.metadata?.dateTime && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(photo.metadata.dateTime)}</span>
                    </div>
                  )}
                  {hasDescription && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {descriptionPreview}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
