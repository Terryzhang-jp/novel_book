/**
 * Asset / MomentAsset / 元数据修正 —— ADR-008、ADR-009
 *
 * ## Asset 在这个产品里的身份是「证据」
 *
 * 不是内容中心。所以这个文件里**没有** caption、tags、category、isPublic、
 * 坐标、样式 —— 它们分别属于 Moment、Publication、WorkPresentation。
 *
 * 每加一个这样的字段，产品中心就向素材偏移一点。旧系统就是这么变成
 * 「照片墙 + 附属说明」的。
 */

import type { MomentId } from './moment';
import type { UserId } from './journey';
import { InvariantViolation } from './journey';

export type AssetId = string;
export type MomentAssetId = string;
export type CorrectionId = string;

// ── Asset ────────────────────────────────────────────────────────────────────

/** video 保留在类型里，但 Phase 2B 的上传用例拒绝它（ADR-008 A2、A-5） */
export const ASSET_TYPES = ['image', 'audio', 'video'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const SUPPORTED_UPLOAD_TYPES: readonly AssetType[] = ['image', 'audio'];

/**
 * 时区从哪来。
 *
 * `unknown` 是**默认值**，不是异常值 —— 大多数相机 EXIF 确实没有时区。
 */
export const TIMEZONE_SOURCES = ['exif', 'gps_inferred', 'user', 'unknown'] as const;
export type TimezoneSource = (typeof TIMEZONE_SOURCES)[number];

/**
 * 一份不可变的媒体素材。
 *
 * `objectKey` / `sha256` / `byteSize` / `mimeType` / `originalMetadata`
 * 创建后永不改变（ADR-008 A1，数据库触发器 T-4 强制）。
 * 裁剪、滤镜产生**新的 Asset**，用 `derivedFromAssetId` 指回来源。
 */
export interface Asset {
  readonly id: AssetId;
  readonly userId: UserId;
  readonly type: AssetType;
  /** `users/{userId}/sha256/{ab}/{hash}.{ext}`。**不存 URL**（ADR-002） */
  readonly objectKey: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  /** 相机记下的墙上时间，没有时区（ADR-009 T1） */
  readonly capturedLocalAt?: string;
  /** 只有时区已知时才有值（T-1） */
  readonly capturedAt?: string;
  readonly timezone?: string;
  readonly timezoneSource: TimezoneSource;
  readonly timezoneConfidence?: number;
  /** 上传时提取的原始元数据。**不可变** —— 修正走 corrections（T6） */
  readonly originalMetadata: Readonly<Record<string, unknown>>;
  readonly derivedFromAssetId?: AssetId;
  readonly createdAt: string;
  readonly deletedAt?: string;
}

export function isDeleted(asset: Asset): boolean {
  return Boolean(asset.deletedAt);
}

// ── 证据关系 ─────────────────────────────────────────────────────────────────

/**
 * 这份素材在这段体验里扮演什么。
 *
 * `contradicting` 是这个产品和「相册」的分界线：如果一张照片只能是支持性的，
 * 系统就默认了用户的理解不会被推翻。而「什么让我改变了理解」正是
 * ADR-004 那条修订链要回答的问题。
 */
export const MOMENT_ASSET_ROLES = ['supporting', 'contradicting', 'context'] as const;
export type MomentAssetRole = (typeof MOMENT_ASSET_ROLES)[number];

export const DEFAULT_MOMENT_ASSET_ROLE: MomentAssetRole = 'supporting';

export interface MomentAsset {
  readonly id: MomentAssetId;
  readonly momentId: MomentId;
  readonly assetId: AssetId;
  readonly role: MomentAssetRole;
  readonly sortOrder: number;
  /** 为什么放这张。可空，但存在本身是一个邀请。 */
  readonly note?: string;
  readonly createdAt: string;
}

export function isMomentAssetRole(v: unknown): v is MomentAssetRole {
  return typeof v === 'string' && (MOMENT_ASSET_ROLES as readonly string[]).includes(v);
}

// ── 元数据修正（append-only）─────────────────────────────────────────────────

export const CORRECTION_FIELDS = [
  'captured_local_at',
  'timezone',
  'gps',
  'orientation',
] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

export const CORRECTION_SOURCES = ['user', 'ai', 'gps_inferred'] as const;
export type CorrectionSource = (typeof CORRECTION_SOURCES)[number];

/**
 * 一次修正。
 *
 * 和 InterpretationRevision 是**同一个模式**：不覆盖，只追加，链上每一版都在。
 *
 * 旧系统的教训：手动地点覆盖 EXIF 之后原值无法恢复，而且下一次 AI 推断会
 * 把手动修正再覆盖回去 —— 因为系统分不清「这个值是用户定的」和
 * 「这个值是上次推断的」。
 */
export interface AssetMetadataCorrection {
  readonly id: CorrectionId;
  readonly assetId: AssetId;
  readonly userId: UserId;
  readonly field: CorrectionField;
  readonly value: unknown;
  readonly source: CorrectionSource;
  readonly confidence?: number;
  readonly supersedesId?: CorrectionId;
  readonly createdAt: string;
}

// ── 不变量 ───────────────────────────────────────────────────────────────────

export interface CreateAssetInput {
  readonly type: AssetType;
  readonly objectKey: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly capturedLocalAt?: string;
  readonly capturedAt?: string;
  readonly timezone?: string;
  readonly timezoneSource?: TimezoneSource;
  readonly timezoneConfidence?: number;
  readonly originalMetadata?: Readonly<Record<string, unknown>>;
  readonly derivedFromAssetId?: AssetId;
}

export function assertValidAssetInput(input: CreateAssetInput): void {
  if (!(ASSET_TYPES as readonly string[]).includes(input.type)) {
    throw new InvariantViolation('A-5', `不支持的素材类型 ${String(input.type)}`);
  }
  if (!SUPPORTED_UPLOAD_TYPES.includes(input.type)) {
    // 数据库允许 video 行存在（为将来留位置），但产品现在不支持。
    // 写在这里而不是只写在文档里 —— 免得有人以为「数据库允许 = 产品支持」。
    throw new InvariantViolation(
      'A-5',
      `暂不支持 ${input.type}。视频需要转码、抽帧、时长探测，` +
        '任何一项做不完整都会让「上传成功但打不开」变成常态'
    );
  }
  if (input.byteSize <= 0) {
    throw new InvariantViolation('A-byte', 'byteSize 必须大于 0');
  }
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
    throw new InvariantViolation('A-hash', 'sha256 必须是 64 位小写十六进制');
  }
  // A-3：没有尺寸的图片无法在发布时正确排版，也无法判断是否需要缩放
  if (input.type === 'image' && (!input.width || !input.height)) {
    throw new InvariantViolation('A-3', '图片必须有 width 和 height');
  }
  if (input.type === 'audio' && !input.durationMs) {
    throw new InvariantViolation('A-3', '音频必须有 durationMs');
  }
  assertValidCapturedTime(input);
}

