/**
 * PhotoRepository 契约
 *
 * ADR-001：每个方法的第一个参数必须是 `actor`。不存在「不带身份的查询」。
 * scripts/check-architecture.mjs 会强制这条形状约束；
 * 语义（隔离真的生效）由 photo-repository.contract.ts 的集成测试保证。
 *
 * ## 跨用户访问一律返回 NotFoundError，不返回 Forbidden
 *
 * 区分 403 和 404 会泄露「这个 id 存在」。攻击者可以用它枚举资源。
 * 真实原因记在 NotFoundError.internalReason 里（'absent' | 'forbidden'），
 * 只进服务端日志，不进响应体。
 */

import type { Actor } from '@tc/domain';
import type { Photo, PhotoCategory } from './types';

export interface ListPhotosOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly sortOrder?: 'newest' | 'oldest';
  readonly category?: PhotoCategory;
  /** 默认 false：不返回回收站里的照片 */
  readonly includeTrashed?: boolean;
}

/**
 * ⚠️ 这是一个**只读**契约（Phase 3A / 16D 起）。
 *
 * 原来它还有 create / setLocation / trash / restore / setPublic / purge。
 * photos 表在数据库层面被 `trg_guard_legacy_photo_write` 冻结之后，
 * 那些方法就成了谎话 —— 一个声称能写、实际写不进去的接口，
 * 比没有这个接口更糟：它会一直吸引新的调用方。
 *
 * 对应的新能力：
 *
 *   新增素材        uploadAsset（@tc/application）
 *   软删除 / 恢复   deleteAsset / restoreAsset
 *   公开            Publication —— 素材本身没有「公开」这个状态
 *   旧形状          mapAssetToLegacyPhotoDto（同一个包里的只读投影）
 */
export interface PhotoRepository {
  /** 列出 actor 自己的照片。**只返回自己的**，不做跨用户回退。 */
  list(actor: Actor, options?: ListPhotosOptions): Promise<Photo[]>;

  /**
   * 按 id 取。不属于 actor 时返回 null —— 与「不存在」不可区分。
   * 上层据此返回 404。
   */
  findById(actor: Actor, id: string): Promise<Photo | null>;

  /**
   * 公开照片列表。**这是唯一接受 anonymous actor 的方法。**
   * 只返回 is_public = true 且未进回收站的照片。
   */
  listPublic(actor: Actor, options?: { limit?: number }): Promise<Photo[]>;
}
