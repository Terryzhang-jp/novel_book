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
import { PhotoMap } from '@/components/maps/photo-map';
import { PublicPhotoDetailModal } from '@/components/photos/public-photo-detail-modal';
import { PhotoSidebar } from '@/components/chichibu/photo-sidebar';
import { AppLayout } from '@/components/layout/app-layout';
import type { PhotoCategory } from '@/types/storage';

interface PublicPhotoIndex {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
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
  const [detailPhotoId, setDetailPhotoId] = useState<string | null>(null);
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
      console.log('[Chichibu] Fetched photos:', data.photos.length);
      console.log('[Chichibu] Photos with location:', data.photos.filter((p: any) => p.location).length);
      console.log('[Chichibu] Sample photo:', data.photos[0]);
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
   * Handle photo click from map popup to open detail modal
   */
  const handlePhotoClick = (photoId: string) => {
    setDetailPhotoId(photoId);
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

  /**
   * Handle navigation in photo detail modal
   */
  const handleDetailNavigate = (direction: 'prev' | 'next') => {
    if (!detailPhotoId) return;

    const currentIndex = photos.findIndex((p) => p.id === detailPhotoId);
    if (currentIndex === -1) return;

    if (direction === 'prev' && currentIndex > 0) {
      setDetailPhotoId(photos[currentIndex - 1].id);
    } else if (direction === 'next' && currentIndex < photos.length - 1) {
      setDetailPhotoId(photos[currentIndex + 1].id);
    }
  };

  /**
   * Get navigation state for detail modal
   */
  const getNavigationState = () => {
    if (!detailPhotoId) return { hasPrev: false, hasNext: false };

    const currentIndex = photos.findIndex((p) => p.id === detailPhotoId);
    if (currentIndex === -1) return { hasPrev: false, hasNext: false };

    return {
      hasPrev: currentIndex > 0,
      hasNext: currentIndex < photos.length - 1,
    };
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
      <div className="min-h-screen bg-background">
      {/* Header / Navigation */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-bold">Chichibu Travel</h1>
            </div>
            <Link
              href="/login"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-b from-primary/5 to-background border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-16 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            秩父旅行
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Discover Chichibu through travelers' eyes
          </p>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              <span>
                <span className="font-bold text-lg">{photos.length}</span>{' '}
                <span className="text-muted-foreground">
                  {photos.length === 1 ? 'photo' : 'photos'}
                </span>
              </span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <span>
                <span className="font-bold text-lg">{travelerCount}</span>{' '}
                <span className="text-muted-foreground">
                  {travelerCount === 1 ? 'traveler' : 'travelers'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-6xl mb-4">🗺️</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              No photos yet
            </h3>
            <p className="text-muted-foreground mb-6">
              Be the first to share your Chichibu travel experience!
            </p>
            <Link
              href="/login"
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <LogIn className="w-5 h-5" />
              <span>Get Started</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Map and Sidebar - Flex Layout */}
            <div className="flex gap-0 bg-card border border-border rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 400px)' }}>
              {/* Map - Takes remaining space */}
              <div className="flex-1 min-w-0">
                <PhotoMap
                  photos={photos}
                  userId={representativeUserId}
                  onPhotoClick={handlePhotoClick}
                  focusLocation={focusLocation}
                  height="100%"
                />
              </div>

              {/* Photo Sidebar - Fixed width or collapsed */}
              <PhotoSidebar
                photos={photos}
                onPhotoClick={handleSidebarPhotoClick}
                selectedPhotoId={selectedPhotoId}
              />
            </div>

            {/* Info Text */}
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                点击地图上的标记查看照片详情，或使用右侧列表快速浏览
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Photo Detail Modal */}
      <PublicPhotoDetailModal
        isOpen={!!detailPhotoId}
        photoId={detailPhotoId}
        onClose={() => setDetailPhotoId(null)}
        onNavigate={handleDetailNavigate}
        hasPrev={getNavigationState().hasPrev}
        hasNext={getNavigationState().hasNext}
      />
      </div>
    </AppLayout>
  );
}
