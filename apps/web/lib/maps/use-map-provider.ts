/**
 * useMapProvider React Hook
 *
 * Custom hook to access the map provider in React components.
 * This hook creates and memoizes a MapProvider instance based on
 * environment configuration.
 *
 * The map provider is determined by the NEXT_PUBLIC_MAP_PROVIDER
 * environment variable. To switch providers, simply update .env.local
 * and restart the development server.
 *
 * @example
 * ```typescript
 * function LocationPicker() {
 *   const mapProvider = useMapProvider();
 *
 *   const handleGeocode = async () => {
 *     const coords = await mapProvider.geocode("Paris, France");
 *     console.log(coords); // { latitude: 48.8566, longitude: 2.3522 }
 *   };
 *
 *   return <button onClick={handleGeocode}>Find Paris</button>;
 * }
 * ```
 */

'use client';

import { useMemo } from 'react';
import type { MapProvider } from './types';
import { createMapProvider, getDefaultMapConfig } from './map-provider-factory';

/**
 * Hook to get the current map provider instance
 *
 * The provider is memoized and will only be created once per component mount.
 * The configuration is read from environment variables on the client side.
 *
 * @returns MapProvider instance (LeafletMapProvider by default)
 *
 * @example
 * ```typescript
 * const mapProvider = useMapProvider();
 *
 * // Forward geocoding
 * const coords = await mapProvider.geocode("Tokyo, Japan");
 *
 * // Reverse geocoding
 * const address = await mapProvider.reverseGeocode({ latitude: 35.6762, longitude: 139.6503 });
 *
 * // Parse Google Maps URL
 * const result = await mapProvider.parseGoogleMapsUrl("https://maps.app.goo.gl/xyz");
 * ```
 */
export function useMapProvider(): MapProvider {
  // Get configuration from environment variables
  const config = useMemo(() => getDefaultMapConfig(), []);

  // Create provider instance (memoized)
  const provider = useMemo(() => {
    try {
      return createMapProvider(config);
    } catch (error) {
      console.error('Failed to create map provider:', error);
      // Fallback to Leaflet if there's an error
      console.log('Falling back to Leaflet provider');
      return createMapProvider({
        ...config,
        provider: 'leaflet',
      });
    }
  }, [config]);

  return provider;
}

/**
 * Hook to get the current map configuration
 *
 * Useful for debugging or displaying configuration in UI.
 *
 * @returns Current MapConfig
 *
 * @example
 * ```typescript
 * const config = useMapConfig();
 * console.log(`Using ${config.provider} map provider`);
 * ```
 */
export function useMapConfig() {
  return useMemo(() => getDefaultMapConfig(), []);
}
