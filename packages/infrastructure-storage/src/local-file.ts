/**
 * 本地文件实现 —— 开发、集成测试、Playwright 用
 *
 * 让「文件相关的业务逻辑」完全不需要 Docker 或任何云服务就能开发和测试：
 * 上传、去重、签名 URL、删除、对账全部可以先做完（ADR-002）。
 *
 * ## 三条硬性安全约束（ADR-002）
 *
 * 1. **根目录必须在 public/ 之外。** 构造时强制检查 —— 否则用户可以直接
 *    `GET /uploads/users/{别人的id}/...` 绕过整个 Repository 层，
 *    数据库权限做得再对也没用。
 *
 * 2. **getSignedUrl 返回应用内的带签名 URL，不是文件系统路径。**
 *    读取要经过一个走鉴权的 route handler。
 *
 * 3. **key 落盘前必须通过 parseObjectKey。** 解析后再拼路径，并二次确认
 *    绝对路径仍在 root 之内（纵深防御：万一将来 key 规范放宽了）。
 */

import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, unlink, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  type ObjectKey,
  type ObjectStorage,
  type PutObjectInput,
  type StoredObject,
  InvalidObjectKeyError,
  ObjectAlreadyExistsError,
  ObjectNotFoundError,
  parseObjectKey,
} from '@tc/domain';
import { sha256Hex } from './key';

export interface LocalFileObjectStorageOptions {
  /** 存储根目录。必须在 public/ 之外。 */
  readonly root: string;
  /**
   * 签发 URL 用的密钥。
   * 不提供则每次进程启动随机生成 —— 开发够用，生产必须显式传。
   */
  readonly urlSigningSecret?: string;
  /** 签名 URL 的应用内基础路径 */
  readonly urlBasePath?: string;
}

export class LocalFileObjectStorage implements ObjectStorage {
  private readonly root: string;
  private readonly secret: string;
  private readonly basePath: string;

  constructor(options: LocalFileObjectStorageOptions) {
    this.root = resolve(options.root);

    // ADR-002 约束 1：不允许把存储根目录放进任何会被静态服务的目录。
    // 这个检查故意做得宽 —— 宁可误伤一个奇怪的路径名，
    // 也不要让一次配置疏忽变成全量素材泄露。
    const segments = this.root.split(sep);
    if (segments.includes('public') || segments.includes('static')) {
      throw new Error(
        `LocalFileObjectStorage 的 root 不能位于 public/ 或 static/ 下（当前 ${this.root}）。` +
          '那会让文件可以绕过鉴权被直接下载。见 ADR-002。'
      );
    }

    this.secret = options.urlSigningSecret ?? randomBytes(32).toString('hex');
    this.basePath = options.urlBasePath ?? '/api/objects';
  }

  /**
   * key → 绝对路径。
   *
   * 双重防御：先 parseObjectKey（只接受一种形状），再确认拼出来的绝对路径
   * 仍在 root 之内。第二层理论上永远不会触发，但它的成本是两行代码，
   * 而漏掉它的代价是任意文件读写。
   */
  private pathFor(key: ObjectKey): string {
    parseObjectKey(key);
    const abs = resolve(this.root, key);
    const rel = relative(this.root, abs);
    if (rel.startsWith('..') || rel.startsWith(sep) || resolve(this.root, rel) !== abs) {
      throw new InvalidObjectKeyError(key, '解析后越出存储根目录');
    }
    return abs;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const path = this.pathFor(input.key);
    const hash = sha256Hex(input.body);

    const existing = await this.stat(input.key);
    if (existing && input.overwrite !== true) {
      // 内容寻址：同 key 同内容，重复写是幂等的
      if (existing.hash === hash) return existing;
      throw new ObjectAlreadyExistsError(input.key);
    }

    await mkdir(dirname(path), { recursive: true });

    // ── 原子写入 ──────────────────────────────────────────────────────────
    // 先写临时文件再 rename。同一文件系统内的 rename 是原子的，
    // 所以并发读取要么看到完整的旧内容，要么看到完整的新内容，
    // 不会看到写了一半的文件。
    //
    // 临时文件带随机后缀：两个进程同时写同一 key 时不会互相截断。
    const tmp = `${path}.tmp-${randomBytes(8).toString('hex')}`;
    try {
      await writeFile(tmp, input.body, { flag: 'wx' });
      await rename(tmp, path);
    } catch (err) {
      // 失败不留半个文件
      await unlink(tmp).catch(() => {});
      throw err;
    }

    return {
      key: input.key,
      size: input.body.byteLength,
      contentType: input.contentType,
      hash,
    };
  }

