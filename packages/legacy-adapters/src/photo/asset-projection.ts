/**
 * Asset → 旧 Photo DTO 的**只读投影** —— Phase 3A / 16C
 *
 * ## 这个文件存在的理由
 *
 * Phase 3A 的决定是：新 Asset 是唯一的写入事实，**不做双写**。
 * 于是旧 Gallery 面临一个选择 ——
 *
 *   a) 一起改掉               改 8 个页面、20 个组件，Phase 3A 会拖成 Phase 3
 *   b) 让它继续读 photos 表   两套数据同时生长，正是要停止的事情
 *   c) 把 Asset 投影成它要的形状   ← 这个文件
 *
 * (c) 的代价是一层翻译，收益是：旧页面一行不改就能看到新素材，而旧写入
 * 路径可以在同一个提交里被物理封死。翻译层随旧页面一起删除。
 *
 * ## 这里**没有**反方向
 *
 * 没有 `mapLegacyPhotoToAsset`，没有 `save`，没有 `create`。
 * 投影是单向的 —— 一旦出现反向映射，「Asset 是唯一事实」就不成立了，
 * 而那正是 15E 之前那个双系统状态的入口。
 *
 * ## 三处刻意的不忠实
 *
 * 旧 DTO 有些字段在新模型里**不存在**，也不该被编出来：
 *
 *   isPublic       永远 false。公开性由 Publication 管理，与素材无关。
 *                  这里返回 true 需要理由，而不存在这样的理由。
 *   locationId     永远 undefined。Place 能力还没有（Phase 3B）。
 *   originalName   Asset 不保存上传时的文件名（内容寻址 ⇒ 文件名不是身份）。
 *                  退回到对象名，而不是留空 —— 旧 UI 用它做 alt 文本。
 *
 * 每一处都在下面的代码里再说明一次。看到 `?? ''` 之前先读那段注释。
 */

import type { Asset, EffectiveAssetMetadata } from '@tc/domain';
import type { Photo, PhotoCategory, PhotoMetadata } from './types';

/**
 * 旧页面拿到的形状。
 *
 * 比 `Photo` 多两个字段，因为有两件事旧模型表达不了，而**沉默地丢掉它们
 * 就等于撒谎**：
 *
 *   capturedLocalAt  相机记下的墙上时间，没有时区（ADR-009 T1）
 *   timezoneKnown    上面那个时间到底能不能换算成绝对时刻
 *
 * 旧 UI 会忽略这两个字段，新代码可以用。这是投影层唯一被允许「多给」的
 * 地方 —— 多给不会误导，少给会。
 */
export interface LegacyPhotoView extends Photo {
  /** `2026-08-03T14:35:00`，**没有时区后缀**。不要 `new Date()` 它。 */
  readonly capturedLocalAt?: string;
  /** false 表示 metadata.dateTime 一定是空的，不是「碰巧没读到」 */
  readonly timezoneKnown: boolean;
}

/**
 * 投影需要知道「这份素材从哪个 URL 取」。
 *
 * 用函数注入而不是在这里拼路由：这个包不该知道 Next 的目录结构，
 * 也不该知道端口号。测试里传两个返回固定串的函数就够了。
 */
export interface LegacyPhotoUrls {
  /** 原件。带 GPS 和相机序列号，调用方必须保证它走鉴权且 `no-store`。 */
  readonly original: (assetId: string) => string;
  /** 受控预览（剥了元数据、限了尺寸）。相册网格用这个。 */
  readonly thumbnail: (assetId: string) => string;
}

// ── 原始元数据的安全读取 ─────────────────────────────────────────────────────

/**
 * `assets.original_metadata` 是 `{ _v: 1, exif?: {...}, truncated?: true }`。
 *
 * 它是**上传时原封不动存下来的第三方数据**，形状不受我们控制：相机厂商
 * 会往里塞任何东西，`latitude` 可能是字符串、可能是 NaN、可能根本没有。
 * 所以每一次读取都要过一遍类型检查，一次 `as any` 就会让一个坏字段一路
 * 流到地图组件上表现为「地图空白」。
 */
