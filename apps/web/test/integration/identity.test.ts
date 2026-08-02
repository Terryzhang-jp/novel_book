/**
 * P0 · 身份统一验证
 *
 * ## 历史
 *
 * 这个文件最初是用来**证明断裂存在**的。它成功了：三条 INSERT 都抛了
 * foreign key violation，确认「新注册用户无法创建任何内容」。
 *
 * 随后 migration 20260802010000_unify_identity.sql 把 6 张业务表的外键
 * 从 users 改为指向 Better Auth 的 "user"，断裂被修复。
 *
 * 现在这些断言的方向**反过来了**：它们守护「注册即可用」这条不变量，
 * 一旦有人重新引入双用户表就会红。
 *
 * ## 原始问题记录
 *
 * ADR-001 指出旧系统同时存在两张用户表：
 *
 *   "user"   Better Auth 写入，TEXT 主键
 *   users    全部业务表的外键指向它，UUID 主键
 *
 * 两者靠「迁移脚本让 id 字符串相同」这个约定维持一致，**没有任何数据库
 * 约束保证**。而注册走的是 authClient.signUp.email() → Better Auth，
 * 它只写 "user" 和 account —— lib/auth.ts 里没有任何 databaseHooks 会
 * 补写 users。
 *
 * 推论：新注册的用户无法创建任何内容，因为业务表外键会失败。
 *
 * 这在旧生产库存在时被掩盖了 —— 那里的用户都是从 users 迁移到 "user" 的，
 * 两张表都有行。全新注册这条路径很可能从来没被真正走通过。
 *
 * 测试用**真实的 Better Auth 服务端 API**验证，不是手工 INSERT 模拟。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, getDsn } from '../db/setup';
import type { Auth } from 'better-auth';

/** Better Auth 实例。必须动态 import —— 见 test/db/setup.ts 的说明。 */
let auth: Auth;
let authPool: { end: () => Promise<void> } | null = null;

afterAll(async () => {
  // Better Auth 在模块顶层建了自己的 pg.Pool。不主动关掉的话，
  // afterAll 里 DROP DATABASE 触发的 pg_terminate_backend 会让它抛出
  // 未捕获的 "terminating connection due to administrator command"。
  await authPool?.end().catch(() => {});
  authPool = null;
});

beforeAll(async () => {
  // 确认 DATABASE_URL 确实指向本 worker 的测试库，否则下面全是在打生产库
  expect(process.env.DATABASE_URL).toBe(getDsn());
  const mod = await import('@/lib/auth');
  auth = mod.auth as unknown as Auth;
  authPool = (mod as { authDbPool?: { end: () => Promise<void> } }).authDbPool ?? null;
});

/** 每个测试用不同邮箱，避免 unique 冲突和相互干扰 */
function freshEmail(tag: string): string {
  return `newuser-${tag}-${Math.random().toString(36).slice(2, 10)}@dev.local`;
}

async function signUp(email: string) {
  return auth.api.signUpEmail({
    body: { email, password: 'integration-test-password', name: 'New User' },
    asResponse: false,
  });
}

