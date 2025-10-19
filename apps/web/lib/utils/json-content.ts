/**
 * JSONContent 辅助函数
 * 用于处理 Novel 编辑器的 JSONContent 格式
 */

import type { JSONContent } from 'novel';

/**
 * 从 JSONContent 中提取纯文本
 * 用于显示预览或搜索
 *
 * @param content - JSONContent 对象或字符串（向后兼容）
 * @param maxLength - 最大字符数（可选）
 * @returns 提取的纯文本
 */
export function extractTextFromJSON(
  content: JSONContent | string | undefined,
  maxLength?: number
): string {
  // 处理空值
  if (!content) return '';

  // 向后兼容：如果是字符串，直接返回
  if (typeof content === 'string') {
    return maxLength ? content.slice(0, maxLength) : content;
  }

  // 从 JSONContent 提取文本
  let text = '';

  const traverse = (node: JSONContent) => {
    // 如果是文本节点，添加文本
    if (node.type === 'text' && node.text) {
      text += node.text;
    }

    // 递归处理子节点
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);

        // 在段落之间添加空格
        if (child.type === 'paragraph') {
          text += ' ';
        }
      }
    }
  };

  traverse(content);

  // 清理多余空格
  text = text.replace(/\s+/g, ' ').trim();

  // 限制长度
  if (maxLength && text.length > maxLength) {
    return text.slice(0, maxLength) + '...';
  }

  return text;
}

/**
 * 检查 JSONContent 是否为空
 *
 * @param content - JSONContent 对象
 * @returns 是否为空
 */
export function isJSONContentEmpty(
  content: JSONContent | string | undefined
): boolean {
  if (!content) return true;

  if (typeof content === 'string') {
    return content.trim().length === 0;
  }

  const text = extractTextFromJSON(content);
  return text.length === 0;
}

/**
 * 创建空的 JSONContent
 *
 * @returns 空的 JSONContent 对象
 */
export function createEmptyJSONContent(): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [],
      },
    ],
  };
}

/**
 * 从纯文本创建 JSONContent（用于数据迁移）
 *
 * @param text - 纯文本字符串
 * @returns JSONContent 对象
 */
export function createJSONContentFromText(text: string): JSONContent {
  if (!text || text.trim().length === 0) {
    return createEmptyJSONContent();
  }

  // 按行分割文本
  const lines = text.split('\n');

  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line.trim()
        ? [
            {
              type: 'text',
              text: line,
            },
          ]
        : [],
    })),
  };
}
