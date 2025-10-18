import { join } from "path";
import type { DocumentIndex } from "@/types/storage";
import { atomicWriteJSON, readJSON, exists } from "./file-system";
import { PATHS } from "./init";

/**
 * 索引管理器
 * 负责维护用户的文档索引，用于快速查询文档列表
 */
export class IndexManager {
  /**
   * 获取用户索引文件路径
   */
  private getUserIndexPath(userId: string): string {
    return join(PATHS.INDEXES, `user-${userId}-docs.json`);
  }

  /**
   * 读取用户的文档索引
   */
  async getUserDocuments(userId: string): Promise<DocumentIndex[]> {
    const path = this.getUserIndexPath(userId);
    if (!exists(path)) {
      return [];
    }
    return await readJSON<DocumentIndex[]>(path);
  }

  /**
   * 添加文档到索引
   */
  async addDocument(userId: string, doc: DocumentIndex): Promise<void> {
    const docs = await this.getUserDocuments(userId);
    docs.push(doc);

    // 按更新时间倒序排序（最新的在前面）
    docs.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    await atomicWriteJSON(this.getUserIndexPath(userId), docs);
  }

  /**
   * 更新索引中的文档信息
   */
  async updateDocument(
    userId: string,
    docId: string,
    doc: DocumentIndex
  ): Promise<void> {
    const docs = await this.getUserDocuments(userId);
    const index = docs.findIndex((d) => d.id === docId);

    if (index !== -1) {
      docs[index] = doc;

      // 重新排序
      docs.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      await atomicWriteJSON(this.getUserIndexPath(userId), docs);
    }
  }

  /**
   * 从索引中移除文档
   */
  async removeDocument(userId: string, docId: string): Promise<void> {
    const docs = await this.getUserDocuments(userId);
    const filtered = docs.filter((d) => d.id !== docId);
    await atomicWriteJSON(this.getUserIndexPath(userId), filtered);
  }

  /**
   * 搜索文档（简单的标题和预览文本搜索）
   */
  async searchDocuments(
    userId: string,
    query: string
  ): Promise<DocumentIndex[]> {
    const docs = await this.getUserDocuments(userId);
    const lowerQuery = query.toLowerCase();

    return docs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(lowerQuery) ||
        doc.preview.toLowerCase().includes(lowerQuery) ||
        doc.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 按标签过滤文档
   */
  async getDocumentsByTag(
    userId: string,
    tag: string
  ): Promise<DocumentIndex[]> {
    const docs = await this.getUserDocuments(userId);
    return docs.filter((doc) => doc.tags.includes(tag));
  }
}

// 导出单例
export const indexManager = new IndexManager();
