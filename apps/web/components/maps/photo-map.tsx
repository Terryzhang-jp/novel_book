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

import { useEffect, useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { MapPin, Image as ImageIcon, Loader2 } from 'lucide-react';
import type { Photo } from '@/types/storage';

// Minimal photo interface for map display
interface MapPhoto {
  id: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  dateTime?: string;
}

// Photo already has userId, so this type is just an alias now
type PhotoWithOptionalUserId = Photo | MapPhoto;

// Helper function to get location from either photo type
function getPhotoLocation(photo: PhotoWithOptionalUserId): { latitude: number; longitude: number } | undefined {
  if ('metadata' in photo) {
    return photo.metadata?.location;
  }
  return photo.location;
}

// Helper function to get dateTime from either photo type
function getPhotoDateTime(photo: PhotoWithOptionalUserId): string | undefined {
  if ('metadata' in photo) {
    return photo.metadata?.dateTime;
  }
  return photo.dateTime;
}

interface PhotoMapProps {
  photos: PhotoWithOptionalUserId[];
  userId: string;  // Fallback userId if photo doesn't have one
  onPhotoClick?: (photoId: string) => void;
  className?: string;
  height?: string;
  focusLocation?: {
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null;
  initialZoom?: number;  // Custom initial zoom level
  highlightArea?: {
    center: [number, number];
    radius: number;  // in meters
    color?: string;
    fillColor?: string;
    label?: string;
  } | null;
}

/**
 * Group photos by location (same coordinates)
 */
interface PhotoLocation {
  latitude: number;
  longitude: number;
  photos: PhotoWithOptionalUserId[];
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
  focusLocation = null,
  initialZoom,
  highlightArea = null,
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
      const location = getPhotoLocation(photo);
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
      return [35.9915, 139.0842]; // Default: Chichibu (秩父)
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

  const { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Tooltip } = mapComponents;

  /**
   * MapFocusController - Internal component to control map focus
   */
  function MapFocusController({
    focusLocation
  }: {
    focusLocation: {
      latitude: number;
      longitude: number;
      zoom?: number;
    } | null
  }) {
    const map = useMap();

    useEffect(() => {
      if (focusLocation) {
        // Fly to the specified location with animation
        map.flyTo(
          [focusLocation.latitude, focusLocation.longitude],
          focusLocation.zoom || 15,
          {
            duration: 1.5,
            easeLinearity: 0.25,
          }
        );
      }
    }, [focusLocation, map]);

    return null;
  }

  /**
   * Format date for display
   */
  function formatDate(dateString?: string): string {
    if (!dateString) return '未知时间';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Extract text from description JSONContent
   */
  function extractDescription(description: any): string {
    if (!description || !description.content) return '';

    let text = '';
    for (const node of description.content) {
      if (node.type === 'paragraph' && node.content) {
        for (const item of node.content) {
          if (item.type === 'text' && item.text) {
            text += item.text;
          }
        }
        text += '\n';
      }
    }
    return text.trim();
  }

  /**
   * Custom popup content for a location - Story-based view with thumbnail grid
   */
  function LocationPopupContent({ location }: { location: PhotoLocation }) {
    // Get the first photo for main display
    const firstPhoto = location.photos[0];
    const photoUserId = (firstPhoto as any).userId || userId;
    const userName = (firstPhoto as any).userName || 'Anonymous';
    const description = extractDescription((firstPhoto as any).description);

    // Get up to 4 photos for thumbnail display
    const displayPhotos = location.photos.slice(0, 4);
    const remainingCount = location.photos.length - displayPhotos.length;

    return (
      <div className="min-w-[280px] max-w-[320px]">
        {/* Photo Thumbnails Grid (up to 4 photos) */}
        {location.photos.length === 1 ? (
          // Single photo - large display
          <button
            type="button"
            onClick={() => onPhotoClick?.(firstPhoto.id)}
            className="relative w-full aspect-[4/3] bg-muted rounded-lg overflow-hidden mb-3 hover:ring-2 hover:ring-primary transition-all cursor-pointer"
          >
            <Image
              src={firstPhoto.fileUrl}
              alt={firstPhoto.fileName}
              fill
              className="object-cover"
              sizes="320px"
              unoptimized
            />
          </button>
        ) : (
          // Multiple photos - grid display
          <div className="mb-3">
            <div className="grid grid-cols-2 gap-2">
              {displayPhotos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => onPhotoClick?.(photo.id)}
                  className="relative aspect-square bg-muted rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all cursor-pointer"
                >
                  <Image
                    src={photo.fileUrl}
                    alt={photo.fileName}
                    fill
                    className="object-cover"
                    sizes="150px"
                    unoptimized
                  />
                  {/* Show indicator for first photo */}
                  {index === 0 && (
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/50 text-white text-[10px] font-medium rounded">
                      主图
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Remaining photos indicator */}
            {remainingCount > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                +{remainingCount} more photo{remainingCount !== 1 ? 's' : ''} at this location
              </p>
            )}
          </div>
        )}

        {/* Story Info */}
        <div className="space-y-2">
          {/* Who - 谁 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">👤</span>
            <span className="text-sm font-medium">{userName}</span>
          </div>

          {/* When - 什么时候 */}
          {getPhotoDateTime(firstPhoto) && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">📅</span>
              <span className="text-xs text-muted-foreground">{formatDate(getPhotoDateTime(firstPhoto)!)}</span>
            </div>
          )}

          {/* Where - 在哪里 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">📍</span>
            <span className="text-xs text-muted-foreground font-mono">
              {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </span>
          </div>

          {/* Feeling/Description - 感受 */}
          {description && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground mt-0.5">💭</span>
                <p className="text-sm text-foreground line-clamp-3 flex-1">
                  {description}
                </p>
              </div>
            </div>
          )}

          {/* Click to view details */}
          <button
            type="button"
            onClick={() => onPhotoClick?.(firstPhoto.id)}
            className="w-full mt-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded transition-colors"
          >
            查看详情 →
          </button>
        </div>
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
          zoom={initialZoom ?? (photoLocations.length === 1 ? 13 : 4)}
          style={{ height: '100%', width: '100%' }}
          className="rounded-lg"
        >
          {/* Map Focus Controller */}
          <MapFocusController focusLocation={focusLocation} />

          {/* OpenStreetMap Tiles */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Highlight Area Circle */}
          {highlightArea && (
            <Circle
              center={highlightArea.center}
              radius={highlightArea.radius}
              pathOptions={{
                color: highlightArea.color || '#3b82f6',
                fillColor: highlightArea.fillColor || '#3b82f6',
                fillOpacity: 0.15,
                weight: 3,
                dashArray: '10, 10',
              }}
            >
              {highlightArea.label && (
                <Tooltip permanent direction="center" className="text-center font-semibold text-lg">
                  {highlightArea.label}
                </Tooltip>
              )}
            </Circle>
          )}

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
