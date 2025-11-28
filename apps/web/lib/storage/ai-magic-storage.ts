/**
 * AI Magic Storage - Supabase Version
 *
 * 管理 AI Magic 生成历史的存储层
 * 使用 Supabase 替代本地文件系统，支持 Vercel 部署
 */

import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AiMagicHistoryItem, AiMagicHistoryIndex } from "@/types/storage";

const MAX_HISTORY_ITEMS = 50; // 每个用户最多保存 50 条历史

/**
 * 获取用户的所有历史记录
 */
export async function getHistory(userId: string): Promise<AiMagicHistoryItem[]> {
  const { data, error } = await supabaseAdmin
    .from('ai_magic_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_ITEMS);

  if (error || !data) {
    console.error("Failed to read AI Magic history:", error);
    return [];
  }

  return data.map(item => ({
    id: item.id,
    userId: item.user_id,
    userPrompt: item.user_prompt,
    inputImageCount: item.input_image_count,
    styleImageCount: item.style_image_count,
    optimizedPrompt: item.optimized_prompt,
    reasoning: item.reasoning,
    resultImage: item.result_image,
    model: item.model,
    createdAt: item.created_at,
  }));
}

/**
 * 获取历史记录索引（用于快速显示列表）
 */
export async function getHistoryIndex(
  userId: string
): Promise<AiMagicHistoryIndex[]> {
  const { data, error } = await supabaseAdmin
    .from('ai_magic_history')
    .select('id, user_prompt, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_ITEMS);

  if (error || !data) {
    return [];
  }

  return data.map(item => ({
    id: item.id,
    userPrompt:
      item.user_prompt.length > 50
        ? `${item.user_prompt.substring(0, 50)}...`
        : item.user_prompt,
    createdAt: item.created_at,
  }));
}

/**
 * 添加新的历史记录
 */
export async function addHistoryItem(
  userId: string,
  item: Omit<AiMagicHistoryItem, "id" | "userId" | "createdAt">
): Promise<AiMagicHistoryItem> {
  const historyId = uuidv4();
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('ai_magic_history')
    .insert({
      id: historyId,
      user_id: userId,
      user_prompt: item.userPrompt,
      input_image_count: item.inputImageCount,
      style_image_count: item.styleImageCount,
      optimized_prompt: item.optimizedPrompt,
      reasoning: item.reasoning || null,
      result_image: item.resultImage,
      model: item.model,
      created_at: now,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save AI Magic history: ${error.message}`);
  }

  // 清理旧记录（保持最多 MAX_HISTORY_ITEMS 条）
  await cleanupOldHistory(userId);

  return {
    id: data.id,
    userId: data.user_id,
    userPrompt: data.user_prompt,
    inputImageCount: data.input_image_count,
    styleImageCount: data.style_image_count,
    optimizedPrompt: data.optimized_prompt,
    reasoning: data.reasoning,
    resultImage: data.result_image,
    model: data.model,
    createdAt: data.created_at,
  };
}

/**
 * 清理超出数量限制的旧历史记录
 */
async function cleanupOldHistory(userId: string): Promise<void> {
  // 获取用户的历史记录数量
  const { count, error: countError } = await supabaseAdmin
    .from('ai_magic_history')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError || count === null || count <= MAX_HISTORY_ITEMS) {
    return;
  }

  // 获取需要删除的记录 ID
  const { data: oldRecords } = await supabaseAdmin
    .from('ai_magic_history')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(count - MAX_HISTORY_ITEMS);

  if (oldRecords && oldRecords.length > 0) {
    const idsToDelete = oldRecords.map(r => r.id);
    await supabaseAdmin
      .from('ai_magic_history')
      .delete()
      .in('id', idsToDelete);
  }
}

/**
 * 获取单条历史记录
 */
export async function getHistoryItem(
  userId: string,
  itemId: string
): Promise<AiMagicHistoryItem | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_magic_history')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    userPrompt: data.user_prompt,
    inputImageCount: data.input_image_count,
    styleImageCount: data.style_image_count,
    optimizedPrompt: data.optimized_prompt,
    reasoning: data.reasoning,
    resultImage: data.result_image,
    model: data.model,
    createdAt: data.created_at,
  };
}

/**
 * 删除历史记录
 */
export async function deleteHistoryItem(
  userId: string,
  itemId: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('ai_magic_history')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId);

  return !error;
}

/**
 * 清空用户所有历史记录
 */
export async function clearHistory(userId: string): Promise<void> {
  await supabaseAdmin
    .from('ai_magic_history')
    .delete()
    .eq('user_id', userId);
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
