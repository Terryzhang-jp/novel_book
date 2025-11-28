/**
 * AI Magic Storage
 *
 * 管理 AI Magic 生成历史的存储层
 */

import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import {
  atomicWriteJSON,
  readJSON,
  exists,
  ensureDir,
  safeJoin,
} from "./file-system";
import { getDataRoot } from "./init";
import type { AiMagicHistoryItem, AiMagicHistoryIndex } from "@/types/storage";

const MAX_HISTORY_ITEMS = 50; // 每个用户最多保存 50 条历史

/**
 * 获取 AI Magic 数据根目录
 */
function getAiMagicRoot(): string {
  return join(getDataRoot(), "ai-magic");
}

/**
 * 获取用户历史文件路径
 */
function getUserHistoryPath(userId: string): string {
  return safeJoin(getAiMagicRoot(), userId, "history.json");
}

/**
 * 确保用户目录存在
 */
async function ensureUserDir(userId: string): Promise<void> {
  const userDir = safeJoin(getAiMagicRoot(), userId);
  await ensureDir(userDir);
}

/**
 * 获取用户的所有历史记录
 */
export async function getHistory(userId: string): Promise<AiMagicHistoryItem[]> {
  const historyPath = getUserHistoryPath(userId);

  if (!exists(historyPath)) {
    return [];
  }

  try {
    const history = await readJSON<AiMagicHistoryItem[]>(historyPath);
    return history;
  } catch (error) {
    console.error("Failed to read AI Magic history:", error);
    return [];
  }
}

/**
 * 获取历史记录索引（用于快速显示列表）
 */
export async function getHistoryIndex(
  userId: string
): Promise<AiMagicHistoryIndex[]> {
  const history = await getHistory(userId);

  return history.map((item) => ({
    id: item.id,
    userPrompt:
      item.userPrompt.length > 50
        ? `${item.userPrompt.substring(0, 50)}...`
        : item.userPrompt,
    createdAt: item.createdAt,
  }));
}

/**
 * 添加新的历史记录
 */
export async function addHistoryItem(
  userId: string,
  item: Omit<AiMagicHistoryItem, "id" | "userId" | "createdAt">
): Promise<AiMagicHistoryItem> {
  await ensureUserDir(userId);

  const historyPath = getUserHistoryPath(userId);
  const history = await getHistory(userId);

  const newItem: AiMagicHistoryItem = {
    id: uuidv4(),
    userId,
    ...item,
    createdAt: new Date().toISOString(),
  };

  // 添加到开头（最新的在前）
  history.unshift(newItem);

  // 限制历史记录数量
  if (history.length > MAX_HISTORY_ITEMS) {
    history.splice(MAX_HISTORY_ITEMS);
  }

  await atomicWriteJSON(historyPath, history);

  return newItem;
}

/**
 * 获取单条历史记录
 */
export async function getHistoryItem(
  userId: string,
  itemId: string
): Promise<AiMagicHistoryItem | null> {
  const history = await getHistory(userId);
  return history.find((item) => item.id === itemId) || null;
}

/**
 * 删除历史记录
 */
export async function deleteHistoryItem(
  userId: string,
  itemId: string
): Promise<boolean> {
  const historyPath = getUserHistoryPath(userId);
  const history = await getHistory(userId);

  const index = history.findIndex((item) => item.id === itemId);
  if (index === -1) {
    return false;
  }

  history.splice(index, 1);
  await atomicWriteJSON(historyPath, history);

  return true;
}

/**
 * 清空用户所有历史记录
 */
export async function clearHistory(userId: string): Promise<void> {
  await ensureUserDir(userId);
  const historyPath = getUserHistoryPath(userId);
  await atomicWriteJSON(historyPath, []);
}

/**
 * AI Magic 存储管理器（单例模式）
 */
export const aiMagicStorage = {
  getHistory,
  getHistoryIndex,
  addHistoryItem,
  getHistoryItem,
  deleteHistoryItem,
  clearHistory,
};
