/**
 * 旧 Gallery 两个 bug 的直接回归保护
 *
 * ## 背景
 *
 * 审计发现 Gallery 的地点筛选永远返回 0 张、时间聚类完全失效。数据库里
 * 字段都在，丢在了 photoStorage 的行映射：`return incompleteRow as Photo`。
 *
 * 修复做了，但**修复本身没有测试守护** —— 如果有人明天又把 metadata
 * 从 SELECT 里删掉，没有任何东西会红。
 *
 * 这个文件关闭那个缺口。它不需要 Supabase 实例：映射是纯函数，
 * 用真实形状的 PostgREST row 做 fixture 就够了。
 *
 * 覆盖不到的是 PostgREST 传输层（URL 构造、参数序列化、错误处理），
 * 记在 verification-gaps.json 的 legacy-photostorage-full-path。
 */

import { describe, it, expect } from 'vitest';
import {
  mapSupabasePhotoRow,
  assertGalleryColumns,
  SupabasePhotoRowError,
  GALLERY_CRITICAL_COLUMNS,
  type SupabasePhotoRow,
} from '@/lib/storage/photo-row-mapper';

/**
 * 一行完整的 PostgREST 返回。
 *
 * 字段名和形状照抄真实数据：snake_case、metadata 是嵌套 JSON、
 * 时间戳是 ISO 字符串、tags 是数组。
 */
