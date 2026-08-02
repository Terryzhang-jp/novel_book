/**
 * 对象存储端口 —— ADR-002
 *
 * 只有接口和纯函数。实现（InMemory / LocalFile / S3 / Supabase）在
 * @tc/infrastructure-storage 里。
 *
 * ⚠️ 这个文件受 domain-pure 规则约束：不能 import node:crypto，
 *    所以**构造** key（需要 sha256）在 infrastructure 侧；
 *    这里只放**校验和解析**——它们是纯字符串运算。
 */

/**
 * 存储对象的稳定标识。不含供应商信息、不含域名、不含协议。
 *
 * 格式：`users/{userId}/sha256/{hash[0:2]}/{hash}.{ext}`
 *
 * userId 在 hash **之前**是刻意的：内容寻址限定在用户命名空间内。
 * 全局去重会引入跨用户生命周期、隐私侧信道、授权绕过三个问题，
 * 详见 ADR-002「为什么不做全局去重」。
 */
export type ObjectKey = string;

export interface PutObjectInput {
  readonly key: ObjectKey;
  readonly body: Uint8Array;
  readonly contentType: string;
  /** 内容寻址的对象应为 immutable。默认即是。 */
  readonly cacheControl?: string;
  /** 已存在时是否覆盖。默认 false —— 内容寻址下重复写同一 key 是幂等的。 */
  readonly overwrite?: boolean;
}

export interface StoredObject {
  readonly key: ObjectKey;
  readonly size: number;
  readonly contentType: string;
  /** 内容的 sha256（hex），用于去重与完整性校验 */
  readonly hash: string;
}

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StoredObject>;

  /**
   * 取得读取 URL。
   *
   * ⚠️ **这不是授权点。** 调用它之前必须已经确认调用者拥有对应的 Asset。
   * 见 ADR-002「读取前必须鉴权」。
   */
  getSignedUrl(key: ObjectKey, expiresInSeconds?: number): Promise<string>;

  /** 读回内容。同样不是授权点。 */
  get(key: ObjectKey): Promise<Uint8Array>;

  delete(key: ObjectKey): Promise<void>;
  exists(key: ObjectKey): Promise<boolean>;
  stat(key: ObjectKey): Promise<StoredObject | null>;

  /** 对账用：列出某前缀下的全部 key */
  list(prefix: string): AsyncIterable<ObjectKey>;
}

// ── 错误 ─────────────────────────────────────────────────────────────────────

export class ObjectNotFoundError extends Error {
  readonly code = 'OBJECT_NOT_FOUND' as const;
  constructor(key: ObjectKey) {
    super(`对象不存在: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

export class ObjectAlreadyExistsError extends Error {
  readonly code = 'OBJECT_ALREADY_EXISTS' as const;
  constructor(key: ObjectKey) {
    super(`对象已存在且未允许覆盖: ${key}`);
    this.name = 'ObjectAlreadyExistsError';
  }
}

/**
 * key 不合法。
 *
 * 这是安全边界：一个能通过校验的 key 必须保证落盘后仍在
 * `{root}/users/{userId}/` 之内。
 */
export class InvalidObjectKeyError extends Error {
  readonly code = 'INVALID_OBJECT_KEY' as const;
  constructor(key: string, reason: string) {
    super(`非法 objectKey（${reason}）: ${JSON.stringify(key)}`);
    this.name = 'InvalidObjectKeyError';
  }
}

// ── 校验与解析（纯函数）──────────────────────────────────────────────────────

/** userId 里允许出现的字符。够宽以容纳 uuid 和 Better Auth 的 id，够窄以排除路径分隔符。 */
const USER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const EXT_RE = /^[a-z0-9]{1,8}$/;

export interface ParsedObjectKey {
  readonly userId: string;
  readonly hash: string;
  readonly ext: string;
}

/**
 * 严格解析。**任何不符合规范的 key 都会抛错，不做宽容处理。**
 *
 * 路径穿越的防御在这里而不是在文件系统层：与其在拼路径之后再检查结果
 * 是否越界（容易漏、依赖平台），不如一开始就只接受一种形状的 key。
 *
 * 顺带挡掉的攻击：
 *   ../../etc/passwd            —— 段数不对且不匹配字符集
 *   users/../../x/sha256/…      —— userId 段含 `.`
 *   /users/a/sha256/…           —— 前导斜杠导致首段为空
 *   users/a/sha256/ab/%2e%2e    —— hash 段不匹配 [a-f0-9]{64}
 *   users/a/sha256/ab/AB….jpg   —— 大写不匹配，避免大小写不敏感文件系统上的碰撞
 */
export function parseObjectKey(key: string): ParsedObjectKey {
  if (typeof key !== 'string' || key.length === 0) {
    throw new InvalidObjectKeyError(String(key), '空值');
  }
  if (key.length > 512) {
    throw new InvalidObjectKeyError(key, '过长');
  }
  // 反斜杠在 Windows 上是分隔符；NUL 会截断很多系统调用
  if (key.includes('\\') || key.includes('\0')) {
    throw new InvalidObjectKeyError(key, '含非法字符');
  }

  const segments = key.split('/');
  if (segments.length !== 5) {
    throw new InvalidObjectKeyError(key, `段数应为 5，实际 ${segments.length}`);
  }

  const [ns, userId, algo, prefix, filename] = segments as [
    string, string, string, string, string,
  ];

  if (ns !== 'users') throw new InvalidObjectKeyError(key, '首段必须是 users');
  if (!USER_ID_RE.test(userId)) throw new InvalidObjectKeyError(key, 'userId 段非法');
  if (algo !== 'sha256') throw new InvalidObjectKeyError(key, '算法段必须是 sha256');

  const dot = filename.lastIndexOf('.');
  if (dot <= 0) throw new InvalidObjectKeyError(key, '文件名缺少扩展名');
  const hash = filename.slice(0, dot);
  const ext = filename.slice(dot + 1);

  if (!HASH_RE.test(hash)) throw new InvalidObjectKeyError(key, 'hash 段非法');
  if (!EXT_RE.test(ext)) throw new InvalidObjectKeyError(key, '扩展名非法');
  if (prefix !== hash.slice(0, 2)) {
    throw new InvalidObjectKeyError(key, '分片目录与 hash 前两位不一致');
  }

  return { userId, hash, ext };
}

export function isValidObjectKey(key: string): boolean {
  try {
    parseObjectKey(key);
    return true;
  } catch {
    return false;
  }
}

/** 某个 key 是否属于指定用户。授权判断的最后一道纯函数检查。 */
export function objectKeyBelongsTo(key: string, userId: string): boolean {
  try {
    return parseObjectKey(key).userId === userId;
  } catch {
    return false;
  }
}

/** 用户命名空间前缀。list() 对账时用。 */
export function userObjectPrefix(userId: string): string {
  if (!USER_ID_RE.test(userId)) {
    throw new InvalidObjectKeyError(userId, 'userId 非法');
  }
  return `users/${userId}/sha256/`;
}
