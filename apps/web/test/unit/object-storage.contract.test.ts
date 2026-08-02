/**
 * ObjectStorage 契约 —— InMemory 与 LocalFile 跑同一套
 *
 * 两个实现通过同一份断言，是「换供应商 = 换一个 adapter」这句话的唯一
 * 证据。将来 S3 / Supabase adapter 接进来时也跑这套，不写第二份。
 *
 * 放在 unit 而不是 integration：它不需要数据库。LocalFile 用临时目录，
 * 每个测试后清理。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InvalidObjectKeyError,
  ObjectAlreadyExistsError,
  ObjectNotFoundError,
  isValidObjectKey,
  objectKeyBelongsTo,
  parseObjectKey,
  userObjectPrefix,
  type ObjectStorage,
} from '@tc/domain';
import {
  InMemoryObjectStorage,
  LocalFileObjectStorage,
  buildObjectKey,
  sha256Hex,
} from '@tc/infrastructure-storage';

const ALICE = 'alice-11111111';
const BOB = 'bob-22222222';
const JPEG = 'image/jpeg';

const bytes = (s: string) => new TextEncoder().encode(s);

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const x of it) out.push(x);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// key 的纯函数部分（与实现无关）
// ════════════════════════════════════════════════════════════════════════════

describe('ObjectKey 构造与解析', () => {
  it('同一用户 + 相同字节 → 相同 key', () => {
    const a = buildObjectKey(ALICE, bytes('hello'), JPEG);
    const b = buildObjectKey(ALICE, bytes('hello'), JPEG);
    expect(a).toBe(b);
  });

  it('同一用户 + 不同字节 → 不同 key', () => {
    const a = buildObjectKey(ALICE, bytes('hello'), JPEG);
    const b = buildObjectKey(ALICE, bytes('hello!'), JPEG);
    expect(a).not.toBe(b);
  });

  it('不同用户 + 相同字节 → 不同 key（命名空间隔离）', () => {
    const a = buildObjectKey(ALICE, bytes('same'), JPEG);
    const b = buildObjectKey(BOB, bytes('same'), JPEG);
    expect(a).not.toBe(b);
    expect(parseObjectKey(a).hash).toBe(parseObjectKey(b).hash); // 内容相同
    expect(parseObjectKey(a).userId).toBe(ALICE);
    expect(parseObjectKey(b).userId).toBe(BOB);
  });

  it('key 里的 hash 与真实字节一致', () => {
    const body = bytes('verify-me');
    const key = buildObjectKey(ALICE, body, JPEG);
    expect(parseObjectKey(key).hash).toBe(sha256Hex(body));
  });

  it('分片目录是 hash 的前两位', () => {
    const key = buildObjectKey(ALICE, bytes('x'), JPEG);
    const { hash } = parseObjectKey(key);
    expect(key).toContain(`/sha256/${hash.slice(0, 2)}/`);
  });

  it('不支持的 contentType → 拒绝', () => {
    expect(() => buildObjectKey(ALICE, bytes('x'), 'text/html')).toThrow(InvalidObjectKeyError);
    expect(() => buildObjectKey(ALICE, bytes('x'), 'application/x-sh')).toThrow(InvalidObjectKeyError);
  });

  it('非法 userId → 拒绝', () => {
    for (const bad of ['../etc', 'a/b', '', 'x'.repeat(200), 'a\0b']) {
      expect(() => buildObjectKey(bad, bytes('x'), JPEG)).toThrow(InvalidObjectKeyError);
    }
  });

  describe('路径穿越防御', () => {
    const attacks: [string, string][] = [
      ['相对路径穿越', '../../etc/passwd'],
      ['userId 段穿越', 'users/../../etc/sha256/ab/' + 'a'.repeat(64) + '.jpg'],
      ['前导斜杠', '/users/a/sha256/ab/' + 'a'.repeat(64) + '.jpg'],
      ['URL 编码穿越', 'users/a/sha256/ab/%2e%2e%2f%2e%2e.jpg'],
      ['反斜杠', 'users\\a\\sha256\\ab\\' + 'a'.repeat(64) + '.jpg'],
      ['NUL 截断', 'users/a/sha256/ab/' + 'a'.repeat(64) + '.jpg\0.txt'],
      ['hash 大写', 'users/a/sha256/AB/' + 'A'.repeat(64) + '.jpg'],
      ['hash 长度不对', 'users/a/sha256/ab/abc.jpg'],
      ['分片与 hash 不符', 'users/a/sha256/zz/' + 'a'.repeat(64) + '.jpg'],
      ['段数不足', 'users/a/sha256/' + 'a'.repeat(64) + '.jpg'],
      ['段数过多', 'users/a/sha256/ab/x/' + 'a'.repeat(64) + '.jpg'],
      ['缺扩展名', 'users/a/sha256/ab/' + 'a'.repeat(64)],
      ['首段不是 users', 'evil/a/sha256/ab/' + 'a'.repeat(64) + '.jpg'],
      ['算法段被改', 'users/a/sha256x/ab/' + 'a'.repeat(64) + '.jpg'],
    ];

    for (const [name, key] of attacks) {
      it(`拒绝：${name}`, () => {
        expect(() => parseObjectKey(key)).toThrow(InvalidObjectKeyError);
        expect(isValidObjectKey(key)).toBe(false);
      });
    }
  });

  it('objectKeyBelongsTo 正确判断归属', () => {
    const key = buildObjectKey(ALICE, bytes('x'), JPEG);
    expect(objectKeyBelongsTo(key, ALICE)).toBe(true);
    expect(objectKeyBelongsTo(key, BOB)).toBe(false);
    expect(objectKeyBelongsTo('garbage', ALICE)).toBe(false);
  });

  it('userObjectPrefix 拒绝非法 userId', () => {
    expect(userObjectPrefix(ALICE)).toBe(`users/${ALICE}/sha256/`);
    expect(() => userObjectPrefix('../x')).toThrow(InvalidObjectKeyError);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 实现契约 —— 两个实现跑同一套
// ════════════════════════════════════════════════════════════════════════════

function runObjectStorageContract(
  implName: string,
  setup: () => { storage: ObjectStorage; teardown: () => void }
): void {
  describe(`ObjectStorage 契约 · ${implName}`, () => {
    let storage: ObjectStorage;
    let teardown: () => void;

    beforeEach(() => {
      const s = setup();
      storage = s.storage;
      teardown = s.teardown;
    });
    afterEach(() => teardown());

    const putSample = async (userId: string, content: string) => {
      const body = bytes(content);
      const key = buildObjectKey(userId, body, JPEG);
      const stored = await storage.put({ key, body, contentType: JPEG });
      return { key, body, stored };
    };

    it('put 返回的 hash 与内容一致', async () => {
      const { body, stored } = await putSample(ALICE, 'content-a');
      expect(stored.hash).toBe(sha256Hex(body));
      expect(stored.size).toBe(body.byteLength);
    });

    it('put 后 get 拿回一模一样的字节', async () => {
      const { key, body } = await putSample(ALICE, 'round-trip');
      expect(await storage.get(key)).toEqual(body);
    });

    it('重复 put 相同内容是幂等的', async () => {
      const body = bytes('idempotent');
      const key = buildObjectKey(ALICE, body, JPEG);
      const a = await storage.put({ key, body, contentType: JPEG });
      const b = await storage.put({ key, body, contentType: JPEG });
      expect(b).toEqual(a);
      expect(await collect(storage.list(userObjectPrefix(ALICE)))).toHaveLength(1);
    });

    it('同 key 不同内容且未允许覆盖 → 拒绝', async () => {
      const body = bytes('original');
      const key = buildObjectKey(ALICE, body, JPEG);
      await storage.put({ key, body, contentType: JPEG });
      await expect(
        storage.put({ key, body: bytes('different'), contentType: JPEG })
      ).rejects.toBeInstanceOf(ObjectAlreadyExistsError);
    });

    it('exists / stat 语义正确', async () => {
      const { key, stored } = await putSample(ALICE, 'stat-me');
      expect(await storage.exists(key)).toBe(true);
      expect(await storage.stat(key)).toMatchObject({
        key,
        hash: stored.hash,
        size: stored.size,
      });

      const absent = buildObjectKey(ALICE, bytes('never-written'), JPEG);
      expect(await storage.exists(absent)).toBe(false);
      expect(await storage.stat(absent)).toBeNull();
    });

    it('get 不存在的对象 → ObjectNotFoundError', async () => {
      const key = buildObjectKey(ALICE, bytes('missing'), JPEG);
      await expect(storage.get(key)).rejects.toBeInstanceOf(ObjectNotFoundError);
    });

    it('getSignedUrl 不存在的对象 → ObjectNotFoundError', async () => {
      const key = buildObjectKey(ALICE, bytes('missing-url'), JPEG);
      await expect(storage.getSignedUrl(key)).rejects.toBeInstanceOf(ObjectNotFoundError);
    });

    it('getSignedUrl 返回的不是文件系统路径', async () => {
      const { key } = await putSample(ALICE, 'signed');
      const url = await storage.getSignedUrl(key);
      expect(url).not.toContain(tmpdir());
      expect(url).not.toMatch(/^\/(Users|home|var|tmp)\//);
    });

    it('delete 是幂等的', async () => {
      const { key } = await putSample(ALICE, 'delete-me');
      await storage.delete(key);
      expect(await storage.exists(key)).toBe(false);
      await expect(storage.delete(key)).resolves.toBeUndefined();
    });

    it('删除 Alice 的对象不影响 Bob 的同内容对象', async () => {
      const content = 'shared-bytes';
      const a = await putSample(ALICE, content);
      const b = await putSample(BOB, content);
      expect(a.key).not.toBe(b.key);

      await storage.delete(a.key);
      expect(await storage.exists(a.key)).toBe(false);
      expect(await storage.exists(b.key)).toBe(true);
      expect(await storage.get(b.key)).toEqual(bytes(content));
    });

    it('list 按前缀隔离用户命名空间', async () => {
      await putSample(ALICE, 'a1');
      await putSample(ALICE, 'a2');
      await putSample(BOB, 'b1');

      const aliceKeys = await collect(storage.list(userObjectPrefix(ALICE)));
      const bobKeys = await collect(storage.list(userObjectPrefix(BOB)));

      expect(aliceKeys).toHaveLength(2);
      expect(bobKeys).toHaveLength(1);
      expect(aliceKeys.every((k) => parseObjectKey(k).userId === ALICE)).toBe(true);
      expect(bobKeys.every((k) => parseObjectKey(k).userId === BOB)).toBe(true);
    });

    it('全部读写方法都拒绝非法 key', async () => {
      const bad = '../../etc/passwd';
      await expect(storage.get(bad)).rejects.toBeInstanceOf(InvalidObjectKeyError);
      await expect(storage.exists(bad)).rejects.toBeInstanceOf(InvalidObjectKeyError);
      await expect(storage.stat(bad)).rejects.toBeInstanceOf(InvalidObjectKeyError);
      await expect(storage.delete(bad)).rejects.toBeInstanceOf(InvalidObjectKeyError);
      await expect(storage.getSignedUrl(bad)).rejects.toBeInstanceOf(InvalidObjectKeyError);
      await expect(
        storage.put({ key: bad, body: bytes('x'), contentType: JPEG })
      ).rejects.toBeInstanceOf(InvalidObjectKeyError);
    });

    it('空内容也能正确存取', async () => {
      const body = new Uint8Array(0);
      const key = buildObjectKey(ALICE, body, JPEG);
      const stored = await storage.put({ key, body, contentType: JPEG });
      expect(stored.size).toBe(0);
      expect(await storage.get(key)).toEqual(body);
    });

    it('二进制内容不被破坏（不是当作 UTF-8 处理）', async () => {
      const body = new Uint8Array([0x00, 0xff, 0xfe, 0x80, 0x7f, 0x00]);
      const key = buildObjectKey(ALICE, body, JPEG);
      await storage.put({ key, body, contentType: JPEG });
      expect(await storage.get(key)).toEqual(body);
    });
  });
}

// ── InMemory ────────────────────────────────────────────────────────────────
runObjectStorageContract('InMemoryObjectStorage', () => ({
  storage: new InMemoryObjectStorage(),
  teardown: () => {},
}));

// ── LocalFile ───────────────────────────────────────────────────────────────
runObjectStorageContract('LocalFileObjectStorage', () => {
  const root = mkdtempSync(join(tmpdir(), 'tc-storage-'));
  return {
    storage: new LocalFileObjectStorage({ root, urlSigningSecret: 'test-secret' }),
    teardown: () => rmSync(root, { recursive: true, force: true }),
  };
});

// ════════════════════════════════════════════════════════════════════════════
// LocalFile 特有：文件系统层面的保证
// ════════════════════════════════════════════════════════════════════════════

describe('LocalFileObjectStorage · 文件系统语义', () => {
  let root: string;
  let storage: LocalFileObjectStorage;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tc-storage-fs-'));
    storage = new LocalFileObjectStorage({ root, urlSigningSecret: 'test-secret' });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('拒绝把 root 设在 public/ 下（ADR-002 硬性约束）', () => {
    const pub = join(root, 'public', 'uploads');
    mkdirSync(pub, { recursive: true });
    expect(() => new LocalFileObjectStorage({ root: pub })).toThrow(/public|ADR-002/);
  });

  it('拒绝把 root 设在 static/ 下', () => {
    const st = join(root, 'static', 'files');
    mkdirSync(st, { recursive: true });
    expect(() => new LocalFileObjectStorage({ root: st })).toThrow(/static|ADR-002/);
  });

  it('落盘路径始终在 root 之内', async () => {
    const body = bytes('inside');
    const key = buildObjectKey(ALICE, body, JPEG);
    await storage.put({ key, body, contentType: JPEG });
    expect(storage._debugPathFor(key).startsWith(root)).toBe(true);
  });

  it('写入是原子的：不留 .tmp- 残留', async () => {
    const body = bytes('atomic');
    const key = buildObjectKey(ALICE, body, JPEG);
    await storage.put({ key, body, contentType: JPEG });

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [e.name]
      );
    expect(walk(root).filter((n) => n.includes('.tmp-'))).toEqual([]);
  });

  it('list 会跳过临时文件（模拟上次崩溃的残留）', async () => {
    const body = bytes('with-leftover');
    const key = buildObjectKey(ALICE, body, JPEG);
    await storage.put({ key, body, contentType: JPEG });

    // 手工造一个残留的临时文件
    writeFileSync(`${storage._debugPathFor(key)}.tmp-deadbeef`, 'partial');

    const keys = await collect(storage.list(userObjectPrefix(ALICE)));
    expect(keys).toEqual([key]);
  });

  it('签名 URL 可验证，篡改 key 或过期时间即失效', async () => {
    const body = bytes('signed-url');
    const key = buildObjectKey(ALICE, body, JPEG);
    await storage.put({ key, body, contentType: JPEG });

    const url = await storage.getSignedUrl(key, 600);
    const parsed = new URL(url, 'http://localhost');
    const expires = Number(parsed.searchParams.get('expires'));
    const sig = parsed.searchParams.get('sig')!;

    expect(storage.verifySignedUrl(key, expires, sig)).toBe(true);
    // 换一个 key
    const other = buildObjectKey(BOB, body, JPEG);
    expect(storage.verifySignedUrl(other, expires, sig)).toBe(false);
    // 延长有效期
    expect(storage.verifySignedUrl(key, expires + 1000, sig)).toBe(false);
    // 已过期
    expect(storage.verifySignedUrl(key, Math.floor(Date.now() / 1000) - 10, sig)).toBe(false);
  });

  it('不同实例的签名密钥不同 → 凭证不通用', async () => {
    const body = bytes('cross-instance');
    const key = buildObjectKey(ALICE, body, JPEG);
    await storage.put({ key, body, contentType: JPEG });

    const url = await storage.getSignedUrl(key, 600);
    const expires = Number(new URL(url, 'http://x').searchParams.get('expires'));
    const sig = new URL(url, 'http://x').searchParams.get('sig')!;

    const other = new LocalFileObjectStorage({ root, urlSigningSecret: 'different-secret' });
    expect(other.verifySignedUrl(key, expires, sig)).toBe(false);
  });

  it('删除后目录里确实没有该文件', async () => {
    const body = bytes('gone');
    const key = buildObjectKey(ALICE, body, JPEG);
    await storage.put({ key, body, contentType: JPEG });
    const path = storage._debugPathFor(key);
    expect(existsSync(path)).toBe(true);

    await storage.delete(key);
    expect(existsSync(path)).toBe(false);
  });
});
