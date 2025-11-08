/**
 * 将Novel编辑器的JSONContent转换为纯文本
 */

import type { JSONContent } from 'novel';

export function jsonContentToText(content: JSONContent | undefined | null): string {
  if (!content) return '';

  const extractText = (node: JSONContent): string => {
    // 如果有文本内容，直接返回
    if (node.text) {
      return node.text;
    }

    // 递归处理子节点
    if (node.content && Array.isArray(node.content)) {
      const texts = node.content.map(extractText);

      // 根据节点类型添加适当的分隔符
      if (node.type === 'paragraph' || node.type === 'heading') {
        return texts.join('') + '\n';
      }

      return texts.join('');
    }

    return '';
  };

  const text = extractText(content);

  // 清理多余的换行和空格
  return text
    .replace(/\n{3,}/g, '\n\n') // 最多保留两个换行
    .trim();
}
