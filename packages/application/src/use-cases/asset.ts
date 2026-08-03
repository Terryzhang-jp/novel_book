/**
 * Asset 用例 —— 让现实世界的照片和声音成为**证据**
 *
 * 整个 Phase 2B 的风险是素材重新夺回产品中心。所以这个文件里的每个用例
 * 都刻意保持一件事成立：
 *
 *   **没有任何一个用例要求 Moment 必须有素材。**
 *
 * 上传是可选的、挂载是可选的、发布不检查有没有图。
 * 一旦某处出现「请先上传照片」，产品就退回旧形状了。
 */

import {
  assertCorrectionAllowed,
  assertValidAssetInput,
  DEFAULT_MOMENT_ASSET_ROLE,
  effectiveMetadata,
  InvariantViolation,
  latestCorrections,
  NotFoundError,
  parseObjectKey,
  requireUser,
  SUPPORTED_UPLOAD_TYPES,
  type Actor,
  type Asset,
  type AssetId,
  type AssetMetadataCorrection,
  type CorrectionField,
  type CorrectionSource,
  type EffectiveAssetMetadata,
  type MomentAsset,
  type MomentAssetRole,
  type MomentId,
} from '@tc/domain';
import type { AttachAssetInput, MomentAssetView, Page } from '../ports/repositories';
import type { MediaProbe, StorageKit } from '../ports/media';
import type { UnitOfWork } from '../ports/unit-of-work';
import { requireActiveOwner } from './guards';

export interface AssetDeps {
  readonly core: UnitOfWork;
  readonly storage: StorageKit;
  readonly probe: MediaProbe;
}

/** 单文件大小上限。超过这个尺寸的图片对网页发布没有意义，只会拖垮上传。 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface UploadAssetInput {
  readonly bytes: Uint8Array;
  /** 浏览器声明的类型。**只作参考** —— 真实类型由魔术字节判定。 */
  readonly declaredMimeType: string;
}

export interface UploadAssetResult {
  readonly asset: Asset;
  /** true = 这份字节之前已经传过，返回的是同一个 Asset（A-1 去重） */
  readonly deduplicated: boolean;
}

/**
 * 上传一份素材。
 *
 * ## 幂等
 *
 * 同一用户上传同一份字节，永远得到**同一个 Asset**（A-1）。
 * 不是「又建一行指向同一个对象」—— 那会立刻需要跨行引用计数，
 * 而 ADR-002 的整个设计前提就是不需要引用计数。
 *
 * ## 重传一份删掉的素材 = 恢复它
 *
 * 软删除的 Asset 被重新上传时恢复（清 deleted_at），而不是报
 * 「已存在但已删除」。用户重新拖进同一张照片，意思显然是想要它回来。
 */
export async function uploadAsset(
  deps: AssetDeps,
  actor: Actor,
  input: UploadAssetInput
): Promise<UploadAssetResult> {
  // ⭐ 第一件事，在探测和写对象存储之前。
  // 这两步都是外部副作用：sharp/ffmpeg 要花时间，storage.put 会留下字节。
  // 只靠数据库触发器的话，一个待删除账号的上传会「转码完、落盘完、
  // 然后 INSERT 被拒」—— 磁盘上多一个任何表都查不到的孤儿。
  const userId = await requireActiveOwner(deps.core, actor);

  if (input.bytes.byteLength === 0) {
    throw new InvariantViolation('A-byte', '空文件');
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new InvariantViolation(
      'A-byte',
      `文件超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`
    );
  }

  // 真实类型由魔术字节判定，不信任浏览器声明的 Content-Type ——
  // 一个改了扩展名的可执行文件不该因为写着 image/jpeg 就被当成图片。
  const probed = await deps.probe.probe(input.bytes, input.declaredMimeType);

  if (!SUPPORTED_UPLOAD_TYPES.includes(probed.type)) {
    throw new InvariantViolation(
      'A-5',
      `暂不支持 ${probed.type}。视频需要转码、抽帧、时长探测，` +
        '任何一项做不完整都会让「上传成功但打不开」变成常态'
    );
  }

  const objectKey = deps.storage.buildObjectKey(userId, input.bytes, probed.mimeType);
  // hash 从 key 里解析出来，而不是再算一遍 —— 两处各算一次就有不一致的余地
  const { hash } = parseObjectKey(objectKey);

  const existing = await deps.core.assets.findBySha256(actor, hash);
  if (existing) {
    // 对象已经在那儿（内容寻址 ⇒ 同 key 同内容），不必重传
    if (existing.deletedAt) {
      const restored = await deps.core.assets.restore(actor, existing.id);
      return { asset: restored, deduplicated: true };
    }
    return { asset: existing, deduplicated: true };
  }

  // 先落对象再写数据库：反过来的话，数据库写成功而对象写失败会留下一行
  // 指向不存在文件的 Asset —— 用户看到的是永久裂图。
  // 现在这个顺序最坏情况是留下一个没有引用的对象，由对账任务清理。
  await deps.storage.storage.put({
    key: objectKey,
    body: input.bytes,
    contentType: probed.mimeType,
    // 内容寻址：同 key 必然同内容，重写是幂等的
    overwrite: true,
  });

  const createInput = {
    type: probed.type,
    objectKey,
    sha256: hash,
    mimeType: probed.mimeType,
    byteSize: input.bytes.byteLength,
    ...(probed.width ? { width: probed.width } : {}),
    ...(probed.height ? { height: probed.height } : {}),
    ...(probed.durationMs ? { durationMs: probed.durationMs } : {}),
    ...(probed.capturedLocalAt ? { capturedLocalAt: probed.capturedLocalAt } : {}),
    ...(probed.capturedAt ? { capturedAt: probed.capturedAt } : {}),
    timezone: probed.timezone,
    originalMetadata: probed.originalMetadata,
  };
  // 领域层先校验，给出可读的错误；数据库的 CHECK 兜底
  assertValidAssetInput(createInput);

  const asset = await deps.core.assets.create(actor, createInput);
  return { asset, deduplicated: false };
}