function completeRow(overrides: Partial<SupabasePhotoRow> = {}): SupabasePhotoRow {
  return {
    id: 'a0000000-0000-0000-0000-000000000001',
    user_id: '11111111-1111-1111-1111-111111111111',
    file_name: 'seed-01.jpg',
    original_name: 'DSC00001.JPG',
    file_url: 'https://x.supabase.co/storage/v1/object/public/photos/u/gallery/seed-01.jpg',
    thumbnail_url: 'https://x.supabase.co/storage/v1/object/public/photos/u/thumbnails/t.jpg',
    location_id: '10000000-0000-0000-0000-000000000001',
    metadata: {
      dateTime: '2025-09-14T06:40:00.000Z',
      location: { latitude: 35.9926, longitude: 139.0856, source: 'exif' },
      camera: { make: 'SONY', model: 'ILCE-7M3' },
      dimensions: { width: 6000, height: 4000 },
      fileSize: 4823910,
      mimeType: 'image/jpeg',
    },
    category: 'time-location',
    title: null,
    description: null,
    tags: null,
    is_public: false,
    trashed: false,
    trashed_at: null,
    original_file_url: null,
    edited: false,
    edited_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
describe('🔴 回归：Gallery 地点筛选（locationId 丢失）', () => {
  it('locationId 被正确映射', () => {
    const photo = mapSupabasePhotoRow(completeRow());
    expect(photo.locationId).toBe('10000000-0000-0000-0000-000000000001');
  });

  it('数据库里是 NULL 时映射成 undefined，不是字符串 "null"', () => {
    const photo = mapSupabasePhotoRow(completeRow({ location_id: null }));
    expect(photo.locationId).toBeUndefined();
    expect(photo.locationId).not.toBe('null');
  });

  it('SELECT 漏了 location_id → 立刻抛错，不返回残缺对象', () => {
    const row = completeRow();
    delete row.location_id; // 模拟 SELECT 没取这一列
    expect(() => mapSupabasePhotoRow(row)).toThrow(SupabasePhotoRowError);
    expect(() => mapSupabasePhotoRow(row)).toThrow(/location_id/);
  });

  it('区分「没 SELECT」和「值是 NULL」', () => {
    const notSelected = completeRow();
    delete notSelected.location_id;
    expect(() => assertGalleryColumns(notSelected)).toThrow(SupabasePhotoRowError);

    const isNull = completeRow({ location_id: null });
    expect(() => assertGalleryColumns(isNull)).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('🔴 回归：Gallery 时间聚类（metadata 丢失）', () => {
  it('metadata.dateTime 被正确映射', () => {
    const photo = mapSupabasePhotoRow(completeRow());
    expect(photo.metadata.dateTime).toBe('2025-09-14T06:40:00.000Z');
  });

  it('metadata.location 被正确映射（地图的输入）', () => {
    const photo = mapSupabasePhotoRow(completeRow());
    expect(photo.metadata.location).toEqual({
      latitude: 35.9926,
      longitude: 139.0856,
      source: 'exif',
    });
  });

  it('SELECT 漏了 metadata → 立刻抛错', () => {
    const row = completeRow();
    delete row.metadata;
    expect(() => mapSupabasePhotoRow(row)).toThrow(/metadata/);
  });

  it('metadata 为 NULL 时归一化成有默认值的对象，不是 undefined', () => {
    const photo = mapSupabasePhotoRow(completeRow({ metadata: null }));
    expect(photo.metadata).toBeDefined();
    expect(photo.metadata.fileSize).toBe(0);
    expect(photo.metadata.mimeType).toBe('application/octet-stream');
    expect(photo.metadata.dateTime).toBeUndefined();
  });

  it('metadata 缺子字段时不抛错，只补默认值', () => {
    const photo = mapSupabasePhotoRow(
      completeRow({ metadata: { dateTime: '2025-01-01T00:00:00.000Z' } })
    );
    expect(photo.metadata.dateTime).toBe('2025-01-01T00:00:00.000Z');
    expect(photo.metadata.fileSize).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('关键列守卫', () => {
  for (const col of GALLERY_CRITICAL_COLUMNS) {
    it(`缺少 ${col} → 抛 SupabasePhotoRowError`, () => {
      const row = completeRow();
      delete row[col as keyof SupabasePhotoRow];
      expect(() => assertGalleryColumns(row)).toThrow(SupabasePhotoRowError);
    });
  }

  it('错误信息里列出全部缺失的列，便于一次修完', () => {
    const row = completeRow();
    delete row.metadata;
    delete row.location_id;
    try {
      assertGalleryColumns(row);
      expect.unreachable('应该抛错');
    } catch (e) {
      const err = e as SupabasePhotoRowError;
      expect(err.missingColumns).toEqual(['metadata', 'location_id']);
      expect(err.message).toContain('metadata');
      expect(err.message).toContain('location_id');
    }
  });

  it('错误信息带上行 id，便于定位是哪条数据', () => {
    const row = completeRow();
    delete row.metadata;
    expect(() => assertGalleryColumns(row)).toThrow(/a0000000-0000-0000-0000-000000000001/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('其余字段映射', () => {
  it('完整行映射出完整对象', () => {
    expect(mapSupabasePhotoRow(completeRow())).toMatchObject({
      id: 'a0000000-0000-0000-0000-000000000001',
      userId: '11111111-1111-1111-1111-111111111111',
      fileName: 'seed-01.jpg',
      originalName: 'DSC00001.JPG',
      category: 'time-location',
      isPublic: false,
      trashed: false,
      edited: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('布尔字段：NULL 与 undefined 都映射成 false，不是 undefined', () => {
    const photo = mapSupabasePhotoRow(
      completeRow({ is_public: null, trashed: null, edited: null })
    );
    expect(photo.isPublic).toBe(false);
    expect(photo.trashed).toBe(false);
    expect(photo.edited).toBe(false);
  });

  it('is_public 为 true 时不被吞掉', () => {
    expect(mapSupabasePhotoRow(completeRow({ is_public: true })).isPublic).toBe(true);
  });

  it('回收站字段成对映射', () => {
    const photo = mapSupabasePhotoRow(
      completeRow({ trashed: true, trashed_at: '2026-01-05T00:00:00.000Z' })
    );
    expect(photo.trashed).toBe(true);
    expect(photo.trashedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('编辑字段成对映射', () => {
    const photo = mapSupabasePhotoRow(
      completeRow({
        edited: true,
        edited_at: '2026-01-06T00:00:00.000Z',
        original_file_url: 'https://x/orig.jpg',
      })
    );
    expect(photo.edited).toBe(true);
    expect(photo.editedAt).toBe('2026-01-06T00:00:00.000Z');
    expect(photo.originalFileUrl).toBe('https://x/orig.jpg');
  });

  it('tags 非数组时映射成 undefined，不产生假数组', () => {
    expect(mapSupabasePhotoRow(completeRow({ tags: null })).tags).toBeUndefined();
    expect(mapSupabasePhotoRow(completeRow({ tags: ['a', 'b'] })).tags).toEqual(['a', 'b']);
  });

  it('updated_at 缺失时回退到 created_at，不产生 "undefined" 字符串', () => {
    const row = completeRow();
    row.updated_at = null;
    const photo = mapSupabasePhotoRow(row);
    expect(photo.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
