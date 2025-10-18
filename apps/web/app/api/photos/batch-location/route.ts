/**
 * API Route: /api/photos/batch-location
 *
 * Batch assign a location to multiple photos
 * This is used for the batch drag & drop feature
 *
 * POST - Assign location to multiple photos at once
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { photoStorage } from "@/lib/storage/photo-storage";
import { locationStorage } from "@/lib/storage/location-storage";
import { NotFoundError } from "@/lib/storage/errors";

export const runtime = "nodejs";

/**
 * POST /api/photos/batch-location
 * Batch assign a location to multiple photos
 *
 * Body: {
 *   photoIds: string[],
 *   locationId: string
 * }
 *
 * Response: {
 *   success: number,
 *   failed: number,
 *   location: { id, name, usageCount }
 * }
 */
export async function POST(req: Request) {
  try {
    // 验证用户身份
    const session = await requireAuth(req);

    // 解析请求体
    const body = await req.json();
    const { photoIds, locationId } = body;

    // 验证输入
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json(
        { error: "photoIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!locationId || typeof locationId !== "string") {
      return NextResponse.json(
        { error: "locationId is required and must be a string" },
        { status: 400 }
      );
    }

    // 验证地点存在且属于用户
    const location = await locationStorage.findById(locationId, session.userId);
    if (!location) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    // 批量更新照片
    const result = await photoStorage.batchSetLocation(
      photoIds,
      session.userId,
      locationId
    );

    // 获取更新后的地点信息（包含新的usageCount）
    const updatedLocation = await locationStorage.findById(
      locationId,
      session.userId
    );

    return NextResponse.json({
      success: result.success,
      failed: result.failed,
      location: updatedLocation
        ? {
            id: updatedLocation.id,
            name: updatedLocation.name,
            usageCount: updatedLocation.usageCount,
          }
        : null,
      message: `Successfully updated ${result.success} photo(s)${
        result.failed > 0 ? `, ${result.failed} failed` : ""
      }`,
    });
  } catch (error) {
    console.error("Batch set location error:", error);

    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
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
        error: "Failed to batch assign location",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
