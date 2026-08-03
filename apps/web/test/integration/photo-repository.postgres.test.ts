/**
 * PhotoRepository 契约 · PostgreSQL 实现
 *
 * 跑 photo-repository.contract.ts 里那份可复用的规格。
 *
 * ## 关于「另一个实现」
 *
 * 遗留的 Supabase adapter（lib/storage/photo-storage.ts）走 supabase-js →
 * PostgREST，需要完整的 Supabase 本地栈（Docker）。当前环境没有，
 * 所以它**没有被验证**。
 *
 * 这个缺口记在 verification-gaps.json 的 legacy-photostorage-full-path。
 * 不放一条「会通过的未验证测试」—— CI 里的绿色会被理解成已验证。
 *
 * 缺口中真正出过错的那一段（字段映射）已经用纯函数测试关闭了，
 * 见 test/unit/supabase-photo-mapper.test.ts。
 */

import { beforeAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresPhotoRepository } from '@tc/legacy-adapters';
import { getPool, sql } from '../db/setup';
import { runPhotoRepositoryContract } from './photo-repository.contract';

let repo: PostgresPhotoRepository;

beforeAll(() => {
  repo = new PostgresPhotoRepository(getPool() as unknown as Pool);
});

/**
 * 契约现在**只读**，所以不需要重置。
 *
 * 原来这里有一段 `DELETE FROM photos` + `UPDATE photos SET ...`：契约里
 * 有大量写操作（trash / purge / setPublic），不重置就会产生顺序依赖。
 *
 * Phase 3A / 16D 把 photos 表冻结为只读之后，那些写操作和它们的测试
 * 一起删掉了 —— 于是重置也没有了对象。
 *
 * 保留这个函数（而不是把参数从契约里去掉）是因为契约是一份**可复用规格**：
 * 将来接一个走 PostgREST 的实现时，它仍然需要一个「回到已知状态」的钩子。
 * 这里断言 seed 还在，比返回一个空 Promise 多做一件事：
 * **如果别的测试文件污染了 photos，这里会立刻红，而不是让契约的断言
 * 以一种难以解释的方式失败。**
 */
async function resetSeed(): Promise<void> {
  const [row] = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM photos`);
  if (row?.n !== '10') {
    throw new Error(
      `photos 应该有 10 行 seed 数据，实际 ${row?.n}。` +
        'photos 表已冻结为只读（Phase 3A / 16D）—— 有行数变化说明某处仍在写它。'
    );
  }
}

runPhotoRepositoryContract('PostgresPhotoRepository', () => repo, resetSeed);
