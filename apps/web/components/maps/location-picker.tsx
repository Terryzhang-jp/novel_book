/**
 * LocationPicker Component
 *
 * A comprehensive location selection component that supports:
 * 1. Clicking on an interactive map
 * 2. Pasting Google Maps URLs (including short links)
 * 3. Manual coordinate entry
 * 4. Automatic reverse geocoding (coordinates → address)
 *
 * This component is designed to be used in:
 * - Location library creation page
 * - Photo location assignment
 */

'use client';

import { useState, useCallback } from 'react';
import { Loader2, MapPin, Link as LinkIcon } from 'lucide-react';
import { LeafletMap } from './leaflet-map';
import type { LatLng, GeocodingResult } from '@/lib/maps/types';

interface LocationPickerProps {
  onLocationSelect: (location: {
    coordinates: LatLng;
    address?: GeocodingResult;
  }) => void;
  initialLocation?: LatLng;
  className?: string;
}

/**
 * LocationPicker Component
 *
 * Provides multiple ways to select a location and automatically
 * reverse geocodes the selected coordinates to get address information.
 */
export function LocationPicker({
  onLocationSelect,
  initialLocation,
  className = '',
}: LocationPickerProps) {
  const [selectedLocation, setSelectedLocation] = useState<LatLng | null>(
    initialLocation || null
  );
  const [address, setAddress] = useState<GeocodingResult | null>(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [isParsingUrl, setIsParsingUrl] = useState(false);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'url'>('map');

  /**
   * Reverse geocode coordinates to get address
   */
  const reverseGeocode = useCallback(async (coords: LatLng) => {
    setIsGeocodingAddress(true);
    setError(null);

    try {
      const response = await fetch('/api/locations/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      });

      if (response.ok) {
        const addressData: GeocodingResult = await response.json();
        setAddress(addressData);
        return addressData;
      } else {
        console.warn('Failed to reverse geocode:', await response.text());
        return null;
      }
    } catch (err) {
      console.error('Reverse geocoding error:', err);
      return null;
    } finally {
      setIsGeocodingAddress(false);
    }
  }, []);

  /**
   * Handle map click - select location by clicking
   */
  const handleMapClick = useCallback(
    async (coords: LatLng) => {
      setSelectedLocation(coords);
      const addressData = await reverseGeocode(coords);
      onLocationSelect({ coordinates: coords, address: addressData || undefined });
    },
    [onLocationSelect, reverseGeocode]
  );

  /**
   * Parse Google Maps URL to extract coordinates
   */
  const handleParseUrl = useCallback(async () => {
    if (!googleMapsUrl.trim()) {
      setError('Please enter a Google Maps URL');
      return;
    }

    setIsParsingUrl(true);
    setError(null);

    try {
      const response = await fetch('/api/locations/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleMapsUrl }),
      });

      if (response.ok) {
        const data = await response.json();
        const coords: LatLng = data.position;

        setSelectedLocation(coords);
        const addressData = await reverseGeocode(coords);
        onLocationSelect({ coordinates: coords, address: addressData || undefined });

        // Clear URL input after successful parse
        setGoogleMapsUrl('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to parse URL');
      }
    } catch (err) {
      setError('Failed to parse URL. Please check the URL and try again.');
      console.error('URL parsing error:', err);
    } finally {
      setIsParsingUrl(false);
    }
  }, [googleMapsUrl, onLocationSelect, reverseGeocode]);

  /**
   * Handle Enter key in URL input
   */
  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleParseUrl();
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Tab Selector */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'map'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MapPin className="w-4 h-4 inline-block mr-2" />
          Select on Map
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('url')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'url'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <LinkIcon className="w-4 h-4 inline-block mr-2" />
          Google Maps Link
        </button>
      </div>

      {/* Map Tab */}
      {activeTab === 'map' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Click anywhere on the map to select a location
          </p>
          <LeafletMap
            center={
              selectedLocation
                ? [selectedLocation.latitude, selectedLocation.longitude]
                : undefined
            }
            markers={
              selectedLocation
                ? [
                    {
                      position: [
                        selectedLocation.latitude,
                        selectedLocation.longitude,
                      ],
                      popup: address?.formattedAddress || 'Selected location',
                    },
                  ]
                : []
            }
            onClick={handleMapClick}
            height="400px"
            className="border border-border"
          />
        </div>
      )}

      {/* URL Tab */}
      {activeTab === 'url' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste a Google Maps link (supports short links like goo.gl)
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={googleMapsUrl}
              onChange={(e) => setGoogleMapsUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              placeholder="https://maps.app.goo.gl/... or https://www.google.com/maps/..."
              className="flex-1 px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isParsingUrl}
            />
            <button
              type="button"
              onClick={handleParseUrl}
              disabled={isParsingUrl || !googleMapsUrl.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isParsingUrl ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                  Parsing...
                </>
              ) : (
                'Parse'
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Show map with parsed location */}
          {selectedLocation && (
            <div className="pt-4">
              <p className="text-sm text-muted-foreground mb-2">Parsed location:</p>
              <LeafletMap
                center={[selectedLocation.latitude, selectedLocation.longitude]}
                markers={[
                  {
                    position: [
                      selectedLocation.latitude,
                      selectedLocation.longitude,
                    ],
                    popup: address?.formattedAddress || 'Parsed location',
                  },
                ]}
                height="300px"
                className="border border-border"
              />
            </div>
          )}
        </div>
      )}

      {/* Selected Location Info */}
      {selectedLocation && (
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium">Selected Coordinates:</p>
              <p className="text-sm text-muted-foreground font-mono">
                {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
              </p>
            </div>
            {isGeocodingAddress && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {address && (
            <div>
              <p className="text-sm font-medium">Address:</p>
              <p className="text-sm text-muted-foreground">{address.formattedAddress}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
