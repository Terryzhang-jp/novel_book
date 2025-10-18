/**
 * Leaflet Map Provider (OpenStreetMap)
 *
 * Implementation of MapProvider interface using:
 * - Leaflet for map rendering
 * - OpenStreetMap for map tiles (free, no API key required)
 * - Nominatim for geocoding services (OpenStreetMap's geocoding API)
 *
 * This is the default provider and doesn't require any API keys.
 */

import type {
  MapConfig,
  MapProvider,
  LatLng,
  GeocodingResult,
  GoogleMapsParseResult,
} from '../types';

/**
 * Nominatim API configuration
 * Nominatim is OpenStreetMap's free geocoding service
 * Rate limit: 1 request per second for fair use
 * Documentation: https://nominatim.org/release-docs/latest/api/Overview/
 */
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * User-Agent header for Nominatim requests
 * Nominatim requires a valid User-Agent to identify your application
 */
const USER_AGENT = 'NovelBookPhotoGallery/1.0';

/**
 * Nominatim response interface (simplified)
 */
interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    country?: string;
    state?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
  };
  place_id?: number;
}

/**
 * LeafletMapProvider implementation
 */
export class LeafletMapProvider implements MapProvider {
  private config: MapConfig;

  constructor(config: MapConfig) {
    this.config = config;
  }

  /**
   * Forward geocoding: address → coordinates
   * Uses Nominatim search API
   *
   * @param address - Address string (e.g., "Paris, France")
   * @returns Coordinates or null if not found
   */
  async geocode(address: string): Promise<LatLng | null> {
    try {
      const url = new URL(`${NOMINATIM_BASE_URL}/search`);
      url.searchParams.set('q', address);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      if (!response.ok) {
        console.error('Nominatim search failed:', response.statusText);
        return null;
      }

      const results: NominatimResult[] = await response.json();

      if (results.length === 0) {
        return null;
      }

      const result = results[0];
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
      };
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Reverse geocoding: coordinates → address
   * Uses Nominatim reverse API
   *
   * @param position - Coordinates
   * @returns Address information or null if not found
   */
  async reverseGeocode(position: LatLng): Promise<GeocodingResult | null> {
    try {
      const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
      url.searchParams.set('lat', position.latitude.toString());
      url.searchParams.set('lon', position.longitude.toString());
      url.searchParams.set('format', 'json');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      if (!response.ok) {
        console.error('Nominatim reverse geocoding failed:', response.statusText);
        return null;
      }

      const result: NominatimResult = await response.json();

      return {
        formattedAddress: result.display_name,
        country: result.address?.country,
        state: result.address?.state,
        city: result.address?.city || result.address?.town || result.address?.village,
        postalCode: result.address?.postcode,
        placeId: result.place_id?.toString(),
      };
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  }

  /**
   * Parse Google Maps URL to extract coordinates
   *
   * Supports multiple URL formats:
   * 1. Standard place URL: https://www.google.com/maps/place/.../@48.8584,2.2945,17z
   * 2. Search URL: https://www.google.com/maps/search/48.8584,2.2945
   * 3. Query parameter: https://www.google.com/maps?q=48.8584,2.2945
   * 4. Direct coordinates: https://www.google.com/maps/@48.8584,2.2945,17z
   *
   * Note: Short URLs (https://maps.app.goo.gl/xyz) should be expanded first using expandShortUrl()
   *
   * @param url - Google Maps URL
   * @returns Parsed coordinates and optional name, or null if parsing fails
   */
  async parseGoogleMapsUrl(url: string): Promise<GoogleMapsParseResult | null> {
    try {
      // Clean and normalize URL
      const cleanUrl = url.trim();

      // Pattern 1: /@lat,lng,zoom or /@lat,lng
      // Example: https://www.google.com/maps/@48.8584,2.2945,17z
      const pattern1 = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const match1 = cleanUrl.match(pattern1);
      if (match1) {
        return {
          position: {
            latitude: parseFloat(match1[1]),
            longitude: parseFloat(match1[2]),
          },
        };
      }

      // Pattern 2: /search/lat,lng or q=lat,lng
      // Example: https://www.google.com/maps/search/48.8584,2.2945
      // Example: https://www.google.com/maps?q=48.8584,2.2945
      const pattern2 = /(?:search\/|q=)(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const match2 = cleanUrl.match(pattern2);
      if (match2) {
        return {
          position: {
            latitude: parseFloat(match2[1]),
            longitude: parseFloat(match2[2]),
          },
        };
      }

      // Pattern 3: /place/Name/@lat,lng
      // Example: https://www.google.com/maps/place/Eiffel+Tower/@48.8584,2.2945,17z
      const pattern3 = /\/place\/([^/]+)\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const match3 = cleanUrl.match(pattern3);
      if (match3) {
        const name = decodeURIComponent(match3[1].replace(/\+/g, ' '));
        return {
          position: {
            latitude: parseFloat(match3[2]),
            longitude: parseFloat(match3[3]),
          },
          name,
        };
      }

      // Pattern 4: ll=lat,lng (alternative query parameter)
      const pattern4 = /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      const match4 = cleanUrl.match(pattern4);
      if (match4) {
        return {
          position: {
            latitude: parseFloat(match4[1]),
            longitude: parseFloat(match4[2]),
          },
        };
      }

      console.warn('Could not parse Google Maps URL:', url);
      return null;
    } catch (error) {
      console.error('Error parsing Google Maps URL:', error);
      return null;
    }
  }

  /**
   * Expand a short Google Maps URL to full URL
   *
   * This method should be called server-side (in an API route)
   * because it requires following HTTP redirects.
   *
   * @param shortUrl - Short URL (e.g., https://maps.app.goo.gl/xyz)
   * @returns Expanded full URL
   */
  async expandShortUrl(shortUrl: string): Promise<string> {
    try {
      // Note: This needs to be done server-side due to CORS
      // We'll create a dedicated API endpoint for this: /api/locations/expand-url
      // For now, return the original URL
      console.warn('expandShortUrl should be called server-side via API endpoint');
      return shortUrl;
    } catch (error) {
      console.error('Error expanding short URL:', error);
      return shortUrl;
    }
  }
}
