/**
 * 海报模板类型定义
 */

export type TemplateId =
  | 'minimal'
  | 'polaroid'
  | 'magazine'
  | 'vintage'
  | 'modern'
  | 'travel-diary'
  | 'film'
  | 'gallery'
  | 'panorama'
  | 'story'
  | 'photography';

export type AspectRatio = '1:1' | '4:5' | '16:9' | '9:16';

export type TemplateStyle = 'minimal' | 'vintage' | 'modern' | 'artistic' | 'casual' | 'professional';

/**
 * 海报模板配置
 */
export interface PosterTemplate {
  id: TemplateId;
  name: string;
  description: string;
  aspectRatio: AspectRatio;
  style: TemplateStyle;
  width: number; // 输出宽度（像素）
  height: number; // 输出高度（像素）
}

/**
 * 海报数据（从Photo提取）
 */
export interface PosterData {
  photoUrl: string;
  title?: string;
  description?: string; // 从JSONContent转换的纯文本
  location?: string; // 地点名称
  date?: string; // 格式化日期
  camera?: string; // 相机型号
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  // EXIF Data for Photography Template
  exif?: {
    iso?: string;
    aperture?: string;
    shutterSpeed?: string;
    focalLength?: string;
    lensModel?: string;
  };
  width?: number;
  height?: number;
}

/**
 * 导出选项
 */
export interface ExportOptions {
  format: 'png' | 'jpg';
  quality?: number; // 0-1，仅对JPG有效
  scale?: number; // 缩放比例，默认2（2x分辨率）
}
