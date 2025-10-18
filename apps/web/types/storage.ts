import type { JSONContent } from "novel";

/**
 * 用户数据模型
 */
export interface User {
  id: string; // UUID
  email: string; // 邮箱（唯一）
  passwordHash: string; // bcrypt 哈希
  name?: string; // 用户名（可选）
  createdAt: string; // ISO 8601 时间戳
  updatedAt: string;
}

/**
 * 文档数据模型
 */
export interface Document {
  id: string; // UUID
  userId: string; // 所属用户ID
  title: string; // 文档标题
  content: JSONContent; // Tiptap JSON 内容（包含所有格式）
  images: string[]; // 关联的图片文件名列表
  tags?: string[]; // 标签（可选）
  preview?: string; // 预览文本（前100字）
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/**
 * 文档索引（用于快速查询）
 */
export interface DocumentIndex {
  id: string;
  title: string;
  preview: string;
  tags: string[];
  updatedAt: string;
}

/**
 * JWT Payload
 */
export interface JWTPayload {
  userId: string;
  email: string;
}

/**
 * API 错误响应
 */
export interface APIError {
  error: string;
  code: string;
}

/**
 * 照片分类类型
 */
export type PhotoCategory =
  | "time-location" // 有时间 + 有地点
  | "time-only" // 有时间 + 无地点
  | "location-only" // 无时间 + 有地点
  | "neither"; // 无时间 + 无地点

/**
 * 照片数据模型
 */
export interface Photo {
  id: string; // UUID
  userId: string; // 所属用户ID
  fileName: string; // 存储的文件名
  originalName: string; // 原始文件名

  // EXIF 元数据
  metadata: {
    dateTime?: string; // 拍摄时间 (ISO 8601)
    location?: {
      latitude: number; // 纬度
      longitude: number; // 经度
      altitude?: number; // 海拔（米）
    };
    camera?: {
      make?: string; // 相机制造商
      model?: string; // 相机型号
    };
    dimensions?: {
      width: number; // 宽度（像素）
      height: number; // 高度（像素）
    };
    fileSize: number; // 文件大小（字节）
    mimeType: string; // MIME 类型
  };

  // 自动分类
  category: PhotoCategory;

  // 可选字段
  title?: string; // 自定义标题
  description?: string; // 描述
  tags?: string[]; // 标签

  // 时间戳
  createdAt: string; // 上传时间 (ISO 8601)
  updatedAt: string; // 更新时间
}

/**
 * 照片索引（用于快速查询）
 */
export interface PhotoIndex {
  id: string;
  fileName: string;
  category: PhotoCategory;
  dateTime?: string; // 用于排序
  location?: {
    latitude: number;
    longitude: number;
  };
  updatedAt: string;
}

/**
 * 照片统计
 */
export interface PhotoStats {
  total: number;
  byCategory: {
    "time-location": number;
    "time-only": number;
    "location-only": number;
    neither: number;
  };
}
