/**
 * 海报模板配置
 */

import type { PosterTemplate } from './types';

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: 'minimal',
    name: '浮影留白',
    description: '悬浮卡片与旅行时间线',
    aspectRatio: '1:1',
    style: 'minimal',
    width: 1080,
    height: 1080,
  },
  {
    id: 'polaroid',
    name: '旅行明信片',
    description: '纸质质感，邮戳与手写笔记',
    aspectRatio: '4:5',
    style: 'casual',
    width: 1080,
    height: 1350,
  },
  {
    id: 'magazine',
    name: '旅程杂志',
    description: '左右分栏封面级排版',
    aspectRatio: '16:9',
    style: 'modern',
    width: 1920,
    height: 1080,
  },
  {
    id: 'vintage',
    name: '故事时间线',
    description: '章节时间轴与纸张肌理',
    aspectRatio: '1:1',
    style: 'vintage',
    width: 1080,
    height: 1080,
  },
  {
    id: 'modern',
    name: '城市行程',
    description: '竖屏行程节点与柔和渐变',
    aspectRatio: '9:16',
    style: 'modern',
    width: 1080,
    height: 1920,
  },
  {
    id: 'travel-diary',
    name: '地图拼贴',
    description: '牛皮纸底与地形拼贴',
    aspectRatio: '4:5',
    style: 'casual',
    width: 1080,
    height: 1350,
  },
  {
    id: 'film',
    name: '记忆拼贴',
    description: '多图 moodboard 与胶片颗粒',
    aspectRatio: '16:9',
    style: 'vintage',
    width: 1920,
    height: 1080,
  },
  {
    id: 'gallery',
    name: '艺术画册',
    description: '翻页画册与坐标信息',
    aspectRatio: '1:1',
    style: 'artistic',
    width: 1080,
    height: 1080,
  },
  {
    id: 'panorama',
    name: '电影感全景',
    description: '宽银幕与信息胶囊',
    aspectRatio: '16:9',
    style: 'modern',
    width: 1920,
    height: 1080,
  },
  {
    id: 'story',
    name: '日落故事',
    description: '社交故事比例分段叙事',
    aspectRatio: '9:16',
    style: 'modern',
    width: 1080,
    height: 1920,
  },
];

/**
 * 根据ID获取模板配置
 */
export function getTemplateById(id: string): PosterTemplate | undefined {
  return POSTER_TEMPLATES.find((t) => t.id === id);
}

/**
 * 获取所有模板
 */
export function getAllTemplates(): PosterTemplate[] {
  return POSTER_TEMPLATES;
}