/**
 * 时间语义的校验 —— ADR-009 的执行形式。
 *
 * 数据库有 CHECK 兜底，这里先判是为了给出可读的错误。
 */
export function assertValidCapturedTime(input: {
  capturedAt?: string;
  timezone?: string;
  timezoneSource?: TimezoneSource;
  timezoneConfidence?: number;
}): void {
  const hasTz = Boolean(input.timezone);
  const hasAbs = Boolean(input.capturedAt);

  // T-1：时区未知时绝不伪造绝对时间。
  // 用服务器时区或用户当前时区补全，等于系统在断言一件它不知道的事。
  if (hasAbs !== hasTz) {
    throw new InvariantViolation(
      'T-1',
      hasAbs
        ? 'capturedAt 有值但 timezone 为空 —— 时区未知时不能推出绝对时间'
        : 'timezone 有值但 capturedAt 为空 —— 时区已知就应该算出绝对时间'
    );
  }
  const source = input.timezoneSource ?? 'unknown';
  if (hasTz && source === 'unknown') {
    throw new InvariantViolation('T-2', 'timezone 有值时必须说明它从哪来');
  }
  if (source === 'gps_inferred' && input.timezoneConfidence === undefined) {
    // 没有置信度就无法与「用户确认过的值」区分，下一次推断会覆盖它
    throw new InvariantViolation('T-3', 'GPS 推断的时区必须带置信度');
  }
}

