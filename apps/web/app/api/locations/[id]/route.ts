/**
 * API Route: /api/locations/[id]
 *
 * Manages a single location
 *
 * GET    - Get location details
 * PUT    - Update location
 * DELETE - Delete location
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { locationStorage } from "@/lib/storage/location-storage";
import { NotFoundError, UnauthorizedError } from "@/lib/storage/errors";

export const runtime = "nodejs";

/**
 * GET /api/locations/[id]
 * Get a single location's details
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const { id: locationId } = await params;

    // 获取地点
    const location = await locationStorage.findById(locationId, session.userId);

    if (!location) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ location });
  } catch (error) {
    console.error("Get location error:", error);

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get location" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/locations/[id]
 * Update a location
 *
 * Body: {
 *   name?: string,
 *   coordinates?: { latitude: number, longitude: number },
 *   address?: { ... },
 *   category?: string,
 *   notes?: string
 * }
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const { id: locationId } = await params;

    // 解析请求体
    const body = await req.json();
    const { name, coordinates, address, category, notes } = body;

    // 验证坐标（如果提供）
    if (coordinates) {
      if (
        typeof coordinates.latitude !== "number" ||
        typeof coordinates.longitude !== "number"
      ) {
        return NextResponse.json(
          { error: "Coordinates must have latitude and longitude as numbers" },
          { status: 400 }
        );
      }

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
    }

    // 构建更新对象
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (coordinates !== undefined) updates.coordinates = coordinates;
    if (address !== undefined) updates.address = address;
    if (category !== undefined) updates.category = category;
    if (notes !== undefined) updates.notes = notes;

    // 更新地点
    const location = await locationStorage.update(
      locationId,
      session.userId,
      updates
    );

    return NextResponse.json({
      location,
      message: "Location updated successfully",
    });
  } catch (error) {
    console.error("Update location error:", error);

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "You don't have permission to update this location" },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update location",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/locations/[id]
 * Delete a location
 *
 * Note: This does NOT remove the location from photos that reference it.
 * Photos will keep their coordinates but lose the library link.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const { id: locationId } = await params;

    // 删除地点
    await locationStorage.delete(locationId, session.userId);

    return NextResponse.json({
      success: true,
      message: "Location deleted successfully",
    });
  } catch (error) {
    console.error("Delete location error:", error);

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "You don't have permission to delete this location" },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === "Please login to continue") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to delete location",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
