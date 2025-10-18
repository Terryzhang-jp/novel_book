/**
 * API Route: /api/locations/expand-url
 *
 * Expands a short Google Maps URL (e.g., https://maps.app.goo.gl/xyz) to its full URL.
 * This is done server-side because it requires following HTTP redirects, which can't
 * be done reliably on the client side due to CORS restrictions.
 *
 * Method: POST
 * Body: { url: string }
 * Response: { expandedUrl: string }
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Expand a short URL by following redirects
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

    // Validate that it's a Google Maps short link
    if (!url.includes('goo.gl') && !url.includes('maps.app.goo.gl')) {
      // If it's not a short URL, return it as-is
      return NextResponse.json({ expandedUrl: url });
    }

    // Follow redirects to get the full URL
    // Using fetch with redirect: 'manual' to capture the Location header
    const response = await fetch(url, {
      method: 'HEAD', // Use HEAD to avoid downloading the full page
      redirect: 'manual', // Don't follow redirects automatically
    });

    // Get the Location header (the redirect target)
    const locationHeader = response.headers.get('Location');

    if (locationHeader) {
      // Successfully got the redirect URL
      return NextResponse.json({ expandedUrl: locationHeader });
    }

    // If no redirect found, try with GET method
    const getResponse = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
    });

    const getLocationHeader = getResponse.headers.get('Location');

    if (getLocationHeader) {
      return NextResponse.json({ expandedUrl: getLocationHeader });
    }

    // If still no redirect, return original URL
    console.warn('No redirect found for URL:', url);
    return NextResponse.json({
      expandedUrl: url,
      warning: 'Could not expand URL, returning original',
    });

  } catch (error) {
    console.error('Error expanding URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to expand URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
