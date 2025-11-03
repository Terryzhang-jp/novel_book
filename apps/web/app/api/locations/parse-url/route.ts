/**
 * API Route: /api/locations/parse-url
 *
 * Parses a Google Maps URL to extract coordinates and optional place name.
 * Supports multiple Google Maps URL formats:
 * - Standard: https://www.google.com/maps/place/.../@48.8584,2.2945,17z
 * - Search: https://www.google.com/maps/search/48.8584,2.2945
 * - Query: https://www.google.com/maps?q=48.8584,2.2945
 * - Short: https://maps.app.goo.gl/xyz (will be expanded first)
 *
 * Method: POST
 * Body: { url: string }
 * Response: { position: { latitude: number, longitude: number }, name?: string }
 */

import { NextResponse } from 'next/server';
import { createMapProvider, getDefaultMapConfig } from '@/lib/maps/map-provider-factory';

export const runtime = 'nodejs';

/**
 * Parse a Google Maps URL to extract coordinates
 */
export async function POST(req: Request) {
  try {
    console.log('[parse-url] Received request');
    const body = await req.json();
    const { url } = body;
    console.log('[parse-url] URL:', url);

    if (!url || typeof url !== 'string') {
      console.log('[parse-url] Invalid URL format');
      return NextResponse.json(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate that it's a Google Maps URL
    if (!url.includes('google.com/maps') && !url.includes('goo.gl')) {
      console.log('[parse-url] Not a Google Maps URL');
      return NextResponse.json(
        { error: 'Invalid Google Maps URL' },
        { status: 400 }
      );
    }

    // Get the map provider
    console.log('[parse-url] Creating map provider');
    const config = getDefaultMapConfig();
    const mapProvider = createMapProvider(config);

    // If it's a short URL, expand it first by following redirects
    let urlToParse = url;
    if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
      try {
        // Follow redirects to get the full URL
        const response = await fetch(url, {
          redirect: 'follow',
          method: 'HEAD',
        });
        urlToParse = response.url;
        console.log('[parse-url] Expanded short URL:', url, '→', urlToParse);
      } catch (error) {
        console.warn('[parse-url] Failed to expand short URL, attempting to parse original:', url, error);
        // If expansion fails, continue with original URL
      }
    }

    // Parse the URL using the map provider
    console.log('[parse-url] Parsing URL with map provider:', urlToParse);
    const result = await mapProvider.parseGoogleMapsUrl(urlToParse);
    console.log('[parse-url] Parse result:', result);

    if (!result) {
      console.log('[parse-url] Failed to extract coordinates');
      return NextResponse.json(
        {
          error: 'Could not parse coordinates from URL',
          url: urlToParse,
        },
        { status: 400 }
      );
    }

    console.log('[parse-url] Successfully parsed, returning result');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[parse-url] Error parsing Google Maps URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