describe('Better Auth 注册链路', () => {
  it('注册成功并在 "user" 表建行', async () => {
    const email = freshEmail('basic');
    const result = await signUp(email);

    expect(result.user?.id).toBeTruthy();

    const rows = await sql<{ id: string; email: string }>(
      'SELECT id, email FROM "user" WHERE email = $1',
      [email]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(result.user!.id);
  });

  it('注册后在 account 表写入 credential 记录', async () => {
    const email = freshEmail('account');
    const result = await signUp(email);

    const rows = await sql<{ provider_id: string; password: string | null }>(
      'SELECT provider_id, password FROM account WHERE user_id = $1',
      [result.user!.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider_id).toBe('credential');
    expect(rows[0]!.password).toBeTruthy();
  });
});

describe('注册即可用：新用户能立刻写业务数据', () => {
  it('新注册用户可以创建照片', async () => {
    const { user } = await signUp(freshEmail('photo'));

    const rows = await sql<{ id: string }>(
      `INSERT INTO photos (id, user_id, file_name, original_name, file_url, metadata, category)
       VALUES (gen_random_uuid(), $1, 'x.jpg', 'x.jpg', 'http://example/x.jpg',
               '{"fileSize":1,"mimeType":"image/jpeg"}'::jsonb, 'neither')
       RETURNING id`,
      [user!.id]
    );
    expect(rows).toHaveLength(1);
  });

  it('新注册用户可以创建文档', async () => {
    const { user } = await signUp(freshEmail('doc'));

    const rows = await sql<{ id: string }>(
      `INSERT INTO documents (id, user_id, title, content)
       VALUES (gen_random_uuid(), $1, 'T', '{}'::jsonb) RETURNING id`,
      [user!.id]
    );
    expect(rows).toHaveLength(1);
  });

  it('新注册用户可以创建地点', async () => {
    const { user } = await signUp(freshEmail('loc'));

    const rows = await sql<{ id: string }>(
      `INSERT INTO locations (id, user_id, name, coordinates, usage_count, is_public)
       VALUES (gen_random_uuid(), $1, 'L', '{"latitude":0,"longitude":0}'::jsonb, 0, false)
       RETURNING id`,
      [user!.id]
    );
    expect(rows).toHaveLength(1);
  });

  it('新注册用户可以创建画布项目', async () => {
    const { user } = await signUp(freshEmail('canvas'));

    const rows = await sql<{ id: string }>(
      `INSERT INTO canvas_projects (id, user_id, title) VALUES (gen_random_uuid(), $1, 'C') RETURNING id`,
      [user!.id]
    );
    expect(rows).toHaveLength(1);
  });

  it('删除用户会级联清掉他的业务数据', async () => {
    const { user } = await signUp(freshEmail('cascade'));
    await sql(
      `INSERT INTO photos (id, user_id, file_name, original_name, file_url, metadata, category)
       VALUES (gen_random_uuid(), $1, 'c.jpg', 'c.jpg', 'http://example/c.jpg',
               '{"fileSize":1,"mimeType":"image/jpeg"}'::jsonb, 'neither')`,
      [user!.id]
    );
    expect(await sql('SELECT 1 FROM photos WHERE user_id = $1', [user!.id])).toHaveLength(1);

    await sql('DELETE FROM "user" WHERE id = $1', [user!.id]);
    expect(await sql('SELECT 1 FROM photos WHERE user_id = $1', [user!.id])).toHaveLength(0);
  });

  it('不存在的用户 id 仍然被外键拒绝（约束真的在）', async () => {
    await expect(
      sql(
        `INSERT INTO photos (id, user_id, file_name, original_name, file_url, metadata, category)
         VALUES (gen_random_uuid(), 'no-such-user', 'x.jpg', 'x.jpg', 'http://example/x.jpg',
                 '{"fileSize":1,"mimeType":"image/jpeg"}'::jsonb, 'neither')`
      )
    ).rejects.toThrow(/foreign key|violates/i);
  });
});

describe('身份来源唯一性（守护不变量）', () => {
  it('全部业务表的外键都指向 "user"，没有一个还指向 users', async () => {
    const rows = await sql<{ table_name: string; target: string }>(`
      SELECT tc.table_name, ccu.table_name AS target
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND ccu.table_name IN ('user', 'users')
       ORDER BY tc.table_name
    `);

    expect(rows.length).toBeGreaterThan(0);
    // 一旦有人新加一张外键指向 users 的表，这里立刻红
    expect(rows.filter((r) => r.target === 'users')).toEqual([]);
  });

  it('业务表的 user_id 都是 text，与 "user".id 类型一致', async () => {
    const rows = await sql<{ table_name: string; data_type: string }>(`
      SELECT table_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'user_id'
       ORDER BY table_name
    `);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.data_type !== 'text')).toEqual([]);
  });

  it('users 表已被标记为废弃', async () => {
    const rows = await sql<{ comment: string | null }>(
      `SELECT obj_description('users'::regclass, 'pg_class') AS comment`
    );
    expect(rows[0]!.comment).toMatch(/已废弃/);
  });

  it('RLS 策略在外键改造中被完整保留（26 条）', async () => {
    const rows = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_policies WHERE schemaname = 'public'`
    );
    expect(Number(rows[0]!.n)).toBe(26);
  });
});
