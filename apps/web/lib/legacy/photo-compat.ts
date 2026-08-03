/**
 * 旧 Gallery 的只读兼容层 —— Phase 3A / 16C
 *
 * 旧页面继续请求 `/api/photos`，拿到的是**新 Asset 投影出来的 Photo 形状**。
 * 它们一行没改，但底下已经完全是新路径了。
 *
 * ## 这一层只读
 *
 * 这个文件里没有任何写入函数，也不会有。写入统一走 `uploadAsset`
 * （16B），`photos` 表在数据库层面被触发器封死（16D）。
 *
 * ## 为什么筛选和排序在内存里做
 *
 * 旧 Gallery 要按**分类**筛（有没有时间、有没有地点）和按拍摄时间排。
 * 这两件事在新 schema 里都不是列：
 *
 *   「有没有时间」   要看 captured_local_at、captured_at，
 *                   还要看修正链有没有改过它
 *   「有没有地点」   要看 original_metadata 里的 EXIF，
 *                   以及一条可能覆盖它的 gps 修正
 *   拍摄时间         三种成色（绝对时刻 / 墙上时间 / 上传时间），
 *                   合成规则在 effectiveMetadata 里
 *
 * 把这套规则再用 SQL 写一遍，就等于同一个语义有两份实现，而它们**一定**
 * 会分叉 —— 分叉的表现是「筛选结果和详情页对不上」。
 *
 * 所以：一次取回该用户的素材，投影，然后在内存里筛和排。
 * 代价是有上限的，而且上限是**说出来的**，见下面的 MAX_PROJECTED。
 */

import {
  listAssetDetails,
  type AssetDetail,
} from '@tc/application';
import {
  legacyPhotoSortKey,
  legacyPhotoStats,
  mapAssetToLegacyPhotoDto,
  type LegacyPhotoUrls,
  type LegacyPhotoView,
  type PhotoCategory,
} from '@tc/legacy-adapters';
import {
  effectiveMetadata,
  type Actor,
  type Asset,
  type AssetMetadataCorrection,
} from '@tc/domain';
import { getCore } from '@/lib/core/context';

/**
 * 一次最多投影多少份素材。
 *
 * 超过这个数的用户会拿到**被截断的结果**，而响应里会明说 `truncated: true`。
 *
 * 静默截断是这个代码库反复在挡的东西：一个只返回前 2000 条的接口，
 * 在调用方看来和「这个人只有 2000 张照片」完全一样。真到了那个规模，
 * 正确的解法是让旧 Gallery 退役，而不是把它的分类逻辑翻译进 SQL。
 */
export const MAX_PROJECTED = 2000;

/**
 * 素材的读取 URL。
 *
 * 两个都指向**走鉴权的 route handler**，不是静态目录，也不是签名 URL。
 * ADR-002：拿到 URL 不等于有权取件，每次读取都要过一遍所有权检查。
 */
export const LEGACY_PHOTO_URLS: LegacyPhotoUrls = {
  original: (assetId) => `/api/studio/assets/${assetId}/raw`,
  thumbnail: (assetId) => `/api/studio/assets/${assetId}/preview?size=thumb`,
};

export function projectOne(detail: AssetDetail): LegacyPhotoView {
  return mapAssetToLegacyPhotoDto(detail.asset, detail.effective, LEGACY_PHOTO_URLS);
}

/**
 * 单个 Asset 的投影。
 *
 * 上传返回值用这个：刚落库的素材还不可能有修正，空数组是**准确的**，
 * 不是省略。列表和详情走 projectOne —— 它们必须带上真实的修正链。
 *
 * 两条路共用 mapAssetToLegacyPhotoDto，是为了让上传的响应和随后列表里
 * 的那一条**形状完全一致**。各写一份的话，「刚传完显示正常，刷新之后
 * 分类变了」就会成为一种常见现象。
 */
export function projectAsset(
  asset: Asset,
  corrections: readonly AssetMetadataCorrection[] = []
): LegacyPhotoView {
  return mapAssetToLegacyPhotoDto(
    asset,
    effectiveMetadata(asset, corrections),
    LEGACY_PHOTO_URLS
  );
}

export interface LegacyPhotoQuery {
  readonly category?: PhotoCategory;
  readonly sortOrder?: 'newest' | 'oldest';
  readonly limit?: number;
  readonly offset?: number;
}

export interface LegacyPhotoPage {
  readonly photos: readonly LegacyPhotoView[];
  readonly stats: ReturnType<typeof legacyPhotoStats>;
  /** true = 这个用户的素材超过了 MAX_PROJECTED，下面的数字不完整 */
  readonly truncated: boolean;
}

/**
 * 旧 Gallery 的列表。
 *
 * `stats` 统计的是**筛选之前**的全集 —— 旧 UI 用它显示四个分类各有多少张，
 * 那必须是总数，不然点进一个分类之后其它三个分类的数字会跟着变成 0。
 */
export async function listLegacyPhotos(
  actor: Actor,
  query: LegacyPhotoQuery = {}
): Promise<LegacyPhotoPage> {
  // 多取一条，用来判断「是不是还有更多」——
  // 正好取满上限时无法区分「刚好这么多」和「被截断了」。
  const details = await listAssetDetails(getCore(), actor, { limit: MAX_PROJECTED + 1 });
  const truncated = details.length > MAX_PROJECTED;
  const projected = (truncated ? details.slice(0, MAX_PROJECTED) : details).map(projectOne);

  const stats = legacyPhotoStats(projected);

  const filtered = query.category
    ? projected.filter((p) => p.category === query.category)
    : projected;

  // 用 < / > 而不是 localeCompare：这些串是 ISO-8601 形状的 ASCII，
  // 字典序就是时间序。localeCompare 会受运行时 locale 影响，
  // 也就是说排序结果会跟着服务器的语言环境变 —— 那是一种很难复现的 bug。
  const sorted = [...filtered].sort((a, b) => {
    const ka = legacyPhotoSortKey(a);
    const kb = legacyPhotoSortKey(b);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return query.sortOrder === 'oldest' ? cmp : -cmp;
  });

  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.max(0, Math.min(query.limit ?? 50, 200));

  return { photos: sorted.slice(offset, offset + limit), stats, truncated };
}
