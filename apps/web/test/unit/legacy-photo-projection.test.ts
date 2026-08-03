/**
 * Asset → 旧 Photo DTO 的投影 —— Phase 3A / 16C
 *
 * ## 这些测试问的不是「函数返回了什么」
 *
 * 投影是**纯函数**，所以可以穷举。真正值得盯的是三类会造成实际伤害的
 * 错误，它们都不在正常路径上：
 *
 *   隐私   isPublic 会不会因为某个分支变成 true
 *   时间   墙上时间会不会被当成绝对时刻送出去（ADR-009）
 *   优先级 用户改过的坐标会不会被 EXIF 原值盖回去（C-5）
 *
 * 每一条在旧系统里都真实发生过。
 */

import { describe, expect, it } from 'vitest';
import { effectiveMetadata, UNKNOWN_TIMEZONE, type Asset, type AssetMetadataCorrection } from '@tc/domain';
import {
  legacyCategoryOf,
  legacyPhotoSortKey,
  legacyPhotoStats,
  mapAssetToLegacyPhotoDto,
  type LegacyPhotoUrls,
} from '@tc/legacy-adapters';

const URLS: LegacyPhotoUrls = {
  original: (id) => `/raw/${id}`,
  thumbnail: (id) => `/preview/${id}`,
};

const HASH = 'a'.repeat(64);

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    userId: 'user-1',
    type: 'image',
    objectKey: `users/user-1/sha256/aa/${HASH}.jpg`,
    sha256: HASH,
    mimeType: 'image/jpeg',
    byteSize: 12345,
    width: 4000,
    height: 3000,
    timezone: UNKNOWN_TIMEZONE,
    originalMetadata: { _v: 1 },
    createdAt: '2026-08-03T10:00:00.000Z',
    ...over,
  };
}

function project(a: Asset, corrections: readonly AssetMetadataCorrection[] = []) {
  return mapAssetToLegacyPhotoDto(a, effectiveMetadata(a, corrections), URLS);
}

function correction(over: Partial<AssetMetadataCorrection>): AssetMetadataCorrection {
  return {
    id: 'c-1',
    assetId: 'asset-1',
    userId: 'user-1',
    field: 'gps',
    value: null,
    source: 'user',
    createdAt: '2026-08-03T11:00:00.000Z',
    ...over,
  } as AssetMetadataCorrection;
}

// ── 隐私 ─────────────────────────────────────────────────────────────────────

describe('隐私：投影不可能把素材变成公开的', () => {
  /**
   * 旧系统这里硬编码过 `is_public: true`，结果每张上传的照片立刻出现在
   * 公开地图上。这条测试的存在是为了让那件事**不可能再发生一次** ——
   * 无论 Asset 长什么样。
   */
  it('isPublic 恒为 false —— 穷举各种 Asset 形状', () => {
    const shapes: Asset[] = [
      asset(),
      asset({ type: 'audio', width: undefined, height: undefined, durationMs: 5000 }),
      asset({ deletedAt: '2026-08-04T00:00:00.000Z' }),
      asset({ derivedFromAssetId: 'asset-0' }),
      asset({ originalMetadata: { _v: 1, exif: { latitude: 35.6, longitude: 139.7 } } }),
    ];
    for (const a of shapes) {
      expect(project(a).isPublic).toBe(false);
    }
  });

  it('公开性不是素材的属性 —— DTO 里也没有 locationId', () => {
    // Place 还不存在（Phase 3B）。缺席表示「这个系统还没有地点库」，
    // 不是「这张图暂时没关联上」——后者会让 UI 显示一个空的地点选择器。
    expect(project(asset()).locationId).toBeUndefined();
  });
});

// ── 时间 ─────────────────────────────────────────────────────────────────────

