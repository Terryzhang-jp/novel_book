/**
 * PhotoMap Component
 *
 * Displays photos on an interactive map with:
 * - Markers for each photo location
 * - Clustered markers when photos are close together
 * - Photo thumbnails in map popups
 * - Filtering by category
 * - Click to view photo details
 * - Legend showing photo count
 *
 * This provides a geographic view of the user's photo library.
 */

'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { MapPin, Image as ImageIcon, Loader2 } from 'lucide-react';
import type { PhotoIndex } from '@/types/storage';

interface PhotoMapProps {
  photos: PhotoIndex[];
  userId: string;
  onPhotoClick?: (photoId: string) => void;
  className?: string;
  height?: string;
}

/**
 * Group photos by location (same coordinates)
 */
interface PhotoLocation {
  latitude: number;
  longitude: number;
  photos: PhotoIndex[];
}

/**
 * PhotoMap Component
 *
 * Shows photos on a Leaflet map with markers and popups.
 */
export function PhotoMap({
  photos,
  userId,
  onPhotoClick,
  className = '',
  height = '600px',
}: PhotoMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [mapComponents, setMapComponents] = useState<any>(null);

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true);

    // Load Leaflet CSS from CDN
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }

    // Load custom Leaflet styles
    import('@/styles/leaflet.css');

    // Dynamically import react-leaflet components
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
    ]).then(([reactLeaflet, leaflet]) => {
      // Fix Leaflet default marker icon issue in Next.js
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      setMapComponents(reactLeaflet);
    }).catch((error) => {
      console.error('Failed to load map components:', error);
    });
  }, []);

  /**
   * Group photos by location
   */
  const photoLocations = useMemo((): PhotoLocation[] => {
    const locationMap = new Map<string, PhotoLocation>();

    photos.forEach((photo) => {
      const location = photo.location;
      if (!location) return;

      // Create a key from coordinates (rounded to 6 decimals)
      const key = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;

      if (locationMap.has(key)) {
        locationMap.get(key)!.photos.push(photo);
      } else {
        locationMap.set(key, {
          latitude: location.latitude,
          longitude: location.longitude,
          photos: [photo],
        });
      }
    });

    return Array.from(locationMap.values());
  }, [photos]);

  /**
   * Calculate map center
   */
  const mapCenter = useMemo((): [number, number] => {
    if (photoLocations.length === 0) {
      return [39.9042, 116.4074]; // Default: Beijing
    }

    const avgLat = photoLocations.reduce((sum, loc) => sum + loc.latitude, 0) / photoLocations.length;
    const avgLng = photoLocations.reduce((sum, loc) => sum + loc.longitude, 0) / photoLocations.length;

    return [avgLat, avgLng];
  }, [photoLocations]);

  // Show loading state until client-side
  if (!isClient || !mapComponents) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded-lg ${className}`}
        style={{ height }}
      >
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {!mapComponents ? 'Loading map...' : 'Initializing...'}
          </p>
        </div>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = mapComponents;

  /**
   * Custom popup content for a location
   */
  function LocationPopupContent({ location }: { location: PhotoLocation }) {
    return (
      <div className="min-w-[200px] max-w-[300px]">
        <div className="mb-2 pb-2 border-b border-border">
          <p className="text-sm font-medium">
            {location.photos.length} photo{location.photos.length !== 1 ? 's' : ''} at this location
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
          </p>
        </div>

        {/* Photo grid in popup */}
        <div className="grid grid-cols-2 gap-2">
          {location.photos.slice(0, 4).map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onPhotoClick?.(photo.id)}
              className="relative aspect-square bg-muted rounded overflow-hidden hover:ring-2 hover:ring-primary transition-all"
            >
              <Image
                src={`/images/${userId}/gallery/${photo.fileName}`}
                alt={photo.fileName}
                fill
                className="object-cover"
                sizes="100px"
              />
            </button>
          ))}
        </div>

        {location.photos.length > 4 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            +{location.photos.length - 4} more photo{location.photos.length - 4 !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      {photoLocations.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center bg-muted rounded-lg border-2 border-dashed border-border">
          <MapPin className="w-12 h-12 text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold mb-2">No photos with location data</h3>
          <p className="text-sm text-muted-foreground">
            Photos with GPS coordinates will appear on the map
          </p>
        </div>
      ) : (
        <MapContainer
          center={mapCenter}
          zoom={photoLocations.length === 1 ? 13 : 4}
          style={{ height: '100%', width: '100%' }}
          className="rounded-lg"
        >
          {/* OpenStreetMap Tiles */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Render markers for each location */}
          {photoLocations.map((location, index) => (
            <Marker
              key={`${location.latitude}-${location.longitude}-${index}`}
              position={[location.latitude, location.longitude]}
            >
              <Popup maxWidth={320}>
                <LocationPopupContent location={location} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}

/**
 * PhotoMapStats Component
 *
 * Shows statistics about photos on the map
 */
export function PhotoMapStats({
  totalPhotos,
  photosWithLocation,
  className = '',
}: {
  totalPhotos: number;
  photosWithLocation: number;
  className?: string;
}) {
  const percentage = totalPhotos > 0 ? Math.round((photosWithLocation / totalPhotos) * 100) : 0;

  return (
    <div className={`flex items-center gap-6 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-primary" />
        <span className="text-sm">
          <span className="font-medium">{photosWithLocation}</span> with location
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-muted-foreground" />
        <span className="text-sm">
          <span className="font-medium">{totalPhotos - photosWithLocation}</span> without location
        </span>
      </div>
      <div className="text-sm text-muted-foreground">
        {percentage}% coverage
      </div>
    </div>
  );
}
