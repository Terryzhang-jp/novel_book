/**
 * ADR-006 判定标准的可执行证明
 *
 * > 渲染一个 Publication 时，**不允许查询 moments / observations /
 * > interpretation_revisions / work_blocks / work_presentations 任何实时表**。
 *
 * ## 怎么证明「没有查」
 *
 * 「我读了代码，它没查」不算证明 —— 明天有人加一行 JOIN，没有任何东西会变红。
 *
 * 所以这里在事务里**把那五张实时表全部改名**，然后要求发布页照样渲染出来。
 * 只要读取路径碰了其中任何一张，Postgres 会直接报 relation does not exist。
 *
 * 测试结束回滚，表名恢复原状。
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  addMomentToWork,
  addTextBlock,
  createMoment,
  createWork,
  publishWork,
  reviseInterpretation,
  viewPublication,
} from '@tc/application';
import { createRepositories, PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import type { PublishDeps } from '@tc/application';
import { ANONYMOUS, assertSnapshotIsSelfContained, userActor } from '@tc/domain';
import { getPool } from '../db/setup';
import { getAudioDeriver, getImageDeriver, getStorageKit } from '@/lib/core/storage';

const ALICE = userActor('11111111-1111-1111-1111-111111111111', 'sess-alice');
const NOW = '2026-08-03T00:00:00.000Z';

/** 渲染发布页时**绝对不能**碰的表 */
const LIVE_TABLES = [
  'moments',
  'observations',
  'interpretation_revisions',
  'work_blocks',
  'work_presentations',
];

let core: PostgresUnitOfWork;
let publishDeps: PublishDeps;

beforeAll(() => {
  core = new PostgresUnitOfWork(getPool() as unknown as Pool);
  // 真实的存储和派生器 —— 不用假的。
  // 用假的就测不到「派生副本里没有 EXIF」这类断言，而那正是要证明的事。
  publishDeps = { core, storage: getStorageKit(), deriver: getImageDeriver(), audioDeriver: getAudioDeriver() };
});

describe('发布快照必须自洽', () => {
  it('五张实时表全部改名后，发布页照样渲染', async () => {
    // ── 先造一份真实的发布 ──
    const { moment } = await createMoment(core, ALICE, {
      title: '自洽性验证',
      placeLabel: '某处',
      occurredAt: NOW,
      firstObservation: '当时看到的。',
      now: NOW,
    });
    await reviseInterpretation(core, ALICE, moment.id, { content: '当时的理解。' });

    const work = await createWork(core, ALICE, { title: `自洽验证-${Date.now().toString(36)}` });
    await addTextBlock(core, ALICE, work.id, '一段开场文字。');
    await addMomentToWork(core, ALICE, work.id, moment.id);

    const published = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    const slug = published.publication.slug;

    // ── 在事务里把实时表藏起来 ──
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const t of LIVE_TABLES) {
        await client.query(`ALTER TABLE ${t} RENAME TO ${t}_hidden_for_test`);
      }

      // 确认改名真的生效了 —— 否则这条测试会在什么都没验证的情况下变绿。
      //
      // 必须用 SAVEPOINT 包起来：Postgres 里事务中的任何一个错误都会让
      // 整个事务进入 aborted 状态，后续语句一律返回
      // "current transaction is aborted"。不加 SAVEPOINT 的话，
      // 这条「确认」自己就会把下面要验证的读取路径搞崩。
      await client.query('SAVEPOINT probe');
      await expect(client.query('SELECT 1 FROM moments LIMIT 1')).rejects.toThrow(
        /relation "moments" does not exist/
      );
      await client.query('ROLLBACK TO SAVEPOINT probe');

      // 绑到这条连接的一套 repository。这就是发布页真正走的读取路径。
      const repos = createRepositories(client);
      const page = await repos.publications.findBySlug(ANONYMOUS, slug);

      expect(page).not.toBeNull();
      expect(page!.version.snapshot.work.title).toBe(work.title);

      // 快照自带全部渲染所需内容
      assertSnapshotIsSelfContained(page!.version.snapshot);

      const momentBlock = page!.version.snapshot.blocks.find((b) => b.type === 'moment_ref');
      expect(momentBlock?.type === 'moment_ref' ? momentBlock.moment?.title : null).toBe(
        '自洽性验证'
      );
      expect(
        momentBlock?.type === 'moment_ref'
          ? momentBlock.moment?.interpretation?.content
          : null
      ).toBe('当时的理解。');
      expect(
        momentBlock?.type === 'moment_ref'
          ? momentBlock.moment?.observations.map((o) => o.content)
          : null
      ).toEqual(['当时看到的。']);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }

    // 回滚之后表名恢复，普通路径仍然正常
    const view = await viewPublication(core, ANONYMOUS, slug);
    expect(view.status).toBe('ok');
  });

  it('快照里不允许出现「只有 id 没有内容」的引用', async () => {
    const { moment } = await createMoment(core, ALICE, {
      firstObservation: '内容必须被冻进去。',
      now: NOW,
    });
    const work = await createWork(core, ALICE, { title: `冻结完整性-${Date.now().toString(36)}` });
    await addMomentToWork(core, ALICE, work.id, moment.id);

    const published = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    const block = published.version.snapshot.blocks[0]!;

    expect(block.type).toBe('moment_ref');
    if (block.type === 'moment_ref') {
      // momentId 只是追溯线索，真正被渲染的是 moment 里的冻结内容
      expect(block.moment ?? block.tombstone).toBeTruthy();
      expect(block.moment?.observations.map((o) => o.content)).toEqual(['内容必须被冻进去。']);
    }
  });

  it('数据库层面也拒绝没有版本号的快照', async () => {
    // chk_snapshot_versioned。快照没有 _v，将来就无法安全演进格式 ——
    // 读到一份旧快照时没有任何依据判断它是哪一版结构。
    const { sql } = await import('../db/setup');
    await expect(
      sql(
        `INSERT INTO work_versions (work_id, user_id, version_number, snapshot)
         VALUES (NULL, $1, 1, '{"work":{}}'::jsonb)`,
        [ALICE.userId]
      )
    ).rejects.toThrow(/chk_snapshot_versioned/);
  });
});
