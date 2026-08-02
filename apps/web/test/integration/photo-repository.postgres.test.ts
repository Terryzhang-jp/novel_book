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
 * 见 photo-repository.supabase.test.ts —— 那个文件会明确报告
 * "not verified"，而不是 skip 后混进通过数里。
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
 * 每个测试前把 photos 表恢复成 seed 状态。
 *
 * 契约里有大量写操作（trash / purge / setPublic），不重置会产生顺序依赖 ——
 * 那正是我在 identity.test.ts 里踩过的坑。
 *
 * 做法：删掉不属于 seed 的行，再把 seed 行的可变字段复位。
 * 比整库重建快得多（毫秒级 vs 数百毫秒），且不影响其他测试文件。
 */
const SEED_PHOTO_PREFIXES = ['a0000000-', 'b0000000-'];

async function resetSeed(): Promise<void> {
  await sql(
    `DELETE FROM photos
      WHERE NOT (${SEED_PHOTO_PREFIXES.map((_, i) => `id::text LIKE $${i + 1}`).join(' OR ')})`,
    SEED_PHOTO_PREFIXES.map((p) => `${p}%`)
  );
  // 复位 seed 行被测试改过的字段
  await sql(`
    UPDATE photos SET
      is_public = false,
      trashed   = (id = 'a0000000-0000-0000-0000-000000000009'),
      trashed_at = CASE WHEN id = 'a0000000-0000-0000-0000-000000000009'
                        THEN now() - interval '2 days' ELSE NULL END,
      -- location_id 仍是 uuid 列（只有 user_id 在 migration 里改成了 text），
      -- 所以字面量要显式转型
      location_id = CASE
        WHEN id IN ('a0000000-0000-0000-0000-000000000001',
                    'a0000000-0000-0000-0000-000000000002')
          THEN '10000000-0000-0000-0000-000000000001'::uuid
        WHEN id = 'a0000000-0000-0000-0000-000000000003'
          THEN '10000000-0000-0000-0000-000000000002'::uuid
        WHEN id = 'b0000000-0000-0000-0000-000000000001'
          THEN '20000000-0000-0000-0000-000000000001'::uuid
        ELSE NULL END
  `);
}

runPhotoRepositoryContract('PostgresPhotoRepository', () => repo, resetSeed);
