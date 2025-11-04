/**
 * Gallery Map View Page
 *
 * Shows all photos on an interactive map with:
 * - Visual display of photo locations
 * - Category filtering
 * - Statistics about location coverage
 * - Click to view photo details
 * - Integration with photo detail modal
 *
 * This provides a geographic overview of the user's photo library.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Grid3x3, Image as ImageIcon, MapPin } from 'lucide-react';
import type { Photo, PhotoCategory, PhotoStats } from '@/types/storage';
import { AppLayout } from '@/components/layout/app-layout';
import { CategoryFilter } from '@/components/gallery/category-filter';
import { PhotoMap, PhotoMapStats } from '@/components/maps/photo-map';
import { PhotoDetailModal } from '@/components/photos/photo-detail-modal';

export default function GalleryMapPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [detailPhotoId, setDetailPhotoId] = useState<string | null>(null);
  const [locationPhotos, setLocationPhotos] = useState<Photo[]>([]); // Photos at the selected location

  /**
   * Fetch photos from API
   */
  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/photos');

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch photos');
      }

      const data = await response.json();
      console.log('[Gallery Map] Fetched photos:', data.photos.length);
      console.log('[Gallery Map] Photos with location:', data.photos.filter((p: any) => p.metadata?.location).length);
      console.log('[Gallery Map] Sample photo:', data.photos[0]);
      setPhotos(data.photos);
      setStats(data.stats);
      setUserId(data.userId);
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Filter photos by category
   */
  const filteredPhotos = useMemo(
    () =>
      selectedCategory === 'all'
        ? photos
        : photos.filter((photo) => photo.category === selectedCategory),
    [photos, selectedCategory]
  );

  /**
   * Get photos with location data
   */
  const photosWithLocation = useMemo(
    () => filteredPhotos.filter((photo) => photo.metadata?.location),
    [filteredPhotos]
  );

  /**
   * Handle photo click to open detail modal
   * When a photo is clicked, find all photos at the same location
   */
  const handlePhotoClick = (photoId: string) => {
    const clickedPhoto = filteredPhotos.find((p) => p.id === photoId);
    if (!clickedPhoto?.metadata?.location) {
      setDetailPhotoId(photoId);
      setLocationPhotos([clickedPhoto!]);
      return;
    }

    // Find all photos at the same location
    const photosAtLocation = filteredPhotos.filter((photo) => {
      if (!photo.metadata?.location) return false;

      // Check if coordinates match (within small tolerance)
      const latMatch = Math.abs(photo.metadata.location.latitude - clickedPhoto.metadata.location.latitude) < 0.00001;
      const lngMatch = Math.abs(photo.metadata.location.longitude - clickedPhoto.metadata.location.longitude) < 0.00001;

      return latMatch && lngMatch;
    });

    setLocationPhotos(photosAtLocation);
    setDetailPhotoId(photoId);
  };

  /**
   * Handle navigation in photo detail modal
   * Navigate within photos at the same location
   */
  const handleDetailNavigate = (direction: 'prev' | 'next') => {
    if (!detailPhotoId) return;

    const currentIndex = locationPhotos.findIndex((p) => p.id === detailPhotoId);
    if (currentIndex === -1) return;

    if (direction === 'prev' && currentIndex > 0) {
      setDetailPhotoId(locationPhotos[currentIndex - 1].id);
    } else if (direction === 'next' && currentIndex < locationPhotos.length - 1) {
      setDetailPhotoId(locationPhotos[currentIndex + 1].id);
    }
  };

  /**
   * Get navigation state for detail modal
   * Based on photos at the same location
   */
  const getNavigationState = () => {
    if (!detailPhotoId || locationPhotos.length === 0) return { hasPrev: false, hasNext: false };

    const currentIndex = locationPhotos.findIndex((p) => p.id === detailPhotoId);
    if (currentIndex === -1) return { hasPrev: false, hasNext: false };

    return {
      hasPrev: currentIndex > 0,
      hasNext: currentIndex < locationPhotos.length - 1,
    };
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">🗺️</div>
            <p className="text-muted-foreground">Loading map...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card">
          <div className="max-w-7xl mx-auto px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">Map View</h1>
                <p className="text-muted-foreground">
                  Explore your photos by location
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href="/gallery"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Grid3x3 className="w-4 h-4" />
                  Gallery
                </Link>
                <Link
                  href="/gallery/locations"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MapPin className="w-4 h-4" />
                  Locations
                </Link>
              </div>
            </div>

            {/* Category Filter */}
            {stats && (
              <CategoryFilter
                stats={stats}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
              />
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-8 py-8">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-6xl mb-4">🗺️</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No photos yet</h3>
            <p className="text-muted-foreground mb-6">
              Upload photos with GPS data to see them on the map
            </p>
            <Link
              href="/gallery/upload"
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <ImageIcon className="w-5 h-5" />
              <span>Upload Photo</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Map Statistics */}
            <div className="p-4 bg-card border border-border rounded-lg">
              <PhotoMapStats
                totalPhotos={filteredPhotos.length}
                photosWithLocation={photosWithLocation.length}
              />
            </div>

            {/* Map */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {userId && (
                <PhotoMap
                  photos={photosWithLocation}
                  userId={userId}
                  onPhotoClick={handlePhotoClick}
                  height="calc(100vh - 400px)"
                />
              )}
            </div>

            {/* Help Text */}
            {photosWithLocation.length === 0 && filteredPhotos.length > 0 && (
              <div className="p-6 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  No photos in this category have location data
                </p>
                <p className="text-xs text-muted-foreground">
                  Photos taken with GPS-enabled cameras or assigned locations from the library will appear here
                </p>
              </div>
            )}
          </div>
        )}
        </div>

        {/* Photo Detail Modal */}
        {userId && (
          <PhotoDetailModal
            isOpen={!!detailPhotoId}
            photoId={detailPhotoId}
            userId={userId}
            onClose={() => setDetailPhotoId(null)}
            onNavigate={handleDetailNavigate}
            hasPrev={getNavigationState().hasPrev}
            hasNext={getNavigationState().hasNext}
          />
        )}
      </div>
    </AppLayout>
  );
}
