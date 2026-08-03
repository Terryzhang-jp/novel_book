/**
 * 媒体探测与对象 key 构造的端口
 *
 * 为什么不直接在用例里调 sharp / exifr：
 *   · 它们是 native 依赖，会把 application 层钉死在 Node 上
 *   · 单元测试要能用一个假的 probe 跑完整个上传用例，不需要真图片
 *
 * 实现放在 apps/web/lib/core（sharp 和 exifr 已经是那边的依赖）。
 * 不为它单开一个包 —— 包的数量本身也是成本，而这个 adapter 只有一个消费者。
 */

import type { AssetType, ObjectKey, ObjectStorage, TimezoneDeclaration } from '@tc/domain';

/**
 * 从字节里能读出来的东西。
 *
 * 注意 `timezone` 和 `capturedAt` 大多数时候是 undefined —— 相机 EXIF 通常
 * 只有 `DateTimeOriginal`，没有 `OffsetTimeOriginal`。**这是常态，不是异常。**
 * 探测器绝不能为了「让字段有值」而用服务器时区补全（ADR-009 T2）。
 */
export interface ProbedMedia {
  readonly type: AssetType;
  /** 由**魔术字节**判定的真实类型，不是浏览器声明的 Content-Type */
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly capturedLocalAt?: string;
  readonly capturedAt?: string;
  readonly timezone: TimezoneDeclaration;
  /** 原封不动的原始元数据，落进 assets.original_metadata（不可变） */
  readonly originalMetadata: Readonly<Record<string, unknown>>;
}

export interface MediaProbe {
  probe(bytes: Uint8Array, declaredMimeType: string): Promise<ProbedMedia>;
}

/**
 * 对象存储 + key 构造。
 *
 * key 的构造需要 sha256，而 domain-pure 规则禁止 domain 引入 node:crypto ——
 * 所以它以函数依赖的形式注入，而不是 import。
 */
export interface StorageKit {
  readonly storage: ObjectStorage;
  readonly buildObjectKey: (
    userId: string,
    body: Uint8Array,
    contentType: string
  ) => ObjectKey;
}

// ── 发布派生（Commit 12D 用）─────────────────────────────────────────────────

export interface DerivedImage {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

/**
 * 发布时生成安全副本。
 *
 * 实现必须做到（ADR-008 A8）：长边不超过 maxEdge、转 WebP、
 * **剥离全部元数据**（EXIF、GPS、相机序列号、内嵌缩略图）。
 */
export interface ImageDeriver {
  derive(bytes: Uint8Array, options: { maxEdge: number }): Promise<DerivedImage>;
}

/**
 * 音频的安全派生 —— ADR-008 A8 在声音上的对应物
 *
 * ## 为什么不能直接公开原始音频字节
 *
 * 和照片的 EXIF/GPS 同理，音频容器里也有身份信息：录音设备型号、
 * 录音软件、创建时间，某些格式还带位置标签。把原文件挂到公网，
 * 等于连着这些一起发出去。
 *
 * **重新编码是唯一可靠的剥离方式。** 只删已知的标签字段是不够的：
 * 容器格式很多，私有扩展段更多，漏掉一个就是漏掉。
 * 解码成 PCM 再重新编码之后，能留下来的只有声音本身。
 *
 * 顺带得到的三件事：统一格式（派生副本也内容寻址，格式不统一会让同一段
 * 录音产出多份）、受控码率（一段一小时的无损录音不该原样挂上公网）、
 * 以及一个新的内容 hash。
 */
export interface DerivedAudio {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly durationMs: number;
}

export interface AudioDeriver {
  /**
   * 实现必须做到：
   *   1. 完整重新编码（不是「复制流」）—— 否则元数据会跟着容器一起过来
   *   2. 丢弃全部容器与流级元数据
   *   3. 限制声道、采样率与码率
   *   4. 读不出时长就**失败**，不要返回一个 0
   */
  derive(bytes: Uint8Array): Promise<DerivedAudio>;
}