export function listAssets(uow: UnitOfWork, actor: Actor, page?: Page): Promise<Asset[]> {
  requireUser(actor);
  return uow.assets.listByUser(actor, page);
}

// ── 读模型 ───────────────────────────────────────────────────────────────────

export interface AssetDetail {
  readonly asset: Asset;
  readonly corrections: readonly AssetMetadataCorrection[];
  /** 原值 + 修正合成后的结果。UI 和发布都读这个，不直接读 asset 上的列。 */
  readonly effective: EffectiveAssetMetadata;
}

export async function getAssetDetail(
  uow: UnitOfWork,
  actor: Actor,
  id: AssetId
): Promise<AssetDetail> {
  const asset = await uow.assets.findById(actor, id);
  if (!asset) throw new NotFoundError('Asset');
  const corrections = await uow.assets.listCorrections(actor, id);
  return { asset, corrections, effective: effectiveMetadata(asset, corrections) };
}

/**
 * 取一份素材的读取 URL。
 *
 * ⚠️ 授权发生在 `findById`（SQL 里带 user_id 条件），**不是** `getSignedUrl`。
 * 直接把用户传来的 objectKey 换成 URL 等于没有授权 —— 见 ADR-002。
 */
export async function getAssetReadUrl(
  deps: Pick<AssetDeps, 'core' | 'storage'>,
  actor: Actor,
  id: AssetId,
  expiresInSeconds?: number
): Promise<string> {
  const asset = await deps.core.assets.findById(actor, id);
  if (!asset) throw new NotFoundError('Asset');
  return deps.storage.storage.getSignedUrl(asset.objectKey, expiresInSeconds);
}

/** 读原始字节。同样：授权在 findById，不在 storage。 */
export async function readAssetBytes(
  deps: Pick<AssetDeps, 'core' | 'storage'>,
  actor: Actor,
  id: AssetId
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const asset = await deps.core.assets.findById(actor, id);
  if (!asset) throw new NotFoundError('Asset');
  return {
    bytes: await deps.storage.storage.get(asset.objectKey),
    mimeType: asset.mimeType,
  };
}

// ── 证据关系 ─────────────────────────────────────────────────────────────────

export function listMomentAssets(
  uow: UnitOfWork,
  actor: Actor,
  momentId: MomentId
): Promise<MomentAssetView[]> {
  requireUser(actor);
  return uow.assets.listByMoment(actor, momentId);
}

/**
 * 把一份素材挂到 Moment 上，并说明它是什么角色的证据。
 *
 * 跨用户在这里被拦（应用层），数据库的 MA-3 触发器兜底。
 * 和 addMomentToWork 一样，别人的 Asset 和不存在的 Asset 返回**同一个错误**。
 */
