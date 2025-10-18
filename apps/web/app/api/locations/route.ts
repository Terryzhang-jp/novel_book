/**
 * API Route: /api/locations
 *
 * Manages user's location library
 *
 * GET  - List all user locations (sorted by usage count)
 * POST - Create a new location
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { locationStorage } from "@/lib/storage/location-storage";

export const runtime = "nodejs";

/**
 * GET /api/locations
 * List all locations for the authenticated user
 *
 * Returns locations sorted by usage count (most used first)
 */
export async function GET(req: Request) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    // 获取用户的所有地点
    const locations = await locationStorage.findByUserId(session.userId);

    return NextResponse.json({
      locations,
      total: locations.length,
    });
  } catch (error) {
    console.error("Get locations error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get locations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/locations
 * Create a new location
 *
 * Body: {
 *   name: string,
 *   coordinates: { latitude: number, longitude: number },
 *   address?: {
 *     formattedAddress: string,
 *     country?: string,
 *     state?: string,
 *     city?: string,
 *     postalCode?: string
 *   },
 *   placeId?: string,
 *   category?: string,
 *   notes?: string
 * }
 */
export async function POST(req: Request) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    // 解析请求体
    const body = await req.json();
    const { name, coordinates, address, placeId, category, notes } = body;

    // 验证必需字段
    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required and must be a string" },
        { status: 400 }
      );
    }

    if (
      !coordinates ||
      typeof coordinates.latitude !== "number" ||
      typeof coordinates.longitude !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "Coordinates are required with latitude and longitude as numbers",
        },
        { status: 400 }
      );
    }

    // 验证坐标范围
    if (
      coordinates.latitude < -90 ||
      coordinates.latitude > 90 ||
      coordinates.longitude < -180 ||
      coordinates.longitude > 180
    ) {
      return NextResponse.json(
        { error: "Invalid coordinates" },
        { status: 400 }
      );
    }

    // 创建地点
    const location = await locationStorage.create(
      session.userId,
      name,
      coordinates,
      address,
      {
        placeId,
        category,
        notes,
      }
    );

    return NextResponse.json(
      {
        location,
        message: "Location created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create location error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to create location",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
