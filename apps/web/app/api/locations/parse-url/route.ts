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
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate that it's a Google Maps URL
    if (!url.includes('google.com/maps') && !url.includes('goo.gl')) {
      return NextResponse.json(
        { error: 'Invalid Google Maps URL' },
        { status: 400 }
      );
    }

    // Get the map provider
    const config = getDefaultMapConfig();
    const mapProvider = createMapProvider(config);

    // If it's a short URL, expand it first
    let urlToParse = url;
    if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
      // Expand the short URL
      const expandResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/locations/expand-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
        }
      );

      if (expandResponse.ok) {
        const expandData = await expandResponse.json();
        urlToParse = expandData.expandedUrl;
      } else {
        console.warn('Failed to expand short URL, attempting to parse original:', url);
      }
    }

    // Parse the URL using the map provider
    const result = await mapProvider.parseGoogleMapsUrl(urlToParse);

    if (!result) {
      return NextResponse.json(
        {
          error: 'Could not parse coordinates from URL',
          url: urlToParse,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error parsing Google Maps URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
