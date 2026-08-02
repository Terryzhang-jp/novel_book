import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { documentStorage } from "@/lib/storage/document-storage";
import { StorageError } from "@/lib/storage/errors";
import { isAuthRequiredError } from "@/lib/auth/helpers";

/**
 * GET /api/documents/[id]
 * 获取单个文档
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const document = await documentStorage.findById(id);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // 权限检查
    if (document.userId !== session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ document });
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

    console.error("Get document error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/documents/[id]
 * 更新文档
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const data = await request.json();

    const document = await documentStorage.update(id, session.userId, data);

    return NextResponse.json({ document });
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

    console.error("Update document error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/documents/[id]
 * 删除文档
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;

    await documentStorage.delete(id, session.userId);

    return NextResponse.json({ success: true });
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

    console.error("Delete document error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
