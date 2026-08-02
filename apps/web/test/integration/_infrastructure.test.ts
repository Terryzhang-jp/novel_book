/**
 * 测试基础设施自检
 *
 * 这不是业务测试，是「验证验证机制本身可靠」。如果 template 建错了、
 * seed 没加载、或者 worker 之间共用了同一个库，后面所有业务测试的结论
 * 都不可信 —— 而且会以「莫名其妙的失败」形式表现出来，极难排查。
 *
 * 所以先让基础设施证明自己。
 */

import { describe, it, expect } from 'vitest';
import { sql, getDbName, getPool, inRollback } from '../db/setup';
import { schemaFingerprint, templateDbName } from '../db/template';

describe('测试数据库生命周期', () => {
  it('每个 worker 拿到自己的独立数据库', async () => {
    const name = getDbName();
    expect(name).toMatch(/^tc_it_/);
    // 不能是 template 本身 —— 那会污染后续所有 run
    expect(name).not.toContain('_tpl_');

    const [{ current }] = await sql<{ current: string }>('SELECT current_database() AS current');
    expect(current).toBe(name);
  });

  it('template 指纹随 migration/seed 内容变化', () => {
    const fp = schemaFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(templateDbName()).toBe(`tc_it_tpl_${fp}`);
  });

  it('遗留表齐全', async () => {
    const rows = await sql<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`
    );
    const names = new Set(rows.map((r) => r.tablename));
    for (const t of [
      'account', 'ai_magic_history', 'canvas_projects', 'documents',
      'locations', 'photo_embeddings', 'photos', 'session', 'user',
      'users', 'verification',
    ]) {
      expect(names.has(t), `缺少遗留表 ${t}`).toBe(true);
    }
  });

  it('Phase 2A 核心表齐全', async () => {
    const rows = await sql<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`
    );
    const names = new Set(rows.map((r) => r.tablename));
    for (const t of [
      'journeys', 'moments', 'observations', 'interpretation_revisions',
      'works', 'work_blocks', 'work_presentations',
      'work_versions', 'publications',
    ]) {
      expect(names.has(t), `缺少核心表 ${t}`).toBe(true);
    }
  });

  // 刻意**不再断言对象总数**。
  //
  // 原来这里写死了「50 个索引 / 81 个约束」，每次加表都要同时改测试和
  // 快照两个地方 —— 那种摩擦最终会让人把测试关掉。
  //
  // 精确的定义级 diff 由 `pnpm db:verify` 负责（schema.snapshot.txt 逐项
  // 比对，404 个对象）。这里只断言**语义**：该有的表在不在。

  it('seed 数据已加载：2 用户 / 10 照片', async () => {
    const [{ users }] = await sql<{ users: string }>('SELECT count(*)::text AS users FROM users');
    const [{ photos }] = await sql<{ photos: string }>('SELECT count(*)::text AS photos FROM photos');
    expect(Number(users)).toBe(2);
    expect(Number(photos)).toBe(10);
  });

  it('seed 里没有任何公开素材（migration 009 的默认值生效）', async () => {
    const [{ n }] = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM photos WHERE is_public IS TRUE'
    );
    expect(Number(n)).toBe(0);
  });

  it('photos.is_public 的数据库默认值是 false', async () => {
    const [{ def }] = await sql<{ def: string | null }>(`
      SELECT column_default AS def
        FROM information_schema.columns
       WHERE table_name = 'photos' AND column_name = 'is_public'
    `);
    expect(def).toBe('false');
  });
});

describe('测试隔离机制', () => {
  it('写入在本 worker 的库里可见', async () => {
    await sql(
      `INSERT INTO locations (id, user_id, name, coordinates, usage_count, is_public)
       VALUES ($1, $2, 'infra-probe', '{"latitude":0,"longitude":0}'::jsonb, 0, false)`,
      ['ffffffff-0000-0000-0000-00000000dead', '11111111-1111-1111-1111-111111111111']
    );
    const rows = await sql(`SELECT 1 FROM locations WHERE name = 'infra-probe'`);
    expect(rows).toHaveLength(1);

    // 清掉，避免影响同文件后续测试
    await sql(`DELETE FROM locations WHERE name = 'infra-probe'`);
  });

  it('inRollback 里的写入不会留下痕迹', async () => {
    await inRollback(async (client) => {
      await client.query(
        `INSERT INTO locations (id, user_id, name, coordinates, usage_count, is_public)
         VALUES ($1, $2, 'rollback-probe', '{"latitude":0,"longitude":0}'::jsonb, 0, false)`,
        ['ffffffff-0000-0000-0000-00000000beef', '11111111-1111-1111-1111-111111111111']
      );
      const { rows } = await client.query(`SELECT 1 FROM locations WHERE name = 'rollback-probe'`);
      expect(rows).toHaveLength(1); // 事务内可见
    });

    const after = await sql(`SELECT 1 FROM locations WHERE name = 'rollback-probe'`);
    expect(after).toHaveLength(0); // 事务外已回滚
  });

  it('连接池上限受控（避免打爆 max_connections）', () => {
    // pg 的 Pool 把配置挂在 options 上，类型里有但不在公开文档中
    expect(getPool().options.max).toBeLessThanOrEqual(4);
  });
});

describe('外键约束真的生效', () => {
  it('插入指向不存在用户的照片 → 被拒绝', async () => {
    await expect(
      sql(
        `INSERT INTO photos (id, user_id, file_name, original_name, file_url, metadata, category)
         VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
                 'x.jpg', 'x.jpg', 'http://example/x.jpg', '{}'::jsonb, 'neither')`
      )
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('category 的 CHECK 约束生效', async () => {
    await expect(
      sql(
        `INSERT INTO photos (id, user_id, file_name, original_name, file_url, metadata, category)
         VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
                 'x.jpg', 'x.jpg', 'http://example/x.jpg', '{}'::jsonb, 'not-a-valid-category')`
      )
    ).rejects.toThrow(/check constraint|violates/i);
  });
});
