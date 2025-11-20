/**
 * PhotoDetailModal Component
 *
 * Full-screen modal for viewing photo details with:
 * - Large image display
 * - EXIF metadata display
 * - Location assignment interface
 * - Category information
 * - Navigation between photos
 * - Keyboard shortcuts (Esc to close, arrow keys to navigate)
 *
 * This provides a detailed view for individual photos from the gallery.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, ChevronLeft, ChevronRight, Camera, Loader2, BookOpen, FileText, Edit2, FileImage } from 'lucide-react';
import { LocationAssignment } from './location-assignment';
import { DateTimeAssignment } from './datetime-assignment';
import type { Photo } from '@/types/storage';
import { extractTextFromJSON, isJSONContentEmpty } from '@/lib/utils/json-content';

interface PhotoDetailModalProps {
  isOpen: boolean;
  photoId: string | null;
  userId: string;
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPhotoUpdate?: () => void;
}

/**
 * PhotoDetailModal Component
 *
 * Displays full photo details in a modal overlay with metadata
 * and location management capabilities.
 */
export function PhotoDetailModal({
  isOpen,
  photoId,
  userId,
  onClose,
  onNavigate,
  hasPrev = false,
  hasNext = false,
  onPhotoUpdate,
}: PhotoDetailModalProps) {
  const router = useRouter();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch full photo details
   */
  const fetchPhoto = useCallback(async () => {
    if (!photoId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/photos/${photoId}`);

      if (response.ok) {
        const data = await response.json();
        setPhoto(data.photo);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load photo');
      }
    } catch (err) {
      console.error('Failed to fetch photo:', err);
      setError('Failed to load photo. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [photoId]);

  // Fetch photo when photoId changes
  useEffect(() => {
    if (isOpen && photoId) {
      fetchPhoto();
    }
  }, [isOpen, photoId, fetchPhoto]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev && onNavigate) {
        onNavigate('prev');
      } else if (e.key === 'ArrowRight' && hasNext && onNavigate) {
        onNavigate('next');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasPrev, hasNext, onClose, onNavigate]);

  /**
   * Handle location change
   */
  const handleLocationChange = (updatedPhoto: Photo) => {
    setPhoto(updatedPhoto);
    // Notify parent to refresh photo list so category updates are reflected
    onPhotoUpdate?.();
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString?: string): string | null => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Format category for display
   */
  const getCategoryLabel = (category?: string): string => {
    if (!category) return 'Uncategorized';
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  if (!isOpen) return null;

  const imageUrl = photo ? photo.fileUrl : '';

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm">
      {/* Action Buttons */}
      <div className="fixed top-4 right-4 z-[10000] flex gap-2">
        {/* Generate Poster Button */}
        {photo && (
          <button
            type="button"
            onClick={() => {
              router.push(`/gallery/poster/${photoId}`);
            }}
            className="p-2 bg-card border border-border rounded-full hover:bg-accent transition-colors"
            aria-label="Generate poster"
            title="生成海报"
          >
            <FileImage className="w-6 h-6" />
          </button>
        )}

        {/* Edit Button */}
        {photo && (
          <button
            type="button"
            onClick={() => {
              router.push(`/gallery/photos/${photoId}/edit`);
            }}
            className="p-2 bg-card border border-border rounded-full hover:bg-accent transition-colors"
            aria-label="Edit photo"
            title="编辑照片"
          >
            <Edit2 className="w-6 h-6" />
          </button>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-card border border-border rounded-full hover:bg-accent transition-colors"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Navigation Buttons */}
      {onNavigate && (
        <>
          {hasPrev && (
            <button
              type="button"
              onClick={() => onNavigate('prev')}
              className="fixed left-4 top-1/2 -translate-y-1/2 z-[10000] p-3 bg-card border border-border rounded-full hover:bg-accent transition-colors"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={() => onNavigate('next')}
              className="fixed right-4 top-1/2 -translate-y-1/2 z-[10000] p-3 bg-card border border-border rounded-full hover:bg-accent transition-colors"
              aria-label="Next photo"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </>
      )}

      {/* Content */}
      <div className="h-full overflow-y-auto">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-6xl mx-auto">
            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading photo...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
                <p className="text-destructive mb-4">{error}</p>
                <button
                  type="button"
                  onClick={fetchPhoto}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Photo Content */}
            {photo && !isLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Image Section (2/3 width on large screens) */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden border border-border">
                    <Image
                      src={imageUrl}
                      alt={photo.fileName}
                      fill
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 66vw"
                      priority
                    />
                  </div>

                  {/* File Info */}
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">File Name</p>
                    <p className="font-mono text-sm">{photo.fileName}</p>
                  </div>
                </div>

                {/* Metadata Section (1/3 width on large screens) */}
                <div className="space-y-6">
                  {/* Category Badge */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Category</p>
                    <span className="inline-block px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                      {getCategoryLabel(photo.category)}
                    </span>
                  </div>

                  {/* Date & Time Assignment */}
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <DateTimeAssignment
                      photo={photo}
                      onDateTimeChange={handleLocationChange}
                    />
                  </div>

                  {/* Camera Info */}
                  {(photo.metadata?.camera?.make || photo.metadata?.camera?.model) && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-start gap-3">
                        <Camera className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground mb-1">Camera</p>
                          {photo.metadata.camera.make && (
                            <p className="text-sm">{photo.metadata.camera.make}</p>
                          )}
                          {photo.metadata.camera.model && (
                            <p className="text-sm text-muted-foreground">
                              {photo.metadata.camera.model}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Location Assignment */}
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <LocationAssignment
                      photo={photo}
                      onLocationChange={handleLocationChange}
                    />
                  </div>

                  {/* Photo Description / Caption */}
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-muted-foreground mb-2">照片说明</p>

                        {!isJSONContentEmpty(photo.description) ? (
                          <>
                            {/* Description Preview */}
                            <div className="text-sm mb-3 p-3 bg-muted rounded-md">
                              <p className="line-clamp-3">
                                {extractTextFromJSON(photo.description, 150)}
                              </p>
                            </div>

                            {/* View in Journal Button */}
                            <Link
                              href="/gallery/journal"
                              className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                            >
                              <BookOpen className="w-4 h-4" />
                              <span>在日记中查看完整说明</span>
                            </Link>
                          </>
                        ) : (
                          <>
                            {/* No Description */}
                            <p className="text-sm text-muted-foreground mb-3">
                              还没有添加说明
                            </p>

                            {/* Add Description Button */}
                            <Link
                              href="/gallery/journal"
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                            >
                              <BookOpen className="w-4 h-4" />
                              <span>添加说明</span>
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* File Size */}
                  {photo.metadata?.fileSize && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <p className="text-sm font-medium mb-3">File Info</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Size</span>
                          <span>{(photo.metadata.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        {photo.metadata.dimensions && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Dimensions</span>
                            <span>
                              {photo.metadata.dimensions.width} × {photo.metadata.dimensions.height}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Uploaded: </span>
                        <span>{new Date(photo.createdAt).toLocaleString()}</span>
                      </div>
                      {photo.updatedAt !== photo.createdAt && (
                        <div>
                          <span className="text-muted-foreground">Updated: </span>
                          <span>{new Date(photo.updatedAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
