/**
 * PhotoMap Component
 *
 * A wrapper that dynamically loads the PhotoMap implementation
 * with SSR disabled to avoid Leaflet's window dependency issues.
 */

'use client';

import dynamic from 'next/dynamic';
import { Loader2, MapPin } from 'lucide-react';
import type { Photo } from '@/types/storage';

// Re-export types from implementation
export type { PhotoLocation, PhotoWithOptionalUserId } from './photo-map-impl';

// Minimal photo interface for map display (duplicated for type exports)
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

type PhotoWithOptionalUserId = Photo | MapPhoto;

export interface PhotoMapProps {
  photos: PhotoWithOptionalUserId[];
  userId: string;
  onLocationClick?: (location: any) => void;
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

// Loading component shown while the map loads
function MapLoading({ height, className }: { height?: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-muted rounded-lg ${className || ''}`}
      style={{ height: height || '600px' }}
    >
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    </div>
  );
}

// Dynamically import the map implementation with SSR disabled
const PhotoMapImpl = dynamic(
  () => import('./photo-map-impl').then((mod) => mod.PhotoMapImpl),
  {
    ssr: false,
    loading: () => <MapLoading />,
  }
);

/**
 * PhotoMap Component
 *
 * Shows photos on a Leaflet map with markers and popups.
 * This is a wrapper that handles dynamic loading of the actual map implementation.
 */
export function PhotoMap(props: PhotoMapProps) {
  return <PhotoMapImpl {...props} />;
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

export default PhotoMap;