// ── 时间显示（纯函数）────────────────────────────────────────────────────────

export interface CapturedTimeDisplay {
  /** 给人看的完整文案 */
  readonly text: string;
  /** 时区是否已知。未知时 UI 应该把它做成一个可点击的补全入口。 */
  readonly timezoneKnown: boolean;
  readonly hasTime: boolean;
}

/**
 * 时间怎么显示 —— ADR-009 T3。
 *
 * 封装成一个纯函数，是为了不让十几处 UI 各自决定「时区未知时显示什么」。
 * 只要有一处偷懒写了 `new Date(x).toLocaleString()`，未知时区就被伪造了，
 * 而且没有任何测试会变红。
 */
export function formatCapturedTime(asset: {
  capturedLocalAt?: string;
  timezone?: string;
}): CapturedTimeDisplay {
  if (!asset.capturedLocalAt) {
    return { text: '时间未知', timezoneKnown: false, hasTime: false };
  }
  // 直接切字符串，不经过 Date —— 经过 Date 就会被本地时区污染
  const date = asset.capturedLocalAt.slice(0, 10);
  const time = asset.capturedLocalAt.slice(11, 16);
  const stamp = `${date} ${time}`;

  if (asset.timezone) {
    return { text: `${stamp} (${asset.timezone})`, timezoneKnown: true, hasTime: true };
  }
  // 既不转换也不标 UTC。标 UTC 是在断言一件没被断言过的事。
  return { text: `${stamp} · 相机本地时间，时区未知`, timezoneKnown: false, hasTime: true };
}

// ── 修正链的合成 ─────────────────────────────────────────────────────────────

/**
 * 每个 field 当前生效的修正。
 *
 * 规则：同一 field 取修正链的最后一条；没有修正则回落到 Asset 上的原值。
 *
 * 链的形状和 Interpretation 一样由 `supersedes_id` 决定，所以分叉在这里
 * 也必须报错而不是静默取一条 —— 静默取一条意味着「当前生效的时区」
 * 会随查询顺序变化。
 */
export function latestCorrections(
  corrections: readonly AssetMetadataCorrection[]
): Map<CorrectionField, AssetMetadataCorrection> {
  const byField = new Map<CorrectionField, AssetMetadataCorrection[]>();
  for (const c of corrections) {
    const bucket = byField.get(c.field);
    if (bucket) bucket.push(c);
    else byField.set(c.field, [c]);
  }

  const out = new Map<CorrectionField, AssetMetadataCorrection>();
  for (const [field, list] of byField) {
    const superseded = new Set(
      list.map((c) => c.supersedesId).filter((id): id is CorrectionId => Boolean(id))
    );
    const tips = list.filter((c) => !superseded.has(c.id));
    if (tips.length !== 1) {
      throw new InvariantViolation(
        'C-1',
        `${field} 的修正链有 ${tips.length} 个末端 —— 分叉或成环，无法判断当前值`
      );
    }
    out.set(field, tips[0]!);
  }
  return out;
}

/**
 * 推断不得覆盖用户的修正 —— C-5。
 *
 * 这条**没法用数据库约束表达**（需要比较两行的 source 与先后），
 * 所以它是用例层契约，并且有专门的测试盯着。
 *
 * 没有这条，用户手动修好的时区会在下一次 GPS 推断时被悄悄改回去 ——
 * 这正是旧系统里已经发生过一次的事故。
 */
