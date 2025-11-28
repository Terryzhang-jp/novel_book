/**
 * Canvas Storage - Supabase 版本
 *
 * 负责 Canvas 项目的 CRUD 操作
 * 图片存储在 Supabase Storage，元数据存储在 Supabase Database
 */

import { v4 as uuidv4 } from "uuid";
import type {
  CanvasProject,
  CanvasProjectIndex,
  CanvasPageData,
  CanvasPageElement,
  CanvasSaveRequest,
} from "@/types/storage";
import { NotFoundError, UnauthorizedError } from "./errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  uploadFile,
  deleteFile as deleteStorageFile,
  getPublicUrl,
} from "@/lib/supabase/storage";

// Storage bucket 名称
const CANVAS_BUCKET = "canvas-images";

/**
 * Canvas 存储类
 */
export class CanvasStorage {
  /**
   * 从 base64 data URL 提取数据
   */
  private extractBase64Data(dataUrl: string): {
    data: string;
    mimeType: string;
    extension: string;
  } | null {
    const match = dataUrl.match(
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/
    );
    if (!match) return null;

    const type = match[1];
    const data = match[2];
    const mimeType = type === "jpg" ? "image/jpeg" : `image/${type}`;
    const extension = type === "jpg" ? "jpeg" : type;

    return { data, mimeType, extension };
  }