function exifOf(asset: Asset): Record<string, unknown> {
  const raw = asset.originalMetadata as { exif?: unknown };
  return raw && typeof raw.exif === 'object' && raw.exif !== null
    ? (raw.exif as Record<string, unknown>)
    : {};
}

function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/**
 * 坐标。
 *
 * 优先级：**用户修正 > EXIF 原值**。这不是随手定的顺序 ——
 * ADR-008 C-5 的原话是「推断不得覆盖用户的修正」，而 EXIF 原值在修正链
 * 面前就是被修正的那一方。反过来排会让用户手动改好的地点在下一次刷新
 * 时变回相机记的那个（旧系统真实发生过）。
 */
function locationOf(
  asset: Asset,
  effective: EffectiveAssetMetadata
): PhotoMetadata['location'] {
  if (effective.gps) {
    return {
      latitude: effective.gps.latitude,
      longitude: effective.gps.longitude,
      source: 'manual',
    };
  }
  const exif = exifOf(asset);
  const latitude = finiteNumber(exif.latitude);
  const longitude = finiteNumber(exif.longitude);
  if (latitude === undefined || longitude === undefined) return undefined;

  const altitude = finiteNumber(exif.GPSAltitude);
  return {
    latitude,
    longitude,
    ...(altitude !== undefined ? { altitude } : {}),
    source: 'exif',
  };
}

function cameraOf(asset: Asset): PhotoMetadata['camera'] {
  const exif = exifOf(asset);
  const make = nonEmptyString(exif.Make);
  const model = nonEmptyString(exif.Model);
  if (!make && !model) return undefined;
  return { ...(make ? { make } : {}), ...(model ? { model } : {}) };
}

// ── 分类 ─────────────────────────────────────────────────────────────────────

/**
 * 旧的四象限分类。
 *
 * ⚠️ 「有时间」的判据是 `capturedLocalAt || capturedAt`，**不是**
 * `metadata.dateTime`。
 *
 * 大多数相机 EXIF 只有墙上时间没有时区，于是 `dateTime`（绝对时刻）是空的，
 * 而 `capturedLocalAt` 有值。用 `dateTime` 判断的话，几乎所有真实照片都会
 * 被归进「无时间」—— 旧 Gallery 的时间筛选会整体失效，而且是静默失效。
 */
export function legacyCategoryOf(
  effective: EffectiveAssetMetadata,
  location: PhotoMetadata['location']
): PhotoCategory {
  const hasTime = Boolean(effective.capturedLocalAt ?? effective.capturedAt);
  const hasLocation = Boolean(location);
  if (hasTime && hasLocation) return 'time-location';
  if (hasTime) return 'time-only';
  if (hasLocation) return 'location-only';
  return 'neither';
}

/** `users/{id}/sha256/ab/abcd….jpg` → `abcd….jpg` */
function objectName(objectKey: string): string {
  return objectKey.slice(objectKey.lastIndexOf('/') + 1);
}

// ── 投影 ─────────────────────────────────────────────────────────────────────

/**
 * 把一份 Asset 投影成旧 Gallery 认得的形状。
 *
 * 纯函数：不查库、不发请求、不写任何东西。所有需要的东西都在参数里，
 * 所以它在单元测试里是可穷举的 —— 这正是投影层该有的性质。
 */
