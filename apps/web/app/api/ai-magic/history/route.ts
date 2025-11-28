/**
 * AI Magic History API
 *
 * 管理用户的 AI 图像生成历史
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { aiMagicStorage } from "@/lib/storage/ai-magic-storage";

/**
 * GET: 获取用户历史记录列表
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;

    // 检查是否请求完整数据还是仅索引
    const url = new URL(req.url);
    const full = url.searchParams.get("full") === "true";

    if (full) {
      const history = await aiMagicStorage.getHistory(userId);
      return NextResponse.json({ history });
    }

    const index = await aiMagicStorage.getHistoryIndex(userId);
    return NextResponse.json({ history: index });
  } catch (error) {
    console.error("Failed to get AI Magic history:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get history",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 删除历史记录
 */
export async function DELETE(req: Request) {
  try {
    const session = await requireAuth(req);
    const userId = session.userId;

    const url = new URL(req.url);
    const itemId = url.searchParams.get("id");
    const clearAll = url.searchParams.get("clearAll") === "true";

    if (clearAll) {
      await aiMagicStorage.clearHistory(userId);
      return NextResponse.json({ success: true, message: "History cleared" });
    }

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    const deleted = await aiMagicStorage.deleteHistoryItem(userId, itemId);

    if (!deleted) {
      return NextResponse.json(
        { error: "History item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete AI Magic history:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete history item",
      },
      { status: 500 }
    );
  }
}
