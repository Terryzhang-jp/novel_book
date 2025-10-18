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