export async function attachAssetToMoment(
  uow: UnitOfWork,
  actor: Actor,
  momentId: MomentId,
  assetId: AssetId,
  input: AttachAssetInput = {}
): Promise<MomentAsset> {
  requireUser(actor);
  return uow.transaction(async (r) => {
    const moment = await r.moments.findById(actor, momentId);
    if (!moment) throw new NotFoundError('Moment');
    const asset = await r.assets.findById(actor, assetId);
    if (!asset) throw new NotFoundError('Asset');
    if (asset.deletedAt) {
      throw new InvariantViolation('A-7', '这份素材已被删除，不能再作为证据挂载');
    }
    return r.assets.attach(actor, momentId, assetId, {
      role: input.role ?? DEFAULT_MOMENT_ASSET_ROLE,
      ...(input.note ? { note: input.note } : {}),
    });
  });
}

/**
 * 从 Moment 移除。
 *
 * **这不是删除素材。** 两个动作在界面上必须有两处不同的措辞，
 * 否则用户会在想做前者的时候做了后者（ADR-008 A7）。
 */
export async function detachAssetFromMoment(
  uow: UnitOfWork,
  actor: Actor,
  momentId: MomentId,
  assetId: AssetId
): Promise<void> {
  requireUser(actor);
  await uow.assets.detach(actor, momentId, assetId);
}

export async function reorderMomentAssets(
  uow: UnitOfWork,
  actor: Actor,
  momentId: MomentId,
  orderedAssetIds: readonly AssetId[]
): Promise<MomentAsset[]> {
  requireUser(actor);
  return uow.transaction((r) => r.assets.reorder(actor, momentId, orderedAssetIds));
}

/**
 * 删除素材本身。
 *
 * 软删除：引用它的 Moment **保留关系行**，界面显示「这里原本有一份素材」。
 * 和 Work 的墓碑同一个道理 —— 记录里不出现无法解释的空洞。
 *
 * 已发布的 Publication 完全不受影响：它引用的是派生副本，
 * 而 published_assets.source_asset_id 是 SET NULL。
 */
export async function deleteAsset(
  uow: UnitOfWork,
  actor: Actor,
  id: AssetId
): Promise<Asset> {
  requireUser(actor);
  return uow.assets.softDelete(actor, id);
}

// ── 元数据修正 ───────────────────────────────────────────────────────────────

export interface CorrectionCommand {
  readonly field: CorrectionField;
  readonly value: unknown;
  readonly source: CorrectionSource;
  readonly confidence?: number;
}

/**
 * 追加一次元数据修正。
 *
 * 原值永远不动（T-4 由数据库触发器强制），修正是一条 append-only 的链 ——
 * 和 Interpretation 修订完全同一个模式。
 *
 * 关键一条是 C-5：**推断不得覆盖用户的修正**。
 * 这条没法用数据库约束表达（要比较两行的 source 和先后），所以它在这里，
 * 并且有专门的测试盯着。没有它，用户手动修好的时区会在下一次 GPS 推断时
 * 被悄悄改回去 —— 旧系统里已经发生过一次。
 */
export async function applyMetadataCorrection(
  uow: UnitOfWork,
  actor: Actor,
  assetId: AssetId,
  command: CorrectionCommand
): Promise<AssetDetail> {
  requireUser(actor);
  if (command.source !== 'user' && command.confidence === undefined) {
    throw new InvariantViolation('C-4', '推断必须带置信度，否则无法与用户确认过的值区分');
  }

  return uow.transaction(async (r) => {
    const asset = await r.assets.findById(actor, assetId);
    if (!asset) throw new NotFoundError('Asset');

    const corrections = await r.assets.listCorrections(actor, assetId);
    const current = latestCorrections(corrections).get(command.field);

    assertCorrectionAllowed(command.field, command.source, current);

    await r.assets.appendCorrection(actor, assetId, {
      field: command.field,
      value: command.value,
      source: command.source,
      ...(command.confidence !== undefined ? { confidence: command.confidence } : {}),
      ...(current ? { supersedesId: current.id } : {}),
    });

    const after = await r.assets.listCorrections(actor, assetId);
    return { asset, corrections: after, effective: effectiveMetadata(asset, after) };
  });
}

/** 界面上的角色选项。放在这里而不是 UI 里 —— 措辞是产品定义的一部分。 */
export const MOMENT_ASSET_ROLE_LABELS: Readonly<Record<MomentAssetRole, string>> = {
  supporting: '这是我看到的',
  contradicting: '但这张让我不确定',
  context: '当时周围是这样',
};
