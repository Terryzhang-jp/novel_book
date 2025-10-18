import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { documentStorage } from "@/lib/storage/document-storage";
import { StorageError } from "@/lib/storage/errors";

/**
 * GET /api/documents
 * 获取当前用户的所有文档列表
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuth(request);
    const documents = await documentStorage.findByUserId(session.userId);

    return NextResponse.json({ documents });
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Get documents error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents
 * 创建新文档
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth(request);
    const { title, content } = await request.json();

    const document = await documentStorage.create(
      session.userId,
      title || "Untitled",
      content
    );

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Create document error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