describe('时间：未知的时区保持未知', () => {
  it('只有墙上时间时，metadata.dateTime 必须是空的', () => {
    const p = project(asset({ capturedLocalAt: '2026-08-03T14:35:00' }));

    // ⭐ 这是整个投影里最容易犯错的一行。
    // dateTime 下游会被当成 ISO-8601 时刻用。把一个没有时区的墙上时间
    // 塞进去，等于用服务器或浏览器的时区替相机做了决定。
    expect(p.metadata.dateTime).toBeUndefined();
    expect(p.capturedLocalAt).toBe('2026-08-03T14:35:00');
    expect(p.timezoneKnown).toBe(false);
  });

  it('时区已知时才给绝对时刻', () => {
    const p = project(
      asset({
        capturedLocalAt: '2026-08-03T14:35:00',
        capturedAt: '2026-08-03T05:35:00.000Z',
        timezone: { kind: 'offset', value: '+09:00', source: 'exif' },
      })
    );
    expect(p.metadata.dateTime).toBe('2026-08-03T05:35:00.000Z');
    expect(p.timezoneKnown).toBe(true);
  });

  it('分类看的是墙上时间，不是绝对时刻', () => {
    // 大多数相机 EXIF 只有墙上时间。用 dateTime 判断的话，几乎所有真实
    // 照片都会被归进「无时间」—— 旧 Gallery 的时间筛选会整体静默失效。
    const p = project(asset({ capturedLocalAt: '2026-08-03T14:35:00' }));
    expect(p.metadata.dateTime).toBeUndefined();
    expect(p.category).toBe('time-only');
  });

  it('什么时间都没有 → neither', () => {
    expect(project(asset()).category).toBe('neither');
  });

  it('有时间有地点 → time-location', () => {
    const p = project(
      asset({
        capturedLocalAt: '2026-08-03T14:35:00',
        originalMetadata: { _v: 1, exif: { latitude: 35.6, longitude: 139.7 } },
      })
    );
    expect(p.category).toBe('time-location');
  });

  it('只有地点 → location-only', () => {
    const p = project(
      asset({ originalMetadata: { _v: 1, exif: { latitude: 35.6, longitude: 139.7 } } })
    );
    expect(p.category).toBe('location-only');
  });
});

describe('排序键：三种成色按可信度取，不互相伪装', () => {
  it('绝对时刻 > 墙上时间 > 上传时间', () => {
    expect(
      legacyPhotoSortKey(
        project(
          asset({
            capturedLocalAt: '2026-08-03T14:35:00',
            capturedAt: '2026-08-03T05:35:00.000Z',
            timezone: { kind: 'offset', value: '+09:00', source: 'exif' },
          })
        )
      )
    ).toBe('2026-08-03T05:35:00.000Z');

    expect(
      legacyPhotoSortKey(project(asset({ capturedLocalAt: '2026-08-03T14:35:00' })))
    ).toBe('2026-08-03T14:35:00');

    expect(legacyPhotoSortKey(project(asset()))).toBe('2026-08-03T10:00:00.000Z');
  });
});

// ── 坐标优先级 ───────────────────────────────────────────────────────────────

describe('坐标：用户的修正压过 EXIF 原值（C-5）', () => {
  const withExifGps = asset({
    originalMetadata: { _v: 1, exif: { latitude: 35.6812, longitude: 139.7671, GPSAltitude: 40 } },
  });

  it('没有修正时用 EXIF，并标明来源', () => {
    const p = project(withExifGps);
    expect(p.metadata.location).toEqual({
      latitude: 35.6812,
      longitude: 139.7671,
      altitude: 40,
      source: 'exif',
    });
  });

  it('有 gps 修正时用修正值', () => {
    // 反过来排的话，用户手动改好的地点会在下一次刷新时变回相机记的那个。
    // 旧系统真实发生过 —— 而且因为没有报错，没人知道是哪一步覆盖的。
    const p = project(withExifGps, [
      correction({ field: 'gps', value: { latitude: 1, longitude: 2 } }),
    ]);
    expect(p.metadata.location).toEqual({ latitude: 1, longitude: 2, source: 'manual' });
  });

  it('EXIF 里的坏值不会流到地图上', () => {
    // original_metadata 是原封不动存下来的第三方数据。相机厂商会往里塞
    // 任何东西 —— 字符串、NaN、null。一次 `as any` 就会让「地图空白」
    // 变成一个查不明白的现象。
    const bad = asset({
      originalMetadata: {
        _v: 1,
        exif: { latitude: '35.6', longitude: Number.NaN, GPSAltitude: null },
      },
    });
    expect(project(bad).metadata.location).toBeUndefined();
    expect(project(bad).category).toBe('neither');
  });

  it('只有纬度没有经度 → 不算有地点', () => {
    const half = asset({ originalMetadata: { _v: 1, exif: { latitude: 35.6 } } });
    expect(project(half).metadata.location).toBeUndefined();
  });
});

// ── 其它字段 ─────────────────────────────────────────────────────────────────

