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
   * Group photos by date
   */
  const groupedPhotos = photos.reduce((groups, photo) => {
    const date = photo.metadata?.dateTime
      ? new Date(photo.metadata.dateTime).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
      : 'Unknown Date';

    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(photo);
    return groups;
  }, {} as Record<string, Photo[]>);

  // Sort dates (newest first)
  const sortedDates = Object.keys(groupedPhotos).sort((a, b) => {
    if (a === 'Unknown Date') return 1;
    if (b === 'Unknown Date') return -1;
    return new Date(b).getTime() - new Date(a).getTime();
  });

  if (photos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-muted-foreground font-serif italic">Your journal is empty.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Upload photos to start your story.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background/50 backdrop-blur-sm">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-border/40">
        <h2 className="text-2xl font-serif font-bold tracking-tight">Timeline</h2>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          {photos.length} Memories
        </p>
      </div>

      {/* Timeline List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {sortedDates.map((date) => (
          <div key={date} className="relative">
            {/* Sticky Date Header */}
            <div className="sticky top-0 z-10 px-6 py-3 bg-background/80 backdrop-blur-md border-b border-border/40">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {date}
              </h3>
            </div>

            {/* Photos for this date */}
            <div className="px-2 py-2 space-y-1">
              {groupedPhotos[date].map((photo) => {
                const isSelected = photo.id === selectedPhotoId;
                const hasDescription = !isJSONContentEmpty(photo.description);
                const descriptionPreview = extractTextFromJSON(photo.description, 80);

                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => onPhotoSelect(photo.id)}
                    className={`
                      group relative w-full text-left p-3 rounded-xl transition-all duration-200
                      ${isSelected
                        ? 'bg-primary/5 shadow-sm ring-1 ring-primary/20'
                        : 'hover:bg-accent/50'
                      }
                    `}
                  >
                    <div className="flex gap-4">
                      {/* Timeline Connector (Visual Decoration) */}
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-border/50 -ml-[1px] hidden" />

                      {/* Thumbnail */}
                      <div className={`
                        relative w-24 aspect-[4/3] flex-shrink-0 rounded-lg overflow-hidden bg-muted shadow-sm transition-transform duration-300
                        ${isSelected ? 'scale-105 ring-2 ring-background' : 'group-hover:scale-105'}
                      `}>
                        <Image
                          src={photo.fileUrl}
                          alt={photo.fileName}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 py-1 flex flex-col justify-center">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-mono text-muted-foreground">
                            {photo.metadata?.dateTime
                              ? new Date(photo.metadata.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : ''}
                          </span>
                          {hasDescription && (
                            <MessageSquare className="w-3 h-3 text-primary/70" />
                          )}
                        </div>

                        {hasDescription ? (
                          <p className="text-sm text-foreground/90 font-serif line-clamp-2 leading-relaxed">
                            {descriptionPreview}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic font-serif">
                            Write a caption...
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Bottom padding for scroll */}
        <div className="h-20" />
      </div>
    </div>
  );
}
