/**
 * API Route: /api/locations/geocode
 *
 * Reverse geocoding: Convert coordinates to address information.
 * This is useful after a user clicks on a map to get the address at that point.
 *
 * Method: POST
 * Body: { latitude: number, longitude: number }
 * Response: {
 *   formattedAddress: string,
 *   country?: string,
 *   state?: string,
 *   city?: string,
 *   postalCode?: string,
 *   placeId?: string
 * }
 */

import { NextResponse } from 'next/server';
import { createMapProvider, getDefaultMapConfig } from '@/lib/maps/map-provider-factory';

export const runtime = 'nodejs';

/**
 * Reverse geocode coordinates to address
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { latitude, longitude } = body;

    // Validate input
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Latitude and longitude must be numbers' },
        { status: 400 }
      );
    }

    if (latitude < -90 || latitude > 90) {
      return NextResponse.json(
        { error: 'Latitude must be between -90 and 90' },
        { status: 400 }
      );
    }

    if (longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'Longitude must be between -180 and 180' },
        { status: 400 }
      );
    }

    // Get the map provider
    const config = getDefaultMapConfig();
    const mapProvider = createMapProvider(config);

    // Perform reverse geocoding
    const result = await mapProvider.reverseGeocode({ latitude, longitude });

    if (!result) {
      return NextResponse.json(
        {
          error: 'Could not find address for these coordinates',
          latitude,
          longitude,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return NextResponse.json(
      {
        error: 'Failed to reverse geocode coordinates',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
