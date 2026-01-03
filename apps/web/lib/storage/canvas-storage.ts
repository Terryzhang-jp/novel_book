/**
 * Canvas Storage - Supabase 版本（无限画布）
 *
 * 负责 Canvas 项目的 CRUD 操作
 * 图片存储在 Supabase Storage，元数据存储在 Supabase Database
 */

import { v4 as uuidv4 } from "uuid";
import type {
  CanvasProject,
  CanvasProjectIndex,
  CanvasElement,
  CanvasViewport,
  CanvasSaveRequest,
  MagazinePage,
} from "@/types/storage";
import { VersionConflictError, CANVAS_CONFIG } from "@/types/storage";
import { NotFoundError, UnauthorizedError } from "./errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  uploadFile,
  deleteFile as deleteStorageFile,
  getPublicUrl,
} from "@/lib/supabase/storage";

// Storage bucket 名称
const CANVAS_BUCKET = "canvas-images";

// 默认视口
const DEFAULT_VIEWPORT: CanvasViewport = {
  x: 0,
  y: 0,
  zoom: 1,
};

/**
 * 数据验证错误
 */
export class DataValidationError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "DataValidationError";
    this.code = code;
  }
}

/**
 * Canvas 存储类
 */
export class CanvasStorage {
  /**
   * 验证元素数据
   */
  private validateElements(elements: CanvasElement[]): void {
    // 检查元素数量
    if (elements.length > CANVAS_CONFIG.MAX_ELEMENTS) {
      throw new DataValidationError(
        `元素数量超出限制 (${elements.length}/${CANVAS_CONFIG.MAX_ELEMENTS})`,
        "MAX_ELEMENTS_EXCEEDED"
      );
    }

    // 检查单个图片大小
    for (const element of elements) {
      if (element.type === "image" && element.src?.startsWith("data:image/")) {
        const sizeInBytes = (element.src.length * 3) / 4; // Base64 大约是原始大小的 4/3
        const sizeInMB = sizeInBytes / (1024 * 1024);

        if (sizeInMB > CANVAS_CONFIG.MAX_IMAGE_SIZE_MB) {
          throw new DataValidationError(
            `图片大小超出限制 (${sizeInMB.toFixed(2)}MB/${CANVAS_CONFIG.MAX_IMAGE_SIZE_MB}MB)`,
            "MAX_IMAGE_SIZE_EXCEEDED"
          );
        }
      }
    }

    // 检查总数据大小
    const totalSize = JSON.stringify(elements).length;
    const totalSizeMB = totalSize / (1024 * 1024);

    if (totalSizeMB > CANVAS_CONFIG.MAX_PAYLOAD_SIZE_MB) {
      throw new DataValidationError(
        `数据大小超出限制 (${totalSizeMB.toFixed(2)}MB/${CANVAS_CONFIG.MAX_PAYLOAD_SIZE_MB}MB)`,
        "MAX_PAYLOAD_SIZE_EXCEEDED"
      );
    }
  }

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
   * 公开的图片上传方法
   * 用于客户端即时上传图片（解决保存时 payload 过大的问题）
   */
  async uploadImagePublic(
    userId: string,
    projectId: string,
    base64DataUrl: string
  ): Promise<string> {
    return this.uploadImage(userId, projectId, base64DataUrl);
  }

