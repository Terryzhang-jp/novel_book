/**
 * Map Provider Factory
 *
 * Creates map provider instances based on configuration.
 * This factory pattern allows the application to switch between
 * different map providers (Leaflet, Mapbox, Google Maps) without
 * changing any application code - just update the environment variable.
 */

import type { MapConfig, MapProvider } from './types';

/**
 * Create a map provider instance based on configuration
 *
 * @param config - Map provider configuration
 * @returns MapProvider instance
 * @throws Error if provider is unknown or configuration is invalid
 *
 * @example
 * ```typescript
 * const provider = createMapProvider({
 *   provider: 'leaflet',
 *   defaultCenter: [39.9042, 116.4074],
 *   defaultZoom: 13
 * });
 *
 * const coords = await provider.geocode("Paris, France");
 * ```
 */
export function createMapProvider(config: MapConfig): MapProvider {
  switch (config.provider) {
    case 'leaflet': {
      // Import dynamically to avoid loading unused providers
      // Note: We'll implement LeafletMapProvider next
      const { LeafletMapProvider } = require('./providers/leaflet-provider');
      return new LeafletMapProvider(config);
    }

    case 'mapbox': {
      // Future implementation
      if (!config.apiKey) {
        throw new Error('Mapbox requires an API key. Set NEXT_PUBLIC_MAPBOX_API_KEY.');
      }
      // const { MapboxMapProvider } = require('./providers/mapbox-provider');
      // return new MapboxMapProvider(config);
      throw new Error('Mapbox provider not yet implemented');
    }

    case 'google': {
      // Future implementation
      if (!config.apiKey) {
        throw new Error('Google Maps requires an API key. Set NEXT_PUBLIC_GOOGLE_MAPS_KEY.');
      }
      // const { GoogleMapsProvider } = require('./providers/google-provider');
      // return new GoogleMapsProvider(config);
      throw new Error('Google Maps provider not yet implemented');
    }

    default: {
      const exhaustiveCheck: never = config.provider;
      throw new Error(`Unknown map provider: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Get default map configuration from environment variables
 *
 * @returns MapConfig with values from environment or sensible defaults
 *
 * @example
 * ```typescript
 * const config = getDefaultMapConfig();
 * const provider = createMapProvider(config);
 * ```
 */
export function getDefaultMapConfig(): MapConfig {
  const provider = (process.env.NEXT_PUBLIC_MAP_PROVIDER as MapConfig['provider']) || 'leaflet';
  const mapboxApiKey = process.env.NEXT_PUBLIC_MAPBOX_API_KEY;
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  // Default center: Beijing, China
  const defaultCenter: [number, number] = [39.9042, 116.4074];
  const defaultZoom = 13;

  return {
    provider,
    apiKey: mapboxApiKey || googleMapsKey,
    defaultCenter,
    defaultZoom,
  };
}
