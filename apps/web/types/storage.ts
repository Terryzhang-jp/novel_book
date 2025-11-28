import type { JSONContent } from "novel";

export type { JSONContent };

/**
 * 用户数据模型
 */
export interface User {
  id: string; // UUID
  email: string; // 邮箱（唯一）
  passwordHash: string; // bcrypt 哈希
  name?: string; // 用户名（可选）
  requirePasswordChange: boolean; // 是否需要修改密码（初次登录时为true）
  securityQuestion?: string; // 安全问题（用于密码找回）
  securityAnswerHash?: string; // 安全问题答案 bcrypt 哈希
  createdAt: string; // ISO 8601 时间戳
  updatedAt: string;
}

/**
 * 安全问题选项
 */
export const SECURITY_QUESTIONS = [
  "What is your mother's maiden name?",
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your favorite movie?",
  "What was the name of your elementary school?",
  "What is your favorite food?",
] as const;

export type SecurityQuestion = (typeof SECURITY_QUESTIONS)[number];

/**
 * 装饰元素类型定义（手账功能）
 */
export type DecorationType = 'sticker' | 'text' | 'shape' | 'drawing';

export interface DecorationElement {
  id: string;                                    // 唯一标识
  type: DecorationType;                          // 元素类型
  position: { x: number; y: number };           // 位置（像素）
  size: { width: number; height: number };      // 尺寸（像素）
  rotation: number;                              // 旋转角度（度）
  zIndex: number;                                // 层级
  data: Record<string, any>;                     // 元素特定数据
  createdAt: string;                             // 创建时间
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
  decorations?: DecorationElement[]; // 装饰元素（手账功能）
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
  requirePasswordChange?: boolean; // 是否需要修改密码（用于中间件重定向）
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
 * 地点来源类型
 */
export type LocationSource =
  | "exif" // 来自照片EXIF数据
  | "manual" // 用户手动输入
  | "location-library"; // 来自地点库

/**
 * 照片数据模型
 */
export interface Photo {
  id: string; // UUID
  userId: string; // 所属用户ID
  fileName: string; // 存储的文件名
  originalName: string; // 原始文件名
  fileUrl: string; // Supabase Storage 公开 URL

  // 地点库关联（优先级高于EXIF）
  locationId?: string; // 关联的地点库ID

