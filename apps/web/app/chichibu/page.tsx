/**
 * Chichibu Travel - Public Map Page
 *
 * Public-facing page showing all travelers' photos on a map.
 *
 * Features:
 * - Hero section with title and stats
 * - Interactive map centered on Chichibu
 * - Shows all public photos from all users
 * - Click photos to view details (read-only)
 * - No authentication required
 *
 * This is the main landing page for the Chichibu travel sharing platform.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { MapPin, Loader2, Users, Image as ImageIcon, LogIn } from 'lucide-react';
import { PhotoMap, type PhotoLocation } from '@/components/maps/photo-map';
import { LocationPhotosModal } from '@/components/photos/location-photos-modal';
import { PhotoSidebar } from '@/components/chichibu/photo-sidebar';
import { AppLayout } from '@/components/layout/app-layout';
import type { PhotoCategory } from '@/types/storage';

interface PublicPhotoIndex {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  fileUrl: string;
  category: PhotoCategory;
  dateTime?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  updatedAt: string;
}

export default function ChichibuPage() {
  const [photos, setPhotos] = useState<PublicPhotoIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<PhotoLocation | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [focusLocation, setFocusLocation] = useState<{
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null>(null);

  /**
   * Fetch all public photos
   */
  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/public/photos');

      if (!response.ok) {
        throw new Error('Failed to fetch photos');
      }

      const data = await response.json();
      setPhotos(data.photos);
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get unique number of travelers (users)
   */
  const travelerCount = useMemo(() => {
    const uniqueUserIds = new Set(photos.map(photo => photo.userId));
    return uniqueUserIds.size;
  }, [photos]);

  /**
   * Handle location click from map popup to open location photos modal
   */
  const handleLocationClick = (location: PhotoLocation) => {
    setSelectedLocation(location);
  };

  /**
   * Handle photo click from sidebar to focus on map
   */
  const handleSidebarPhotoClick = (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (photo && photo.location) {
      setSelectedPhotoId(photoId);
      setFocusLocation({
        latitude: photo.location.latitude,
        longitude: photo.location.longitude,
        zoom: 15,
      });
    }
  };


  // Get a representative userId for the PhotoMap component
  // (PhotoMap needs userId for image path construction)
  const representativeUserId = photos.length > 0 ? photos[0].userId : '';

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading Chichibu Travel...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-background">
        {/* Full Screen Map */}
        <div className="absolute inset-0 z-0">
          <PhotoMap
            photos={photos}
            userId={representativeUserId}
            onLocationClick={handleLocationClick}
            focusLocation={focusLocation}
            height="100%"
          />
        </div>

        {/* Overlay Header */}
        <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <div className="bg-gradient-to-b from-background/80 to-transparent backdrop-blur-sm pb-12 pt-4 px-4 md:px-8">
            <div className="max-w-7xl mx-auto flex items-start justify-between pointer-events-auto">
              <div>
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground drop-shadow-sm">
                  Chichibu Travel
                </h1>
                <p className="text-sm md:text-base text-muted-foreground font-medium mt-1 max-w-md">
                  Discover the beauty of Chichibu through the lens of travelers.
                </p>

                {/* Stats Badge */}
                <div className="flex items-center gap-4 mt-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-background/80 backdrop-blur-md border border-border/50 shadow-sm text-xs font-medium">
                    <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    <span>{photos.length} Photos</span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-background/80 backdrop-blur-md border border-border/50 shadow-sm text-xs font-medium">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span>{travelerCount} Travelers</span>
                  </div>
                </div>
              </div>

              {/* Removed Join Button */}
            </div>
          </div>
        </div>

        {/* Floating Sidebar */}
        <div className="absolute top-0 left-0 bottom-0 z-20 pointer-events-none flex flex-col justify-end md:justify-start md:pt-48 md:pl-8 pb-8 px-4 md:px-0 w-full md:w-auto">
          <PhotoSidebar
            photos={photos}
            onPhotoClick={handleSidebarPhotoClick}
            selectedPhotoId={selectedPhotoId}
            className="pointer-events-auto"
          />
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">Loading Map...</p>
            </div>
          </div>
        )}

        {/* Location Photos Modal */}
        <LocationPhotosModal
          isOpen={!!selectedLocation}
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      </div>
    </AppLayout>
  );
}
