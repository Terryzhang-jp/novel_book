/**
 * PublicPhotoDetailModal Component
 *
 * Full-screen modal for viewing public photo details with:
 * - Large image display
 * - EXIF metadata display
 * - Photo description (travel journal)
 * - Uploader information (user name)
 * - Navigation between photos
 * - Keyboard shortcuts (Esc to close, arrow keys to navigate)
 *
 * This is a READ-ONLY view for the public map page.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, Calendar, Camera, Loader2, FileText, User } from 'lucide-react';
import { extractTextFromJSON, isJSONContentEmpty } from '@/lib/utils/json-content';
import type { JSONContent } from 'novel';

interface PublicPhoto {
  id: string;
  userId: string;
  fileName: string;
  originalName: string;
  userName: string;  // 上传者姓名
  metadata: {
    dateTime?: string;
    location?: {
      latitude: number;
      longitude: number;
      altitude?: number;
    };
    camera?: {
      make?: string;
      model?: string;
    };
    dimensions?: {
      width: number;
      height: number;
    };
    fileSize?: number;
  };
  description?: JSONContent;
  category: string;
  createdAt: string;
  updatedAt: string;
}

interface PublicPhotoDetailModalProps {
  isOpen: boolean;
  photoId: string | null;
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

/**
 * PublicPhotoDetailModal Component
 *
 * Displays full photo details in a modal overlay (READ-ONLY mode for public viewing).
 */
export function PublicPhotoDetailModal({
  isOpen,
  photoId,
  onClose,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: PublicPhotoDetailModalProps) {
  const [photo, setPhoto] = useState<PublicPhoto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch full photo details from public API
   */
  const fetchPhoto = useCallback(async () => {
    if (!photoId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all public photos and find the one we need
      const response = await fetch('/api/public/photos');

      if (response.ok) {
        const data = await response.json();
        const foundPhoto = data.photos.find((p: PublicPhoto) => p.id === photoId);

        if (foundPhoto) {
          setPhoto(foundPhoto);
        } else {
          setError('Photo not found');
        }
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

  if (!isOpen) return null;

  const imageUrl = photo ? photo.fileUrl : '';

  // Debug: Log the image URL
  if (photo) {
    console.log('[PublicPhotoDetailModal] Photo data:', photo);
    console.log('[PublicPhotoDetailModal] Image URL:', imageUrl);
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm">
      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-4 right-4 z-[10000] p-2 bg-card border border-border rounded-full hover:bg-accent transition-colors"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

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
                      unoptimized
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
                  {/* Uploader Info */}
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-start gap-3">
                      <User className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">上传者</p>
                        <p className="text-sm font-medium">{photo.userName}</p>
                      </div>
                    </div>
                  </div>

                  {/* Date & Time */}
                  {photo.metadata?.dateTime && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-start gap-3">
                        <Calendar className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Date & Time</p>
                          <p className="text-sm">{formatDate(photo.metadata.dateTime)}</p>
                        </div>
                      </div>
                    </div>
                  )}

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

                  {/* Photo Description / Caption */}
                  {photo.description && !isJSONContentEmpty(photo.description) ? (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground mb-2">照片说明</p>
                          <div className="text-sm p-3 bg-muted rounded-md prose prose-sm max-w-none">
                            <p className="whitespace-pre-wrap">
                              {extractTextFromJSON(photo.description)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground mb-2">照片说明</p>
                          <p className="text-sm text-muted-foreground italic">No description yet</p>
                        </div>
                      </div>
                    </div>
                  )}

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