  async get(key: ObjectKey): Promise<Uint8Array> {
    const path = this.pathFor(key);
    try {
      return new Uint8Array(await readFile(path));
    } catch {
      throw new ObjectNotFoundError(key);
    }
  }

  /**
   * 签名 URL。
   *
   * 返回的是**应用内路径**，读取要经过 route handler 鉴权（ADR-002 约束 2）。
   * 签名本身只防篡改（改 key 或改过期时间），不代替所有权检查。
   */
  async getSignedUrl(key: ObjectKey, expiresInSeconds = 3600): Promise<string> {
    this.pathFor(key);
    if (!(await this.exists(key))) throw new ObjectNotFoundError(key);

    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = createHash('sha256')
      .update(`${key}:${expiresAt}:${this.secret}`)
      .digest('hex')
      .slice(0, 32);
    return `${this.basePath}/${encodeURIComponent(key)}?expires=${expiresAt}&sig=${sig}`;
  }

  /** 校验 getSignedUrl 签发的凭证。route handler 用。 */
  verifySignedUrl(key: ObjectKey, expiresAt: number, sig: string): boolean {
    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
    const expected = createHash('sha256')
      .update(`${key}:${expiresAt}:${this.secret}`)
      .digest('hex')
      .slice(0, 32);
    // 长度相同才比较，避免不同长度直接短路
    return expected.length === sig.length && expected === sig;
  }

  async delete(key: ObjectKey): Promise<void> {
    const path = this.pathFor(key);
    await rm(path, { force: true }); // 幂等
  }

  async exists(key: ObjectKey): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async stat(key: ObjectKey): Promise<StoredObject | null> {
    const path = this.pathFor(key);
    try {
      const s = await stat(path);
      if (!s.isFile()) return null;
      const { hash, ext } = parseObjectKey(key);
      return {
        key,
        size: s.size,
        // contentType 不落盘 —— 由 key 里的扩展名反推，保证与 key 自洽
        contentType: extToContentType(ext),
        hash,
      };
    } catch {
      return null;
    }
  }

  async *list(prefix: string): AsyncIterable<ObjectKey> {
    // 用递归遍历而不是 glob：不引依赖，且能精确控制跳过临时文件
    async function* walk(dir: string, rootDir: string): AsyncIterable<string> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          yield* walk(full, rootDir);
        } else if (e.isFile() && !e.name.includes('.tmp-')) {
          yield relative(rootDir, full).split(sep).join('/');
        }
      }
    }
    for await (const key of walk(this.root, this.root)) {
      if (key.startsWith(prefix)) yield key;
    }
  }

  /** 测试与调试用：拿到底层路径。生产代码不应该调用。 */
  _debugPathFor(key: ObjectKey): string {
    return this.pathFor(key);
  }

  /** 读流。大文件下载时用，避免整个读进内存。 */
  createReadStream(key: ObjectKey) {
    return createReadStream(this.pathFor(key));
  }
}

const EXT_TO_CONTENT_TYPE: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
};

function extToContentType(ext: string): string {
  return EXT_TO_CONTENT_TYPE[ext] ?? 'application/octet-stream';
}