describe('其余字段的映射', () => {
  it('图片有缩略图 URL，音频没有', () => {
    expect(project(asset()).thumbnailUrl).toBe('/preview/asset-1');
    // 音频没有预览（readAssetPreview 对非图片返回 404）。
    // 给一个指向 404 的 URL 会让旧 UI 显示裂图。
    const audio = asset({
      type: 'audio',
      width: undefined,
      height: undefined,
      durationMs: 5000,
      mimeType: 'audio/mpeg',
    });
    expect(project(audio).thumbnailUrl).toBeUndefined();
    expect(project(audio).metadata.dimensions).toBeUndefined();
  });

  it('派生素材指回真正还存在的原件', () => {
    // 旧模型的 edited + original_file_url 是**覆盖式**的：编辑两次之后
    // 第一版就没了。新模型里来源素材是一份独立的、没被动过的 Asset。
    const p = project(asset({ derivedFromAssetId: 'asset-0' }));
    expect(p.edited).toBe(true);
    expect(p.originalFileUrl).toBe('/raw/asset-0');
  });

  it('没编辑过时不谎称有原件副本', () => {
    const p = project(asset());
    expect(p.edited).toBe(false);
    expect(p.originalFileUrl).toBeUndefined();
  });

  it('软删除 = 在回收站里', () => {
    const p = project(asset({ deletedAt: '2026-08-04T00:00:00.000Z' }));
    expect(p.trashed).toBe(true);
    expect(p.trashedAt).toBe('2026-08-04T00:00:00.000Z');
  });

  it('fileName 取对象名，且不带目录', () => {
    const p = project(asset());
    expect(p.fileName).toBe(`${HASH}.jpg`);
    expect(p.fileName).not.toContain('/');
    // Asset 不保存上传时的文件名 —— 内容寻址意味着文件名不是身份的一部分。
    // 退回到对象名而不是空串：旧 UI 拿它当 alt 文本。
    expect(p.originalName).toBe(p.fileName);
  });

  it('相机信息缺一半也照样给出来', () => {
    const p = project(asset({ originalMetadata: { _v: 1, exif: { Make: 'FUJIFILM' } } }));
    expect(p.metadata.camera).toEqual({ make: 'FUJIFILM' });
  });

  it('空白的相机字段等于没有', () => {
    const p = project(asset({ originalMetadata: { _v: 1, exif: { Make: '   ', Model: '' } } }));
    expect(p.metadata.camera).toBeUndefined();
  });

  it('originalMetadata 形状不对时不炸', () => {
    for (const raw of [{}, { _v: 1, exif: null }, { _v: 1, exif: 'x' }] as const) {
      const p = project(asset({ originalMetadata: raw as Record<string, unknown> }));
      expect(p.metadata.location).toBeUndefined();
      expect(p.metadata.camera).toBeUndefined();
    }
  });
});

describe('统计', () => {
  it('四个分类各自计数，总数等于四项之和', () => {
    const photos = [
      project(asset()),
      project(asset({ capturedLocalAt: '2026-08-03T14:35:00' })),
      project(asset({ originalMetadata: { _v: 1, exif: { latitude: 1, longitude: 2 } } })),
    ];
    const stats = legacyPhotoStats(photos);
    expect(stats.total).toBe(3);
    expect(stats.byCategory).toEqual({
      'time-location': 0,
      'time-only': 1,
      'location-only': 1,
      neither: 1,
    });
    expect(Object.values(stats.byCategory).reduce((a, b) => a + b, 0)).toBe(stats.total);
  });

  it('空集合的四个分类都是 0，不是 undefined', () => {
    // 旧 UI 直接把这些数字渲染出来。undefined 会显示成空白，
    // 用户看到的是「加载失败」而不是「一张都没有」。
    const stats = legacyPhotoStats([]);
    expect(stats.byCategory['time-location']).toBe(0);
    expect(stats.byCategory.neither).toBe(0);
  });
});

describe('legacyCategoryOf 单独可用', () => {
  it('不依赖投影结果，直接由合成元数据判定', () => {
    expect(legacyCategoryOf({ timezone: UNKNOWN_TIMEZONE }, undefined)).toBe('neither');
    expect(
      legacyCategoryOf({ timezone: UNKNOWN_TIMEZONE, capturedLocalAt: '2026-01-01T00:00:00' }, undefined)
    ).toBe('time-only');
  });
});
