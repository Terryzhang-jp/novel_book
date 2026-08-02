import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { documentStorage } from "@/lib/storage/document-storage";
import { StorageError } from "@/lib/storage/errors";
import { isAuthRequiredError } from "@/lib/auth/helpers";

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
    // 未认证要返回 401 而不是 500 —— 否则客户端无法区分「请先登录」和
    // 「服务端炸了」，监控里也会把正常的未登录流量记成错误。
    // 见 lib/auth/helpers.ts 的 AuthRequiredError。
    if (isAuthRequiredError(error)) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

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
    // 未认证要返回 401 而不是 500 —— 否则客户端无法区分「请先登录」和
    // 「服务端炸了」，监控里也会把正常的未登录流量记成错误。
    // 见 lib/auth/helpers.ts 的 AuthRequiredError。
    if (isAuthRequiredError(error)) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

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
