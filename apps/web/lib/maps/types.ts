/**
 * Map Abstraction Layer Types
 *
 * This file defines the interfaces for the map provider abstraction layer,
 * allowing the application to switch between different map providers
 * (Leaflet/OpenStreetMap, Mapbox, Google Maps) without changing application code.
 */

/**
 * Map provider configuration
 */
export interface MapConfig {
  provider: 'leaflet' | 'mapbox' | 'google';
  apiKey?: string; // Required for Mapbox and Google Maps
  defaultCenter: [number, number]; // [latitude, longitude]
  defaultZoom: number;
}

/**
 * Coordinate point (lat/lng)
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Geocoding result (from reverse geocoding: coordinates → address)
 */
export interface GeocodingResult {
  formattedAddress: string; // Full address string
  country?: string;
  state?: string; // Province/State
  city?: string;
  postalCode?: string;
  placeId?: string; // Provider-specific place identifier
}

/**
 * Map marker for displaying photos or locations
 */
export interface MapMarker {
  id: string; // Unique identifier
  position: LatLng; // Marker position
  title?: string; // Marker tooltip
  photoUrl?: string; // Associated photo (if any)
  onClick?: () => void; // Click handler
}

/**
 * Result from parsing a Google Maps URL
 */
export interface GoogleMapsParseResult {
  position: LatLng; // Extracted coordinates
  name?: string; // Place name (if available in URL)
}

/**
 * Map Provider Interface
 *
 * All map providers must implement this interface.
 * This ensures that the application can switch providers
 * by simply changing an environment variable.
 */
export interface MapProvider {
  /**
   * Forward geocoding: address string → coordinates
   * @param address - Address to geocode (e.g., "Paris, France")
   * @returns Coordinates or null if not found
   */
  geocode(address: string): Promise<LatLng | null>;

  /**
   * Reverse geocoding: coordinates → address
   * @param position - Coordinates to reverse geocode
   * @returns Address information or null if not found
   */
  reverseGeocode(position: LatLng): Promise<GeocodingResult | null>;

  /**
   * Parse Google Maps URL to extract coordinates
   * Supports multiple URL formats:
   * - Standard: https://www.google.com/maps/place/.../@48.8584,2.2945,17z
   * - Search: https://www.google.com/maps/search/48.8584,2.2945
   * - Query: https://www.google.com/maps?q=48.8584,2.2945
   * - Short: https://maps.app.goo.gl/xyz (requires expansion first)
   *
   * @param url - Google Maps URL
   * @returns Parsed coordinates and optional name, or null if parsing fails
   */
  parseGoogleMapsUrl(url: string): Promise<GoogleMapsParseResult | null>;

  /**
   * Expand a short Google Maps URL (goo.gl) to full URL
   * This is done server-side by following HTTP redirects
   *
   * @param shortUrl - Short URL (e.g., https://maps.app.goo.gl/xyz)
   * @returns Expanded full URL
   */
  expandShortUrl(shortUrl: string): Promise<string>;
}
