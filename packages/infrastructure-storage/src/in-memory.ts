/**
 * 内存实现 —— 单元测试用
 *
 * 它存在的意义不只是「快」：它让 ObjectStorage 的契约测试有一个
 * 没有文件系统语义干扰的参照实现。如果 LocalFile 的行为和它不一致，
 * 差异一定来自文件系统，范围立刻缩小。
 */

import {
  type ObjectKey,
  type ObjectStorage,
  type PutObjectInput,
  type StoredObject,
  ObjectAlreadyExistsError,
  ObjectNotFoundError,
  parseObjectKey,
} from '@tc/domain';
import { sha256Hex } from './key';

interface Entry {
  body: Uint8Array;
  contentType: string;
  hash: string;
}

export class InMemoryObjectStorage implements ObjectStorage {
  private readonly store = new Map<ObjectKey, Entry>();

  async put(input: PutObjectInput): Promise<StoredObject> {
    // 先校验再做任何事 —— key 校验是安全边界，不能因为「内存实现没有路径」
    // 就跳过。两个实现的拒绝行为必须一致，否则契约测试就失去意义。
    parseObjectKey(input.key);

    const existing = this.store.get(input.key);
    if (existing && input.overwrite !== true) {
      // 内容寻址下同 key 必然同内容，重复写是幂等的，不算错误
      if (existing.hash === sha256Hex(input.body)) {
        return { key: input.key, size: existing.body.byteLength, contentType: existing.contentType, hash: existing.hash };
      }
      throw new ObjectAlreadyExistsError(input.key);
    }

    const hash = sha256Hex(input.body);
    // 存副本，避免调用方之后修改同一个 buffer 影响已存内容
    const body = Uint8Array.from(input.body);
    this.store.set(input.key, { body, contentType: input.contentType, hash });
    return { key: input.key, size: body.byteLength, contentType: input.contentType, hash };
  }

  async get(key: ObjectKey): Promise<Uint8Array> {
    parseObjectKey(key);
    const e = this.store.get(key);
    if (!e) throw new ObjectNotFoundError(key);
    return Uint8Array.from(e.body);
  }

  async getSignedUrl(key: ObjectKey, expiresInSeconds = 3600): Promise<string> {
    parseObjectKey(key);
    if (!this.store.has(key)) throw new ObjectNotFoundError(key);
    // 形状上与 LocalFile 保持一致：应用内路径 + 过期时间，不是文件系统路径
    return `memory://objects/${encodeURIComponent(key)}?expires=${expiresInSeconds}`;
  }

  async delete(key: ObjectKey): Promise<void> {
    parseObjectKey(key);
    this.store.delete(key); // 幂等：删不存在的对象不报错
  }

  async exists(key: ObjectKey): Promise<boolean> {
    parseObjectKey(key);
    return this.store.has(key);
  }

  async stat(key: ObjectKey): Promise<StoredObject | null> {
    parseObjectKey(key);
    const e = this.store.get(key);
    return e
      ? { key, size: e.body.byteLength, contentType: e.contentType, hash: e.hash }
      : null;
  }

  async *list(prefix: string): AsyncIterable<ObjectKey> {
    for (const key of [...this.store.keys()].sort()) {
      if (key.startsWith(prefix)) yield key;
    }
  }

  /** 测试辅助：当前对象总数 */
  get size(): number {
    return this.store.size;
  }
}
