/**
 * PhotoMap Implementation Component
 *
 * This is the actual map implementation that uses react-leaflet.
 * It should be loaded dynamically with SSR disabled via the photo-map.tsx wrapper.
 */

'use client';

// Leaflet CSS must be imported before any Leaflet components
import 'leaflet/dist/leaflet.css';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Tooltip, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import type { Photo } from '@/types/storage';

// Fix Leaflet default marker icon issue in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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

export interface PhotoMapImplProps {
  photos: PhotoWithOptionalUserId[];
  userId: string;
  onLocationClick?: (location: PhotoLocation) => void;
  className?: string;
  height?: string;
  focusLocation?: {
    latitude: number;
    longitude: number;
    zoom?: number;
  } | null;
  initialZoom?: number;
  highlightArea?: {
    center: [number, number];
    radius: number;
    color?: string;
    fillColor?: string;
    label?: string;
  } | null;
}

export interface PhotoLocation {
  latitude: number;
  longitude: number;
  photos: PhotoWithOptionalUserId[];
}

export type { PhotoWithOptionalUserId };

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
 * PhotoMapImpl Component
 */
export function PhotoMapImpl({
  photos,
  userId,
  onLocationClick,
  className = '',
  height = '600px',
  focusLocation = null,
  initialZoom,
  highlightArea = null,
}: PhotoMapImplProps) {
  /**
   * Group photos by location
   */
  const photoLocations = useMemo((): PhotoLocation[] => {
    const locationMap = new Map<string, PhotoLocation>();

    photos.forEach((photo) => {
      const location = getPhotoLocation(photo);
      if (!location) return;

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
      return [35.9915, 139.0842]; // Default: Chichibu
    }

    const avgLat = photoLocations.reduce((sum, loc) => sum + loc.latitude, 0) / photoLocations.length;
    const avgLng = photoLocations.reduce((sum, loc) => sum + loc.longitude, 0) / photoLocations.length;

    return [avgLat, avgLng];
  }, [photoLocations]);

  /**
   * Calculate optimal zoom level
   */
  const optimalZoom = useMemo((): number => {
    if (photoLocations.length === 0) return 4;
    if (photoLocations.length === 1) return 15;

    const lats = photoLocations.map(l => l.latitude);
    const lngs = photoLocations.map(l => l.longitude);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);

    const maxSpan = Math.max(latSpan, lngSpan);
    if (maxSpan < 0.01) return 15;
    if (maxSpan < 0.05) return 13;
    if (maxSpan < 0.1) return 11;
    if (maxSpan < 0.5) return 9;
    if (maxSpan < 1) return 8;
    if (maxSpan < 5) return 6;
    if (maxSpan < 10) return 5;
    return 4;
  }, [photoLocations]);

  /**
   * Custom popup content for a location
   */
  function LocationPopupContent({ location }: { location: PhotoLocation }) {
    const firstPhoto = location.photos[0];
    const userName = (firstPhoto as any).userName || 'Anonymous';
    const description = extractDescription((firstPhoto as any).description);
    const displayPhotos = location.photos.slice(0, 4);
    const remainingCount = location.photos.length - displayPhotos.length;

    return (
      <div className="min-w-[280px] max-w-[320px]">
        {location.photos.length === 1 ? (
          <button
            type="button"
            onClick={() => onLocationClick?.(location)}
            className="relative w-full aspect-[4/3] bg-muted rounded-lg overflow-hidden mb-3 hover:ring-2 hover:ring-primary transition-all cursor-pointer"
          >
            <img
              src={firstPhoto.fileUrl}
              alt={firstPhoto.fileName}
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </button>
        ) : (
          <div className="mb-3">
            <div className="grid grid-cols-2 gap-2">
              {displayPhotos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => onLocationClick?.(location)}
                  className="relative aspect-square bg-muted rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all cursor-pointer"
                >
                  <img
                    src={photo.fileUrl}
                    alt={photo.fileName}
                    crossOrigin="anonymous"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {index === 0 && (
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/50 text-white text-[10px] font-medium rounded">
                      主图
                    </div>
                  )}
                </button>
              ))}
            </div>
            {remainingCount > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                +{remainingCount} more photo{remainingCount !== 1 ? 's' : ''} at this location
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">👤</span>
            <span className="text-sm font-medium">{userName}</span>
          </div>

          {getPhotoDateTime(firstPhoto) && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">📅</span>
              <span className="text-xs text-muted-foreground">{formatDate(getPhotoDateTime(firstPhoto)!)}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">📍</span>
            <span className="text-xs text-muted-foreground font-mono">
              {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </span>
          </div>

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

          <button
            type="button"
            onClick={() => onLocationClick?.(location)}
            className="w-full mt-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded transition-colors"
          >
            查看详情 →
          </button>
        </div>
      </div>
    );
  }

  // No photos with location
  if (photoLocations.length === 0) {
    return (
      <div className={`h-full flex flex-col items-center justify-center bg-muted rounded-lg border-2 border-dashed border-border ${className}`} style={{ height }}>
        <MapPin className="w-12 h-12 text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold mb-2">No photos with location data</h3>
        <p className="text-sm text-muted-foreground">
          Photos with GPS coordinates will appear on the map
        </p>
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <MapContainer
        center={mapCenter}
        zoom={initialZoom ?? optimalZoom}
        style={{ height: '100%', width: '100%' }}
        className="rounded-lg z-0"
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <MapFocusController focusLocation={focusLocation} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

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

        {photoLocations.map((location, index) => (
          <PhotoMarker
            key={`${location.latitude}-${location.longitude}-${index}`}
            location={location}
            LocationPopupContent={LocationPopupContent}
          />
        ))}
      </MapContainer>
    </div>
  );
}

// Helper component to render a marker with a custom icon
function PhotoMarker({ location, LocationPopupContent }: { location: PhotoLocation; LocationPopupContent: React.FC<{ location: PhotoLocation }> }) {
  const firstPhoto = location.photos[0];
  const count = location.photos.length;

  const customIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-photo-marker',
      html: `
        <div class="relative group cursor-pointer transform transition-transform hover:scale-110 hover:z-50">
          <div class="absolute inset-[-8px]"></div>
          <div class="relative w-14 h-14 md:w-16 md:h-16 bg-white p-1 rounded-lg shadow-lg border border-gray-200 overflow-hidden">
            <img src="${firstPhoto.fileUrl}" crossorigin="anonymous" class="w-full h-full object-cover rounded-md" alt="marker" />
          </div>
          ${count > 1 ? `
            <div class="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
              ${count}
            </div>
          ` : ''}
          <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white filter drop-shadow-sm"></div>
        </div>
      `,
      iconSize: [56, 56],
      iconAnchor: [28, 62],
      popupAnchor: [0, -56],
    });
  }, [firstPhoto, count]);

  return (
    <Marker position={[location.latitude, location.longitude]} icon={customIcon}>
      <Popup maxWidth={320} offset={[0, -10]}>
        <LocationPopupContent location={location} />
      </Popup>
    </Marker>
  );
}

export default PhotoMapImpl;
