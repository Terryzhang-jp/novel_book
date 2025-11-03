import { v4 as uuidv4 } from "uuid";
import type { Document, DocumentIndex } from "@/types/storage";
import type { JSONContent } from "novel";
import { NotFoundError, UnauthorizedError } from "./errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * 文档存储类 - Supabase 版本
 * 负责文档的 CRUD 操作
 */
export class DocumentStorage {
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

    const docId = uuidv4();
    const now = new Date().toISOString();
    const docContent = content || defaultContent;

    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        id: docId,
        user_id: userId,
        title,
        content: docContent,
        images: content ? this.extractImages(content) : [],
        tags: [],
        preview: content ? this.generatePreview(content) : "",
        is_public: false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create document: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      content: data.content,
      images: data.images,
      tags: data.tags,
      preview: data.preview,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * 根据 ID 读取文档
   */
  async findById(docId: string): Promise<Document | null> {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', docId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      content: data.content,
      images: data.images,
      tags: data.tags,
      preview: data.preview,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * 更新文档
   */
  async update(
    docId: string,
    userId: string,
    data: Partial<Omit<Document, "id" | "userId" | "createdAt">>
  ): Promise<Document> {
    // 验证权限
    const doc = await this.findById(docId);
    if (!doc) {
      throw new NotFoundError("Document");
    }

    if (doc.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to edit this document"
      );
    }

    // 准备更新数据
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) {
      updateData.content = data.content;
      updateData.images = this.extractImages(data.content);
      updateData.preview = this.generatePreview(data.content);
    }
    if (data.tags !== undefined) updateData.tags = data.tags;

    const { data: updated, error } = await supabaseAdmin
      .from('documents')
      .update(updateData)
      .eq('id', docId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update document: ${error.message}`);
    }

    return {
      id: updated.id,
      userId: updated.user_id,
      title: updated.title,
      content: updated.content,
      images: updated.images,
      tags: updated.tags,
      preview: updated.preview,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  /**
   * 删除文档
   */
  async delete(docId: string, userId: string): Promise<void> {
    // 验证权限
    const doc = await this.findById(docId);
    if (!doc) {
      throw new NotFoundError("Document");
    }

    if (doc.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to delete this document"
      );
    }

    const { error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', docId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }

    // TODO: 删除关联的图片文件
    // 这里可以遍历 doc.images 数组，删除对应的图片
  }

  /**
   * 获取用户的所有文档（返回索引列表）
   */
  async findByUserId(userId: string): Promise<DocumentIndex[]> {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, preview, tags, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(doc => ({
      id: doc.id,
      title: doc.title,
      preview: doc.preview || "",
      tags: doc.tags || [],
      updatedAt: doc.updated_at,
    }));
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
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, preview, tags, updated_at')
      .eq('user_id', userId)
      .or(`title.ilike.%${query}%,preview.ilike.%${query}%`)
      .order('updated_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(doc => ({
      id: doc.id,
      title: doc.title,
      preview: doc.preview || "",
      tags: doc.tags || [],
      updatedAt: doc.updated_at,
    }));
  }

  /**
   * 按标签获取文档
   */
  async findByTag(userId: string, tag: string): Promise<DocumentIndex[]> {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, preview, tags, updated_at')
      .eq('user_id', userId)
      .contains('tags', [tag])
      .order('updated_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map(doc => ({
      id: doc.id,
      title: doc.title,
      preview: doc.preview || "",
      tags: doc.tags || [],
      updatedAt: doc.updated_at,
    }));
  }
}

// 导出单例
export const documentStorage = new DocumentStorage();