export function assertCorrectionAllowed(
  field: CorrectionField,
  incomingSource: CorrectionSource,
  current: AssetMetadataCorrection | undefined
): void {
  if (!current) return;
  if (incomingSource === 'user') return; // 用户永远可以改
  if (current.source === 'user') {
    throw new InvariantViolation(
      'C-5',
      `${field} 已被用户手动修正过，${incomingSource} 的推断不能覆盖它`
    );
  }
}

/**
 * `+09:00` / `-05:30` 这类固定偏移。
 *
 * EXIF 的 OffsetTimeOriginal 只给得出这个 —— 它不知道 `Asia/Tokyo`。
 * 从偏移量推时区名是伪造（`+09:00` 也可能是首尔），所以两种都允许存进
 * timezone 列，靠这个正则区分能不能算绝对时间。
 */
const FIXED_OFFSET_RE = /^[+-]\d{2}:\d{2}$/;

/** 界面上可选的偏移量。第一版不接 IANA 时区库，只提供固定偏移。 */
export const COMMON_UTC_OFFSETS: readonly { value: string; label: string }[] = [
  { value: '+09:00', label: '+09:00 日本 / 韩国' },
  { value: '+08:00', label: '+08:00 中国 / 新加坡' },
  { value: '+07:00', label: '+07:00 泰国 / 越南' },
  { value: '+05:30', label: '+05:30 印度' },
  { value: '+02:00', label: '+02:00 中欧夏令时' },
  { value: '+01:00', label: '+01:00 中欧' },
  { value: '+00:00', label: '+00:00 英国 / UTC' },
  { value: '-05:00', label: '-05:00 美东' },
  { value: '-08:00', label: '-08:00 美西' },
];

/** 合成后的有效元数据。UI 和发布都读这个，不直接读 Asset 上的原始列。 */
export interface EffectiveAssetMetadata {
  readonly capturedLocalAt?: string;
  readonly capturedAt?: string;
  readonly timezone?: string;
  readonly timezoneSource: TimezoneSource;
  readonly gps?: { readonly latitude: number; readonly longitude: number };
  readonly orientation?: number;
}

export function effectiveMetadata(
  asset: Asset,
  corrections: readonly AssetMetadataCorrection[]
): EffectiveAssetMetadata {
  const latest = latestCorrections(corrections);

  const tzCorrection = latest.get('timezone');
  const timeCorrection = latest.get('captured_local_at');
  const gpsCorrection = latest.get('gps');
  const orientationCorrection = latest.get('orientation');

  const capturedLocalAt =
    (timeCorrection?.value as string | undefined) ?? asset.capturedLocalAt;
  const timezone = (tzCorrection?.value as string | undefined) ?? asset.timezone;

  // 时区被修正过就要重算绝对时间。
  //
  // 固定偏移（`+09:00`）能算 —— 那是纯字符串运算，不需要任何时区数据库。
  // IANA 名（`Asia/Tokyo`）**算不了**：夏令时规则不在这个包里，
  // 而按「大概是这个偏移」硬算就是又一次伪造。所以那种情况 capturedAt
  // 保持 undefined，直到有真正的 tz 数据可用。
  const recomputed =
    tzCorrection && capturedLocalAt && timezone && FIXED_OFFSET_RE.test(timezone)
      ? new Date(`${capturedLocalAt}${timezone}`).toISOString()
      : undefined;

  return {
    ...(capturedLocalAt ? { capturedLocalAt } : {}),
    ...(recomputed
      ? { capturedAt: recomputed }
      : timezone && !tzCorrection && asset.capturedAt
        ? { capturedAt: asset.capturedAt }
        : {}),
    ...(timezone ? { timezone } : {}),
    timezoneSource: tzCorrection
      ? (tzCorrection.source as TimezoneSource)
      : asset.timezoneSource,
    ...(gpsCorrection
      ? { gps: gpsCorrection.value as { latitude: number; longitude: number } }
      : {}),
    ...(orientationCorrection ? { orientation: orientationCorrection.value as number } : {}),
  };
}