  /**
   * 上传图片到 Supabase Storage
   */
  private async uploadImage(
    userId: string,
    projectId: string,
    base64DataUrl: string
  ): Promise<string> {
    const extracted = this.extractBase64Data(base64DataUrl);
    if (!extracted) {
      throw new Error("Invalid image data URL");
    }

    const { data, mimeType, extension } = extracted;
    const buffer = Buffer.from(data, "base64");

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileName = `${timestamp}-${randomString}.${extension}`;

    // 上传路径: userId/projectId/fileName
    const storagePath = `${userId}/${projectId}/${fileName}`;

    await uploadFile(CANVAS_BUCKET, storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

    return getPublicUrl(CANVAS_BUCKET, storagePath);
  }

  /**
   * 处理页面中的图片：将 base64 转换为 Storage URL
   */
  private async processPageImages(
    userId: string,
    projectId: string,
    pages: CanvasPageData[]
  ): Promise<CanvasPageData[]> {
    const processedPages: CanvasPageData[] = [];

    for (const page of pages) {
      const processedElements: CanvasPageElement[] = [];

      for (const element of page.elements) {
        if (element.type === "image" && element.src) {
          // 检查是否是 base64 data URL
          if (element.src.startsWith("data:image/")) {
            // 上传图片并获取 URL
            const imageUrl = await this.uploadImage(
              userId,
              projectId,
              element.src
            );
            processedElements.push({
              ...element,
              src: imageUrl,
              originalSrc: undefined, // 清除临时数据
            });
          } else {
            // 已经是 URL，保持不变
            processedElements.push(element);
          }
        } else {
          processedElements.push(element);
        }
      }

      processedPages.push({
        ...page,
        elements: processedElements,
      });
    }

    return processedPages;
  }

  /**
   * 创建新的 Canvas 项目
   */
  async create(
    userId: string,
    data: CanvasSaveRequest
  ): Promise<CanvasProject> {
    const projectId = uuidv4();
    const now = new Date().toISOString();

    // 处理图片上传
    const processedPages = await this.processPageImages(
      userId,
      projectId,
      data.pages
    );

    // 插入数据库
    const { data: dbData, error } = await supabaseAdmin
      .from("canvas_projects")
      .insert({
        id: projectId,
        user_id: userId,
        title: data.title || "Untitled Canvas",
        current_page: data.currentPage,
        pages: processedPages,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create canvas project: ${error.message}`);
    }

    return this.mapToCanvasProject(dbData);
  }

  /**
   * 根据 ID 获取项目
   */
  async findById(projectId: string): Promise<CanvasProject | null> {
    const { data, error } = await supabaseAdmin
      .from("canvas_projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToCanvasProject(data);
  }

  /**
   * 获取用户的所有项目列表
   */
  async findByUserId(userId: string): Promise<CanvasProjectIndex[]> {
    const { data, error } = await supabaseAdmin
      .from("canvas_projects")
      .select("id, title, thumbnail_url, pages, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((project) => ({
      id: project.id,
      title: project.title,
      thumbnailUrl: project.thumbnail_url,
      pageCount: Array.isArray(project.pages) ? project.pages.length : 0,
      updatedAt: project.updated_at,
    }));
  }

  /**
   * 更新项目
   */
  async update(
    projectId: string,
    userId: string,
    data: Partial<CanvasSaveRequest>
  ): Promise<CanvasProject> {
    // 验证权限
    const existing = await this.findById(projectId);
    if (!existing) {
      throw new NotFoundError("Canvas project");
    }
    if (existing.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to update this project"
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      updated_at: now,
    };

    if (data.title !== undefined) {
      updateData.title = data.title;
    }

    if (data.currentPage !== undefined) {
      updateData.current_page = data.currentPage;
    }

    if (data.pages !== undefined) {
      // 处理图片上传
      updateData.pages = await this.processPageImages(
        userId,
        projectId,
        data.pages
      );
    }

    const { data: dbData, error } = await supabaseAdmin
      .from("canvas_projects")
      .update(updateData)
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update canvas project: ${error.message}`);
    }

    return this.mapToCanvasProject(dbData);
  }

  /**
   * 删除项目
   */
  async delete(projectId: string, userId: string): Promise<void> {
    const project = await this.findById(projectId);
    if (!project) {
      throw new NotFoundError("Canvas project");
    }
    if (project.userId !== userId) {
      throw new UnauthorizedError(
        "You don't have permission to delete this project"
      );
    }

    // 删除 Storage 中的所有图片
    try {
      const { data: files } = await supabaseAdmin.storage
        .from(CANVAS_BUCKET)
        .list(`${userId}/${projectId}`);

      if (files && files.length > 0) {
        const filePaths = files.map(
          (f) => `${userId}/${projectId}/${f.name}`
        );
        await supabaseAdmin.storage.from(CANVAS_BUCKET).remove(filePaths);
      }
    } catch (error) {
      console.error("Failed to delete canvas images:", error);
    }

    // 删除数据库记录
    const { error } = await supabaseAdmin
      .from("canvas_projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      throw new Error(`Failed to delete canvas project: ${error.message}`);
    }
  }

  /**
   * 更新缩略图
   */
  async updateThumbnail(
    projectId: string,
    userId: string,
    thumbnailBase64: string
  ): Promise<string> {
    const project = await this.findById(projectId);
    if (!project) {
      throw new NotFoundError("Canvas project");
    }
    if (project.userId !== userId) {
      throw new UnauthorizedError("Unauthorized");
    }

    // 上传缩略图
    const extracted = this.extractBase64Data(thumbnailBase64);
    if (!extracted) {
      throw new Error("Invalid thumbnail data");
    }

    const { data, mimeType, extension } = extracted;
    const buffer = Buffer.from(data, "base64");
    const storagePath = `${userId}/${projectId}/thumbnail.${extension}`;

    await uploadFile(CANVAS_BUCKET, storagePath, buffer, {
      contentType: mimeType,
      upsert: true, // 覆盖旧的缩略图
    });

    const thumbnailUrl = getPublicUrl(CANVAS_BUCKET, storagePath);

    // 更新数据库
    await supabaseAdmin
      .from("canvas_projects")
      .update({
        thumbnail_url: thumbnailUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    return thumbnailUrl;
  }

  /**
   * 获取或创建用户的默认项目
   * 如果用户没有项目，自动创建一个
   */
  async getOrCreateDefault(userId: string): Promise<CanvasProject> {
    // 查找用户的最近项目
    const projects = await this.findByUserId(userId);

    if (projects.length > 0) {
      // 返回最近的项目
      const latestProject = await this.findById(projects[0].id);
      if (latestProject) {
        return latestProject;
      }
    }

    // 创建默认项目
    return this.create(userId, {
      title: "My Journal",
      currentPage: 1,
      pages: [
        { id: 1, background: "#ffffff", elements: [] },
        { id: 2, background: "#ffffff", elements: [] },
        { id: 3, background: "#ffffff", elements: [] },
      ],
    });
  }

  /**
   * 映射数据库记录到 CanvasProject 类型
   */
  private mapToCanvasProject(dbData: any): CanvasProject {
    return {
      id: dbData.id,
      userId: dbData.user_id,
      title: dbData.title,
      currentPage: dbData.current_page,
      pages: dbData.pages || [],
      thumbnailUrl: dbData.thumbnail_url,
      createdAt: dbData.created_at,
      updatedAt: dbData.updated_at,
    };
  }
}

// 导出单例
export const canvasStorage = new CanvasStorage();
