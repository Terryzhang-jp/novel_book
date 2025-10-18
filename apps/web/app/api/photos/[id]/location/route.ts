/**
 * API Route: /api/photos/[id]/location
 *
 * Manages the location association for a single photo
 *
 * PUT    - Set/update photo location (associate with location library)
 * DELETE - Remove photo location association
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";
import { NotFoundError, UnauthorizedError } from "@/lib/storage/errors";

export const runtime = "nodejs";

/**
 * PUT /api/photos/[id]/location
 * Associate a photo with a location from the location library
 *
 * Body: {
 *   locationId: string
 * }
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const { id: photoId } = await params;

    // 解析请求体
    const body = await req.json();
    const { locationId } = body;

    if (!locationId || typeof locationId !== "string") {
      return NextResponse.json(
        { error: "locationId is required and must be a string" },
        { status: 400 }
      );
    }

    // 设置照片地点
    const photo = await photoStorage.setLocation(
      photoId,
      session.userId,
      locationId
    );

    return NextResponse.json({
      photo,
      message: "Location set successfully",
    });
  } catch (error) {
    console.error("Set photo location error:", error);

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: error.message.includes("Photo") ? "Photo not found" : "Location not found" },
        { status: 404 }
      );
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "You don't have permission to update this photo" },
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
        error: "Failed to set photo location",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/photos/[id]/location
 * Remove location association from a photo
 *
 * This removes the locationId reference and resets the location source.
 * If the photo has EXIF location data, it will revert to that.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    const { id: photoId } = await params;

    // 移除照片地点
    const photo = await photoStorage.removeLocation(photoId, session.userId);

    return NextResponse.json({
      photo,
      message: "Location removed successfully",
    });
  } catch (error) {
    console.error("Remove photo location error:", error);

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: "Photo not found" },
        { status: 404 }
      );
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "You don't have permission to update this photo" },
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
        error: "Failed to remove photo location",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