  /**
   * 从 Buffer 上传图片
   * 用于 FormData 上传（避免 JSON 序列化大型 base64 导致栈溢出）
   */
  async uploadImageBuffer(
    userId: string,
    projectId: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<string> {
    // 从 mimeType 提取扩展名
    const extensionMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpeg",
      "image/jpg": "jpeg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const extension = extensionMap[mimeType] || "png";

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
   * 处理元素中的图片：将 base64 转换为 Storage URL
   * 使用事务化处理：如果任何上传失败，清理已上传的文件
   */
  private async processElementImages(
    userId: string,
    projectId: string,
    elements: CanvasElement[]
  ): Promise<CanvasElement[]> {
    const processedElements: CanvasElement[] = [];
    const uploadedPaths: string[] = []; // 跟踪已上传的文件路径

    try {
      for (const element of elements) {
        if (element.type === "image" && element.src) {
          // 检查是否是 base64 data URL
          if (element.src.startsWith("data:image/")) {
            // 上传图片并获取 URL
            const { url, path } = await this.uploadImageWithPath(
              userId,
              projectId,
              element.src
            );
            uploadedPaths.push(path);
            processedElements.push({
              ...element,
              src: url,
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

      return processedElements;
    } catch (error) {
      // 上传失败，清理已上传的文件
      console.error("Image upload failed, cleaning up uploaded files:", error);
      await this.cleanupUploadedFiles(uploadedPaths);
      throw error;
    }
  }

  /**
   * 上传图片并返回路径（用于事务化处理）
   */
  private async uploadImageWithPath(
    userId: string,
    projectId: string,
    base64DataUrl: string
  ): Promise<{ url: string; path: string }> {
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

    return {
      url: getPublicUrl(CANVAS_BUCKET, storagePath),
      path: storagePath,
    };
  }

  /**
   * 清理已上传的文件（用于事务回滚）
   */
  private async cleanupUploadedFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    try {
      await supabaseAdmin.storage.from(CANVAS_BUCKET).remove(paths);
      console.log(`Cleaned up ${paths.length} uploaded files`);
    } catch (error) {
      // 清理失败不应该阻止主流程
      console.error("Failed to cleanup uploaded files:", error);
    }
  }

  /**
   * 从元素数组中提取所有图片 URL
   */
  private extractImageUrls(elements: CanvasElement[]): string[] {
    return elements
      .filter((el) => el.type === "image" && el.src && !el.src.startsWith("data:"))
      .map((el) => el.src as string);
  }

  /**
   * 从 pages 数组中提取所有图片 URL
   */
  private extractImageUrlsFromPages(pages: MagazinePage[]): string[] {
    const urls: string[] = [];
    for (const page of pages) {
      if (page.elements) {
        urls.push(...this.extractImageUrls(page.elements));
      }
    }
    return urls;
  }

  /**
   * 清理不再使用的图片
   * 比较新旧 URL，删除不再引用的图片
   */
  private async cleanupUnusedImages(
    oldUrls: string[],
    newUrls: string[]
  ): Promise<void> {
    const newUrlSet = new Set(newUrls);
    const deletedUrls = oldUrls.filter((url) => !newUrlSet.has(url));

    if (deletedUrls.length === 0) return;

    console.log(`[Canvas] Cleaning up ${deletedUrls.length} unused images`);

    for (const url of deletedUrls) {
      try {
        // 解析 Supabase Storage URL
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/");
        const publicIndex = pathParts.indexOf("public");

        if (publicIndex !== -1 && publicIndex < pathParts.length - 2) {
          const bucket = pathParts[publicIndex + 1];
          const path = pathParts.slice(publicIndex + 2).join("/");

          if (bucket === CANVAS_BUCKET) {
            await deleteStorageFile(bucket, path);
            console.log(`[Canvas] Deleted unused image: ${path}`);
          }
        }
      } catch (error) {
        console.error(`[Canvas] Failed to delete image: ${url}`, error);
      }
    }
  }

  /**
   * 创建新的 Canvas 项目
   */
  async create(
    userId: string,
    data: CanvasSaveRequest
  ): Promise<CanvasProject> {
    // 验证数据
    if (data.elements) {
      this.validateElements(data.elements);
    }

    const projectId = uuidv4();
    const now = new Date().toISOString();

    // 处理图片上传
    const processedElements = data.elements
      ? await this.processElementImages(userId, projectId, data.elements)
      : [];

    // 插入数据库
    const { data: dbData, error } = await supabaseAdmin
      .from("canvas_projects")
      .insert({
        id: projectId,
        user_id: userId,
        title: data.title || "Untitled Canvas",
        viewport: data.viewport || DEFAULT_VIEWPORT,
        elements: processedElements,
        version: 1, // 初始版本号
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
   * 兼容旧的 pages 结构和新的 elements 结构
   */
  async findByUserId(userId: string): Promise<CanvasProjectIndex[]> {
    const { data, error } = await supabaseAdmin
      .from("canvas_projects")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((project: any) => {
      // 计算元素数量：优先使用 elements，否则从 pages 计算
      let elementCount = 0;
      if (Array.isArray(project.elements)) {
        elementCount = project.elements.length;
      } else if (Array.isArray(project.pages)) {
        elementCount = project.pages.reduce(
          (sum: number, page: any) =>
            sum + (Array.isArray(page.elements) ? page.elements.length : 0),
          0
        );
      }

      return {
        id: project.id,
        title: project.title,
        thumbnailUrl: project.thumbnail_url,
        elementCount,
        updatedAt: project.updated_at,
      };
    });
  }

  /**
   * 更新项目
   */
  async update(
    projectId: string,
    userId: string,
    data: Partial<CanvasSaveRequest>
  ): Promise<CanvasProject> {
    // 验证数据
    if (data.elements) {
      this.validateElements(data.elements);
    }

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

    // 收集旧的图片 URL（用于后续清理）
    let oldImageUrls: string[] = [];
    if (existing.isMagazineMode && existing.pages) {
      oldImageUrls = this.extractImageUrlsFromPages(existing.pages);
    } else if (existing.elements) {
      oldImageUrls = this.extractImageUrls(existing.elements);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      updated_at: now,
      version: existing.version + 1,
    };

    // 收集新的图片 URL
    let newImageUrls: string[] = [];

    if (data.title !== undefined) {
      updateData.title = data.title;
    }

    if (data.viewport !== undefined) {
      updateData.viewport = data.viewport;
    }

    if (data.elements !== undefined) {
      // 处理图片上传
      updateData.elements = await this.processElementImages(
        userId,
        projectId,
        data.elements
      );
      newImageUrls.push(...this.extractImageUrls(updateData.elements));
    }

    // 杂志模式字段
    if ((data as any).isMagazineMode !== undefined) {
      updateData.is_magazine_mode = (data as any).isMagazineMode;
    }

    if ((data as any).currentPageIndex !== undefined) {
      updateData.current_page_index = (data as any).currentPageIndex;
    }

    // 处理 pages（杂志模式）
    if ((data as any).pages !== undefined) {
      const pages = (data as any).pages as MagazinePage[];
      // 处理每个页面中的图片
      const processedPages: MagazinePage[] = [];
      for (const page of pages) {
        // 安全检查：确保 page.elements 存在
        const pageElements = page.elements || [];
        const processedElements = await this.processElementImages(
          userId,
          projectId,
          pageElements
        );
        processedPages.push({
          ...page,
          elements: processedElements,
        });
      }
      updateData.pages = processedPages;
      newImageUrls.push(...this.extractImageUrlsFromPages(processedPages));
    }

    // 单用户应用：直接更新，不做版本检查
    // 前端通过请求串行化保证不会有并发问题
    const { data: dbData, error } = await supabaseAdmin
      .from("canvas_projects")
      .update(updateData)
      .eq("id", projectId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update canvas project: ${error.message}`);
    }

    // 清理不再使用的图片（在数据库更新成功后执行，不阻塞返回）
    if (oldImageUrls.length > 0) {
      this.cleanupUnusedImages(oldImageUrls, newImageUrls).catch((err) => {
        console.error("[Canvas] Background image cleanup failed:", err);
      });
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
   * 如果用户没有项目，自动创建一个杂志模式项目
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

    // 创建默认杂志模式项目（带一个封面页）
    return this.createMagazineProject(userId, {
      title: "My Journal",
    });
  }

  /**
   * 创建杂志模式项目
   */
  async createMagazineProject(
    userId: string,
    data: { title?: string }
  ): Promise<CanvasProject> {
    const projectId = uuidv4();
    const now = new Date().toISOString();

    // 创建初始封面页
    const initialPages: MagazinePage[] = [
      {
        id: uuidv4(),
        index: 0,
        elements: [],
      },
    ];

    // 插入数据库
    const { data: dbData, error } = await supabaseAdmin
      .from("canvas_projects")
      .insert({
        id: projectId,
        user_id: userId,
        title: data.title || "My Journal",
        viewport: DEFAULT_VIEWPORT,
        elements: [], // 杂志模式下为空
        pages: initialPages,
        is_magazine_mode: true,
        current_page_index: 0,
        version: 1,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create magazine project: ${error.message}`);
    }

    return this.mapToCanvasProject(dbData);
  }

  /**
   * 映射数据库记录到 CanvasProject 类型
   * 支持杂志模式和无限画布模式
   */
  private mapToCanvasProject(dbData: any): CanvasProject {
    // 默认启用杂志模式（新项目和旧项目都使用杂志模式）
    const isMagazineMode = dbData.is_magazine_mode ?? true;

    // 处理元素：优先使用 elements，如果没有则尝试从 pages 提取
    let elements: CanvasElement[] = [];
    if (Array.isArray(dbData.elements)) {
      elements = dbData.elements;
    } else if (!isMagazineMode && Array.isArray(dbData.pages) && dbData.pages.length > 0) {
      // 从旧的 pages 结构提取元素（兼容迁移，仅非杂志模式）
      elements = dbData.pages.flatMap((page: any) =>
        Array.isArray(page.elements) ? page.elements : []
      );
    }

    // 处理视口：优先使用 viewport，否则使用默认值
    const viewport = dbData.viewport || DEFAULT_VIEWPORT;

    // 处理杂志模式的 pages
    let pages: MagazinePage[] | undefined;
    if (isMagazineMode && Array.isArray(dbData.pages)) {
      pages = dbData.pages;
    }

    return {
      id: dbData.id,
      userId: dbData.user_id,
      title: dbData.title,
      viewport,
      elements,
      // 杂志模式字段
      isMagazineMode,
      pages,
      currentPageIndex: dbData.current_page_index ?? 0,
      thumbnailUrl: dbData.thumbnail_url,
      version: dbData.version || 1, // 兼容旧数据
      createdAt: dbData.created_at,
      updatedAt: dbData.updated_at,
    };
  }
}

// 导出单例
export const canvasStorage = new CanvasStorage();
