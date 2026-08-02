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

export interface CreatePhotoInput {
  readonly fileName: string;
  readonly originalName: string;
  readonly fileUrl: string;
  readonly thumbnailUrl?: string;
  readonly locationId?: string;
  readonly metadata: Photo['metadata'];
  readonly category: PhotoCategory;
  /**
   * 有意**不提供** isPublic。
   *
   * 素材默认私有，公开性由发布动作管理（ADR-002 / DOMAIN-MODEL-REVIEW P6）。
   * 把它放进创建入参会让「不小心传了 true」变成一次隐私事故。
   */
}

export interface PhotoRepository {
  /** 列出 actor 自己的照片。**只返回自己的**，不做跨用户回退。 */
  list(actor: Actor, options?: ListPhotosOptions): Promise<Photo[]>;

  /**
   * 按 id 取。不属于 actor 时返回 null —— 与「不存在」不可区分。
   * 上层据此返回 404。
   */
  findById(actor: Actor, id: string): Promise<Photo | null>;

  create(actor: Actor, input: CreatePhotoInput): Promise<Photo>;

  /** 不属于 actor 时抛 NotFoundError（internalReason='forbidden'） */
  setLocation(actor: Actor, id: string, locationId: string | null): Promise<Photo>;

  /** 软删除。幂等：已在回收站里再调一次不报错。 */
  trash(actor: Actor, id: string): Promise<Photo>;

  /** 从回收站恢复。幂等。 */
  restore(actor: Actor, id: string): Promise<Photo>;

  /** 硬删除。只能删自己的。 */
  purge(actor: Actor, id: string): Promise<void>;

  /** 设置公开状态。遗留能力 —— 新架构里由 Publication 接管。 */
  setPublic(actor: Actor, id: string, isPublic: boolean): Promise<Photo>;

  /**
   * 公开照片列表。**这是唯一接受 anonymous actor 的方法。**
   * 只返回 is_public = true 且未进回收站的照片。
   */
  listPublic(actor: Actor, options?: { limit?: number }): Promise<Photo[]>;
}