  // EXIF 元数据
  metadata: {
    dateTime?: string; // 拍摄时间 (ISO 8601)
    location?: {
      latitude: number; // 纬度
      longitude: number; // 经度
      altitude?: number; // 海拔（米）
      source?: LocationSource; // 地点来源（新增字段）
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
  description?: JSONContent; // 描述（Novel编辑器格式）
  tags?: string[]; // 标签

  // 公开设置
  isPublic?: boolean; // 是否公开（默认 true）- 用于公共地图展示

  // 回收站状态
  trashed?: boolean; // 是否在回收站（默认 false）
  trashedAt?: string; // 移入回收站的时间 (ISO 8601)

  // 编辑状态
  originalFileUrl?: string; // 原始照片URL（编辑前），null表示从未编辑
  edited?: boolean; // 是否已编辑（默认 false）
  editedAt?: string; // 最后编辑时间 (ISO 8601)

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

/**
 * 地点数据模型
 */
export interface Location {
  id: string; // UUID
  userId: string; // 所属用户ID
  name: string; // 用户自定义名称（如"家"、"埃菲尔铁塔"）

  // 坐标（必需）
  coordinates: {
    latitude: number; // 纬度
    longitude: number; // 经度
  };

  // 地址信息（可选，来自反向地理编码）
  address?: {
    formattedAddress: string; // 完整地址
    country?: string; // 国家
    state?: string; // 州/省
    city?: string; // 城市
    postalCode?: string; // 邮编
  };

  // 可选元数据
  placeId?: string; // Google Place ID（如果可用）
  category?: string; // 用户自定义分类
  notes?: string; // 备注

  // 使用追踪
  usageCount: number; // 被多少张照片使用
  lastUsedAt?: string; // 最后使用时间 (ISO 8601)

  // 公开设置
  isPublic: boolean; // 是否公开（默认 false）- 公开的地点所有用户可见

  // 时间戳
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/**
 * 地点索引（用于快速查询）
 */
export interface LocationIndex {
  id: string;
  name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  formattedAddress?: string;
  usageCount: number;
  lastUsedAt?: string;
  isPublic: boolean; // 是否公开
  userId: string; // 所属用户ID（用于区分公共地点和私有地点）
  updatedAt: string;
}

/**
 * AI Magic 生成步骤
 */
export type AiMagicStep = "input" | "optimize" | "generate" | "result";

/**
 * AI Magic 历史记录项
 */
export interface AiMagicHistoryItem {
  id: string; // UUID
  userId: string; // 用户 ID

  // 用户输入
  userPrompt: string; // 用户原始描述
  inputImageCount: number; // 输入图片数量
  styleImageCount: number; // 风格参考图数量

  // 优化结果
  optimizedPrompt: string; // 优化后的 prompt
  reasoning?: string; // AI 推理说明

  // 输出
  resultImage: string; // 生成的图片 (base64 data URL)

  // 元数据
  model: string; // 使用的模型
  createdAt: string; // ISO 8601
}

/**
 * AI Magic 历史记录索引（用于快速查询）
 */
export interface AiMagicHistoryIndex {
  id: string;
  userPrompt: string; // 截断的用户描述
  resultImageThumbnail?: string; // 缩略图 (可选)
  createdAt: string;
}

/**
 * AI Magic Optimize API 请求
 */
export interface AiMagicOptimizeRequest {
  userPrompt: string; // 用户描述
  inputImages?: string[]; // 输入图片 base64 数组
  styleImages?: string[]; // 风格参考图 base64 数组
}

/**
 * AI Magic Optimize API 响应
 */
export interface AiMagicOptimizeResponse {
  optimizedPrompt: string; // 优化后的 prompt
  reasoning: string; // 推理过程说明
  suggestions?: string[]; // 可选建议
}

/**
 * AI Magic Generate API 请求
 */
export interface AiMagicGenerateRequest {
  prompt: string; // 用户确认的 prompt
  inputImages?: string[]; // 输入图片 base64 数组
  styleImages?: string[]; // 风格参考图 base64 数组
  userPrompt: string; // 原始用户描述（用于历史记录）
  reasoning?: string; // 推理说明（用于历史记录）
}

/**
 * AI Magic Generate API 响应
 */
export interface AiMagicGenerateResponse {
  image: string; // 生成的图片 base64
  mimeType: string; // MIME 类型
  historyId: string; // 历史记录 ID
}

// ============================================
// Canvas/Journal 画布相关类型
// ============================================

/**
 * Canvas 元素类型
 */
export type CanvasElementType = "text" | "image";

/**
 * Canvas 页面元素
 */
export interface CanvasPageElement {
  id: string; // 唯一标识
  type: CanvasElementType; // 元素类型
  x: number; // X 坐标
  y: number; // Y 坐标
  width?: number; // 宽度
  height?: number; // 高度
  draggable: boolean; // 是否可拖拽

  // 文本元素属性
  text?: string; // 纯文本内容
  html?: string; // HTML 内容（富文本）
  fontSize?: number; // 字体大小
  fontFamily?: string; // 字体
  fill?: string; // 颜色

  // 图片元素属性
  src?: string; // 图片 URL（Supabase Storage URL）
  originalSrc?: string; // 原始 base64（上传前临时使用）
}

/**
 * Canvas 页面数据
 */
export interface CanvasPageData {
  id: number; // 页面 ID
  background?: string; // 背景颜色
  elements: CanvasPageElement[]; // 页面元素
}

/**
 * Canvas 项目（完整的画布数据）
 */
export interface CanvasProject {
  id: string; // UUID
  userId: string; // 所属用户 ID
  title: string; // 项目标题

  // 画布数据
  currentPage: number; // 当前页码
  pages: CanvasPageData[]; // 所有页面

  // 缩略图
  thumbnailUrl?: string; // 缩略图 URL

  // 时间戳
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/**
 * Canvas 项目索引（用于列表展示）
 */
export interface CanvasProjectIndex {
  id: string;
  title: string;
  thumbnailUrl?: string;
  pageCount: number;
  updatedAt: string;
}

/**
 * Canvas API 请求：保存项目
 */
export interface CanvasSaveRequest {
  title?: string;
  currentPage: number;
  pages: CanvasPageData[];
}

/**
 * Canvas API 响应：项目详情
 */
export interface CanvasProjectResponse {
  project: CanvasProject;
}

/**
 * Canvas API 响应：项目列表
 */
export interface CanvasProjectListResponse {
  projects: CanvasProjectIndex[];
}
