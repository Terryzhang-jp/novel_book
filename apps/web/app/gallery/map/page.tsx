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
import { PhotoMap, PhotoMapStats, type PhotoLocation } from '@/components/maps/photo-map';
import { LocationPhotosModal } from '@/components/photos/location-photos-modal';

export default function GalleryMapPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<PhotoLocation | null>(null);

  /**
   * Fetch photos from API with progressive loading
   */
  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    const BATCH_SIZE = 200;
    let offset = 0;
    let hasMore = true;
    const collected: Photo[] = [];
    let statsData: PhotoStats | null = null;
    let userIdData: string | null = null;

    try {
      setLoading(true);

      // 首次请求获取 stats 和 userId
      const firstResponse = await fetch(`/api/photos?limit=${BATCH_SIZE}&offset=0`);

      if (!firstResponse.ok) {
        if (firstResponse.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch photos');
      }

      const firstData = await firstResponse.json();
      collected.push(...firstData.photos);
      statsData = firstData.stats;
      userIdData = firstData.userId;

      setPhotos([...collected]);
      setStats(statsData);
      setUserId(userIdData);
      setLoading(false); // 首批数据后即显示地图

      // 如果还有更多数据，继续后台加载
      const total = statsData?.total || 0;
      if (collected.length < total) {
        offset = BATCH_SIZE;

        while (offset < total) {
          const response = await fetch(`/api/photos?limit=${BATCH_SIZE}&offset=${offset}`);
          if (!response.ok) break;

          const data = await response.json();
          if (data.photos.length === 0) break;

          collected.push(...data.photos);
          setPhotos([...collected]); // 增量更新

          offset += BATCH_SIZE;
        }
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
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
   * Handle location click to open location photos modal
   */
  const handleLocationClick = (location: PhotoLocation) => {
    setSelectedLocation(location);
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
      <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-background">

        {/* Full Screen Map */}
        <div className="absolute inset-0 z-0">
          {photos.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center bg-muted/10">
              <div className="text-6xl mb-4">🗺️</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No photos yet</h3>
              <p className="text-muted-foreground mb-6">
                Upload photos with GPS data to see them on the map
              </p>
              <Link
                href="/gallery/upload"
                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-lg"
              >
                <ImageIcon className="w-5 h-5" />
                <span>Upload Photo</span>
              </Link>
            </div>
          ) : (
            userId && (
              <PhotoMap
                photos={photosWithLocation}
                userId={userId}
                onLocationClick={handleLocationClick}
                height="100%"
                className="z-0"
              />
            )
          )}
        </div>

        {/* Floating Header (Top Left) */}
        <div className="absolute top-6 left-6 z-10">
          <div className="bg-background/80 backdrop-blur-md border border-border/50 shadow-lg rounded-2xl p-4 min-w-[240px]">
            <h1 className="text-xl font-bold text-foreground mb-1">Map View</h1>
            <p className="text-xs text-muted-foreground mb-3">
              Explore your photos by location
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Link
                href="/gallery"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <Grid3x3 className="w-3.5 h-3.5" />
                Gallery
              </Link>
              <Link
                href="/gallery/locations"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                Locations
              </Link>
            </div>
          </div>
        </div>

        {/* Floating Filter Bar (Top Right) */}
        {stats && (
          <div className="absolute top-6 right-6 z-10 max-w-[calc(100%-300px)] pointer-events-none">
            <div className="pointer-events-auto flex justify-end">
              <div className="bg-background/80 backdrop-blur-md border border-border/50 shadow-lg rounded-full p-1.5">
                <CategoryFilter
                  stats={stats}
                  selectedCategory={selectedCategory}
                  onCategoryChange={setSelectedCategory}
                  variant="pill"
                />
              </div>
            </div>
          </div>
        )}

        {/* Floating Stats (Bottom Left) */}
        {photos.length > 0 && (
          <div className="absolute bottom-8 left-6 z-10">
            <div className="bg-background/80 backdrop-blur-md border border-border/50 shadow-lg rounded-2xl p-4">
              <PhotoMapStats
                totalPhotos={filteredPhotos.length}
                photosWithLocation={photosWithLocation.length}
              />
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
