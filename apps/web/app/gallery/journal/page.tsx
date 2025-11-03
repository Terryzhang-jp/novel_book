/**
 * Travel Journal Page
 *
 * Main page for the travel journal feature.
 * Layout: Photo list sidebar (left) + Caption editor (right)
 *
 * Features:
 * - Display all photos in waterfall layout
 * - Click photo to select and edit caption
 * - Auto-save captions with 2-second debounce
 * - Visual indicators for photos with/without captions
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { JournalLayout } from '@/components/journal/journal-layout';
import { PhotoListSidebar } from '@/components/journal/photo-list-sidebar';
import { PhotoCaptionEditor } from '@/components/journal/photo-caption-editor';
import type { Photo } from '@/types/storage';
import type { JSONContent } from 'novel';
import { createEmptyJSONContent } from '@/lib/utils/json-content';

export default function JournalPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all photos (now returns complete Photo[] with fileUrl)
   */
  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/photos');

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch photos');
      }

      const data = await response.json();

      // API now returns complete Photo[] objects (no need for individual detail requests)
      const validPhotos = data.photos.filter(
        (photo: any): photo is Photo => photo !== null && photo.id
      );

      setPhotos(validPhotos);
      setUserId(data.userId);

      // Auto-select first photo if available
      if (validPhotos.length > 0 && !selectedPhotoId) {
        setSelectedPhotoId(validPhotos[0].id);
      }
    } catch (err) {
      console.error('Error fetching photos:', err);
      setError('Failed to load photos. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router, selectedPhotoId]);

  // Fetch photos on mount
  useEffect(() => {
    fetchPhotos();
  }, []);

  /**
   * Handle photo selection
   */
  const handlePhotoSelect = (photoId: string) => {
    setSelectedPhotoId(photoId);
  };

  /**
   * Handle caption save
   */
  const handleSave = async (photoId: string, description: JSONContent) => {
    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description }),
      });

      if (!response.ok) {
        throw new Error('Failed to save caption');
      }

      // Update local state
      setPhotos((prevPhotos) =>
        prevPhotos.map((photo) =>
          photo.id === photoId
            ? { ...photo, description, updatedAt: new Date().toISOString() }
            : photo
        )
      );
    } catch (err) {
      console.error('Error saving caption:', err);
      throw err;
    }
  };

  // Get selected photo
  const selectedPhoto = photos.find((p) => p.id === selectedPhotoId) || null;

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading journal...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive mb-4">{error}</p>
            <button
              type="button"
              onClick={() => fetchPhotos()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link
              href="/gallery"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Gallery</span>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Travel Journal</h1>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {userId ? (
            <JournalLayout
              sidebar={
                <PhotoListSidebar
                  photos={photos}
                  selectedPhotoId={selectedPhotoId}
                  onPhotoSelect={handlePhotoSelect}
                  userId={userId}
                />
              }
              editor={
                <PhotoCaptionEditor
                  photoId={selectedPhotoId}
                  userId={userId}
                  photoFileUrl={selectedPhoto?.fileUrl}
                  initialDescription={selectedPhoto?.description || createEmptyJSONContent()}
                  onSave={handleSave}
                />
              }
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted-foreground">
                Please log in to access the journal
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