export function mapAssetToLegacyPhotoDto(
  asset: Asset,
  effective: EffectiveAssetMetadata,
  urls: LegacyPhotoUrls
): LegacyPhotoView {
  const location = locationOf(asset, effective);
  const camera = cameraOf(asset);
  const width = asset.width;
  const height = asset.height;

  const metadata: PhotoMetadata = {
    // ⭐ 只在**真的知道绝对时刻**时才有值。
    //
    // capturedLocalAt 是「相机所在地的 14:35」。把它写进一个名字叫
    // dateTime、被下游当作 ISO-8601 时刻用的字段，等于用服务器或浏览器
    // 的时区替相机做决定 —— ADR-009 明令禁止的那件事。
    // 墙上时间原样放在 capturedLocalAt 里，需要的人自己决定怎么显示。
    ...(effective.capturedAt ? { dateTime: effective.capturedAt } : {}),
    ...(location ? { location } : {}),
    ...(camera ? { camera } : {}),
    ...(width && height ? { dimensions: { width, height } } : {}),
    fileSize: asset.byteSize,
    mimeType: asset.mimeType,
  };

  return {
    id: asset.id,
    userId: asset.userId,
    fileName: objectName(asset.objectKey),
    // Asset 不保存上传时的文件名 —— 内容寻址意味着文件名不是身份的一部分。
    // 旧 UI 拿它当 alt 文本，留空会让读屏软件念出「图片」两个字，
    // 所以退回到对象名而不是空串。
    originalName: objectName(asset.objectKey),
    fileUrl: urls.original(asset.id),
    // 音频没有预览（readAssetPreview 对非图片返回 404）。
    // 给它一个指向 404 的 URL 会让旧 UI 显示裂图 —— 不如不给。
    ...(asset.type === 'image' ? { thumbnailUrl: urls.thumbnail(asset.id) } : {}),
    // locationId 刻意缺席：Place 能力还不存在（Phase 3B）。
    // 缺席表示「这个系统还没有地点库」，不是「这张图暂时没关联上」。
    metadata,
    category: legacyCategoryOf(effective, location),
    // ⭐ 永远 false。公开性由 Publication 管理，和素材本身无关。
    // 旧系统这里曾经硬编码 true，结果每张上传的照片立刻出现在公开地图上。
    // 这一行是那次事故的反面：要让它变 true 需要一个理由，而理由不存在。
    isPublic: false,
    trashed: Boolean(asset.deletedAt),
    ...(asset.deletedAt ? { trashedAt: asset.deletedAt } : {}),
    // 「编辑过」在新模型里就是「由另一份素材派生而来」。
    // 旧模型用 edited + original_file_url 表达同一件事，但它是**覆盖式**的：
    // 编辑两次之后第一版就没了。这里指回真正还存在的那一份。
    edited: Boolean(asset.derivedFromAssetId),
    ...(asset.derivedFromAssetId
      ? { originalFileUrl: urls.original(asset.derivedFromAssetId) }
      : {}),
    createdAt: asset.createdAt,
    updatedAt: asset.createdAt,
    ...(effective.capturedLocalAt ? { capturedLocalAt: effective.capturedLocalAt } : {}),
    timezoneKnown: effective.timezone.kind !== 'unknown',
  };
}

/**
 * 排序键。
 *
 * 旧 Gallery 按「拍摄时间」排。新模型里那个时间有三种成色，按可信度取：
 *
 *   capturedAt       真正的绝对时刻（EXIF 带了时区偏移）
 *   capturedLocalAt  墙上时间。**跨时区时排序会不准** —— 这是事实本身的
 *                    模糊，不是实现缺陷。补一个时区来「修好」它才是错的。
 *   createdAt        什么都没有的图（截图、下载图）按上传时间排
 *
 * 返回可比较的字符串而不是 Date：三种值的语义不同，转成 Date 就把
 * 「墙上时间」偷偷变成了「服务器时区的时刻」。
 */
export function legacyPhotoSortKey(photo: LegacyPhotoView): string {
  return photo.metadata.dateTime ?? photo.capturedLocalAt ?? photo.createdAt;
}

/** 旧 Gallery 顶部的四象限计数。由投影结果算，不另外查库。 */
export function legacyPhotoStats(photos: readonly LegacyPhotoView[]): {
  total: number;
  byCategory: Record<PhotoCategory, number>;
} {
  const byCategory: Record<PhotoCategory, number> = {
    'time-location': 0,
    'time-only': 0,
    'location-only': 0,
    neither: 0,
  };
  for (const p of photos) byCategory[p.category] += 1;
  return { total: photos.length, byCategory };
}
