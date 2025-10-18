import { v4 as uuidv4 } from "uuid";
import { join } from "path";
import type { Document, DocumentIndex } from "@/types/storage";
import type { JSONContent } from "novel";
import {
  atomicWriteJSON,
  readJSON,
  exists,
  deleteFile,
} from "./file-system";
import { PATHS } from "./init";
import { NotFoundError, UnauthorizedError } from "./errors";
import { indexManager } from "./index-manager";

/**
 * 文档存储类
 * 负责文档的 CRUD 操作
 */
export class DocumentStorage {
  /**
   * 获取文档文件路径
   */
  private getDocumentPath(docId: string): string {
    return join(PATHS.DOCUMENTS, `${docId}.json`);
  }

  /**
   * 创建新文档
   */
  async create(
    userId: string,
    title: string,
    content?: JSONContent
  ): Promise<Document> {
    const defaultContent: JSONContent = {
      type: "doc",
      content: [],
    };

    const doc: Document = {
      id: uuidv4(),
      userId,
      title,
      content: content || defaultContent,
      images: content ? this.extractImages(content) : [],
      preview: content ? this.generatePreview(content) : "",
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 保存文档文件
    await atomicWriteJSON(this.getDocumentPath(doc.id), doc);

    // 添加到索引
    await indexManager.addDocument(userId, {
      id: doc.id,
      title: doc.title,
      preview: doc.preview || "",
      tags: doc.tags || [],
      updatedAt: doc.updatedAt,
    });

    return doc;
  }

  /**
   * 根据 ID 读取文档
   */
  async findById(docId: string): Promise<Document | null> {
    const path = this.getDocumentPath(docId);
    if (!exists(path)) {
      return null;
    }
    return await readJSON<Document>(path);
  }

  /**
   * 更新文档
   */
  async update(
    docId: string,
    userId: string,
    data: Partial<Omit<Document, "id" | "userId" | "createdAt">>
  ): Promise<Document> {
    const doc = await this.findById(docId);
    if (!doc) {
      throw new NotFoundError("Document");
    }

    // 权限检查：只有文档所有者才能编辑
    if (doc.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to edit this document"
      );
    }

    // 更新文档数据
    const updated: Document = {
      ...doc,
      ...data,
      // 如果更新了 content，重新提取图片和预览
      images: data.content ? this.extractImages(data.content) : doc.images,
      preview: data.content ? this.generatePreview(data.content) : doc.preview,
      updatedAt: new Date().toISOString(),
    };

    // 保存文档
    await atomicWriteJSON(this.getDocumentPath(docId), updated);

    // 更新索引
    await indexManager.updateDocument(userId, docId, {
      id: updated.id,
      title: updated.title,
      preview: updated.preview || "",
      tags: updated.tags || [],
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  /**
   * 删除文档
   */
  async delete(docId: string, userId: string): Promise<void> {
    const doc = await this.findById(docId);
    if (!doc) {
      throw new NotFoundError("Document");
    }

    // 权限检查
    if (doc.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to delete this document"
      );
    }

    // 删除文档文件
    await deleteFile(this.getDocumentPath(docId));

    // 从索引中移除
    await indexManager.removeDocument(userId, docId);

    // TODO: 删除关联的图片文件
    // 这里可以遍历 doc.images 数组，删除对应的图片
  }

  /**
   * 获取用户的所有文档（返回索引列表）
   */
  async findByUserId(userId: string): Promise<DocumentIndex[]> {
    return await indexManager.getUserDocuments(userId);
  }

  /**
   * 从 Tiptap JSONContent 中提取图片 URL
   */
  private extractImages(content: JSONContent): string[] {
    const images: string[] = [];

    const traverse = (node: any) => {
      if (node.type === "image" && node.attrs?.src) {
        // 提取图片文件名
        // 例如：/images/user-123/abc.png -> abc.png
        const match = node.attrs.src.match(/\/images\/[^/]+\/([^/]+)$/);
        if (match) {
          images.push(match[1]);
        }
      }

      // 递归遍历子节点
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(traverse);
      }
    };

    traverse(content);

    // 去重
    return Array.from(new Set(images));
  }

  /**
   * 生成文档预览文本（提取纯文本，前100个字符）
   */
  private generatePreview(content: JSONContent): string {
    let text = "";

    const traverse = (node: any) => {
      if (node.type === "text" && node.text) {
        text += node.text + " ";
      }

      // 递归遍历子节点
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(traverse);
      }
    };

    traverse(content);

    // 返回前100个字符
    return text.trim().substring(0, 100);
  }

  /**
   * 搜索文档
   */
  async search(userId: string, query: string): Promise<DocumentIndex[]> {
    return await indexManager.searchDocuments(userId, query);
  }

  /**
   * 按标签获取文档
   */
  async findByTag(userId: string, tag: string): Promise<DocumentIndex[]> {
    return await indexManager.getDocumentsByTag(userId, tag);
  }
}

// 导出单例
export const documentStorage = new DocumentStorage();
