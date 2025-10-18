/**
 * LeafletMap Component
 *
 * A wrapper around react-leaflet that handles:
 * - SSR compatibility (dynamic import)
 * - Leaflet CSS loading
 * - Map initialization and cleanup
 * - Click events for location selection
 *
 * This component must be used with 'use client' and dynamic imports.
 */

'use client';

import { useEffect, useState } from 'react';
import type { LatLng } from '@/lib/maps/types';

// Leaflet types (will be available after install)
type LeafletLatLng = [number, number];

interface LeafletMapProps {
  center?: LeafletLatLng;
  zoom?: number;
  markers?: Array<{
    position: LeafletLatLng;
    popup?: string;
  }>;
  onClick?: (position: LatLng) => void;
  className?: string;
  height?: string;
}

/**
 * Client-side Leaflet Map Component
 *
 * Note: This component requires the following packages to be installed:
 * - react-leaflet
 * - leaflet
 * - @types/leaflet (dev dependency)
 *
 * Run: pnpm add react-leaflet leaflet && pnpm add -D @types/leaflet
 */
export function LeafletMap({
  center = [39.9042, 116.4074], // Default: Beijing
  zoom = 13,
  markers = [],
  onClick,
  className = '',
  height = '400px',
}: LeafletMapProps) {
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
      console.error('Please install required packages: pnpm add react-leaflet leaflet');
    });
  }, []);

  // Show loading state until client-side
  if (!isClient || !mapComponents) {
    return (
      <div
        className={`flex items-center justify-center bg-muted rounded-lg ${className}`}
        style={{ height }}
      >
        <div className="text-center">
          <div className="text-2xl mb-2">🗺️</div>
          <p className="text-sm text-muted-foreground">
            {!mapComponents ? 'Loading map...' : 'Initializing...'}
          </p>
          {!isClient && (
            <p className="text-xs text-muted-foreground mt-1">
              Map requires client-side rendering
            </p>
          )}
        </div>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup, useMapEvents } = mapComponents;

  // Component to handle map click events
  function MapClickHandler() {
    useMapEvents({
      click: (e: any) => {
        if (onClick) {
          onClick({
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
          });
        }
      },
    });
    return null;
  }

  return (
    <div className={className} style={{ height }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        className="rounded-lg"
      >
        {/* OpenStreetMap Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Click event handler */}
        <MapClickHandler />

        {/* Render markers */}
        {markers.map((marker, index) => (
          <Marker key={index} position={marker.position}>
            {marker.popup && <Popup>{marker.popup}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

/**
 * Fallback component for when Leaflet packages are not installed
 */
export function LeafletMapPlaceholder({
  className = '',
  height = '400px',
}: {
  className?: string;
  height?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center bg-muted rounded-lg border-2 border-dashed border-border ${className}`}
      style={{ height }}
    >
      <div className="text-center p-6">
        <div className="text-4xl mb-4">🗺️</div>
        <h3 className="text-lg font-semibold mb-2">Map Component</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Leaflet packages need to be installed
        </p>
        <div className="bg-background rounded-md p-3 text-left">
          <code className="text-xs">
            pnpm add react-leaflet leaflet
            <br />
            pnpm add -D @types/leaflet
          </code>
        </div>
      </div>
    </div>
  );
}
