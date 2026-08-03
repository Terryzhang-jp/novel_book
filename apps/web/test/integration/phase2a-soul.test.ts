/**
 * Phase 2A 灵魂测试
 *
 * ## 这一组测试和其他测试不是一个性质
 *
 * 其他测试问「代码有没有 bug」。这一组问的是**产品到底成不成立**：
 * 用户能不能真的看见那四句话。
 *
 *   「我当时这么观察」
 *   「我后来这样理解」
 *   「我的理解之后又改变了」
 *   「旧作品保留了我当时的表达」
 *
 * 每一条都对应用户在指令里点名的验收项。它们全绿，Phase 2A 才算成立；
 * 其他测试全绿而这里红，仍然算失败。
 *
 * ## 为什么走用例层而不是直接写 SQL
 *
 * 直接插数据能让断言更容易通过，但那样验证的是数据库，不是产品。
 * 这里全部经过 @tc/application 的用例 —— 和页面上点按钮走的是同一条路。
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  addMomentToWork,
  addObservation,
  addTextBlock,
  createJourney,
  createMoment,
  createWork,
  deleteJourney,
  deleteMoment,
  deleteWork,
  getMomentDetail,
  listMoments,
  publishWork,
  reviseInterpretation,
  viewPublication,
  withdrawPublication,
} from '@tc/application';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import type { PublishDeps } from '@tc/application';
import { ANONYMOUS, InvariantViolation, NotFoundError, userActor } from '@tc/domain';
import { getPool, sql } from '../db/setup';
import { getAudioDeriver, getImageDeriver, getStorageKit } from '@/lib/core/storage';

/** seed 里的固定身份 */
const ALICE = userActor('11111111-1111-1111-1111-111111111111', 'sess-alice');
const BOB = userActor('22222222-2222-2222-2222-222222222222', 'sess-bob');

let core: PostgresUnitOfWork;
let publishDeps: PublishDeps;

/**
 * 每条测试自己造数据、自己起唯一标题。
 *
 * 上一轮踩过的坑：`identity.test.ts` 里的「全表零孤儿」因为前面的测试留下了
 * 数据而随机变红。所以这里**不做全表计数断言**，只断言自己创建的对象。
 */
let seq = 0;
const uniq = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

const NOW = '2026-08-03T00:00:00.000Z';

beforeAll(() => {
  core = new PostgresUnitOfWork(getPool() as unknown as Pool);
  // 真实的存储和派生器 —— 不用假的。
  // 用假的就测不到「派生副本里没有 EXIF」这类断言，而那正是要证明的事。
  publishDeps = { core, storage: getStorageKit(), deriver: getImageDeriver(), audioDeriver: getAudioDeriver() };
});

// ════════════════════════════════════════════════════════════════════════════

describe('灵魂 1：Moment 不需要照片', () => {
  it('只有一句观察，没有标题、没有时间、没有地点、没有素材 —— 创建成功', async () => {
    const { moment, observations } = await createMoment(core, ALICE, {
      firstObservation: '巷子尽头有人在弹一件我叫不出名字的乐器。',
      now: NOW,
    });

    expect(moment.id).toBeTruthy();
    expect(moment.title).toBeUndefined();
    expect(moment.occurredAt).toBeUndefined();
    expect(moment.placeLabel).toBeUndefined();
    expect(moment.journeyId).toBeUndefined();
    expect(observations).toHaveLength(1);

    // 关键：数据库里确实没有任何素材表参与。
    // 如果哪天有人给 moments 加了 NOT NULL 的 asset_id，这条会立刻变红。
    const [row] = await sql<{ id: string }>('SELECT id FROM moments WHERE id = $1', [moment.id]);
    expect(row?.id).toBe(moment.id);
  });

  it('连观察都没有的空 Moment 也成立 —— 先记下「这里发生过什么」，内容之后补', async () => {
    const { moment, observations } = await createMoment(core, ALICE, { now: NOW });
    expect(moment.id).toBeTruthy();
    expect(observations).toHaveLength(0);
  });
});

describe('灵魂 2：理解可以改变，而且改变过程看得见', () => {
  it('v1 → v2：v1 没有消失，它变成 superseded 留在链上', async () => {
    const { moment } = await createMoment(core, ALICE, {
      title: uniq('理解演化'),
      firstObservation: '扫落叶的人扫的是别人家门口。',
      now: NOW,
    });

    const v1Text = '这里的人对公共空间有责任感。';
    const v2Text = '一周后再想，与其说是责任感，不如说是他们相信自己会一直住在这条街上。';

    const afterV1 = await reviseInterpretation(core, ALICE, moment.id, { content: v1Text });
    expect(afterV1.current?.content).toBe(v1Text);
    expect(afterV1.interpretationChain).toHaveLength(1);

    const afterV2 = await reviseInterpretation(core, ALICE, moment.id, {
      content: v2Text,
      expectedCurrentId: afterV1.current?.id,
    });

    // 「我的理解之后又改变了」—— 两版都在，顺序正确
    expect(afterV2.interpretationChain.map((r) => r.content)).toEqual([v1Text, v2Text]);
    expect(afterV2.current?.content).toBe(v2Text);

    // v1 一个字都没被改写，只是状态变了
    const v1 = afterV2.interpretationChain[0]!;
    expect(v1.id).toBe(afterV1.current?.id);
    expect(v1.content).toBe(v1Text);
    expect(v1.status).toBe('superseded');
    expect(afterV2.current?.supersedesId).toBe(v1.id);
  });

  it('观察是追加不是编辑 —— 现场记一条、当晚再记一条，是两条', async () => {
    // 两条都显式给 recordedAt。
    // 不给的话第二条走数据库的 now()，而 NOW 常量是个固定时间点 ——
    // 排序断言就变成了「测试跑的那一刻在 NOW 之前还是之后」的运气问题。
    const morning = '2026-03-15T07:15:00.000Z';
    const evening = '2026-03-15T13:40:00.000Z';

    const { moment } = await createMoment(core, ALICE, {
      firstObservation: '现场：站务员挨个鞠躬。',
      now: morning,
    });
    await addObservation(core, ALICE, moment.id, {
      content: '当晚：那不是给乘客看的。',
      recordedAt: evening,
    });

    const detail = await getMomentDetail(core, ALICE, moment.id);
    expect(detail.observations).toHaveLength(2);
    expect(detail.observations[0]!.content).toContain('现场');
    expect(detail.observations[1]!.content).toContain('当晚');
  });

  it('两个人同时改理解，后一个被拒 —— 理解链不会分叉', async () => {
    const { moment } = await createMoment(core, ALICE, { firstObservation: 'x', now: NOW });
    const v1 = await reviseInterpretation(core, ALICE, moment.id, { content: '第一版' });
    const staleId = v1.current!.id;

    await reviseInterpretation(core, ALICE, moment.id, {
      content: '第二版',
      expectedCurrentId: staleId,
    });

    // 第二个标签页还拿着 v1 的 id 提交 —— 必须失败，
    // 否则会出现两条 revision 同时 supersede v1，「我现在的理解」将无法回答
    await expect(
      reviseInterpretation(core, ALICE, moment.id, {
        content: '基于过期页面的第三版',
        expectedCurrentId: staleId,
      })
    ).rejects.toThrow(InvariantViolation);

    const detail = await getMomentDetail(core, ALICE, moment.id);
    expect(detail.interpretationChain).toHaveLength(2);
    expect(detail.current?.content).toBe('第二版');
  });
});

describe('灵魂 3：发布之后，改变理解不会改写已经发出去的作品', () => {
  it('发布 v1 → 修改 Moment → 旧链接内容逐字不变', async () => {
    const { moment } = await createMoment(core, ALICE, {
      title: uniq('冻结验证'),
      firstObservation: '发布之前记下的观察。',
      now: NOW,
    });
    await reviseInterpretation(core, ALICE, moment.id, { content: '发布之前的理解。' });

    const work = await createWork(core, ALICE, { title: uniq('冻结作品') });
    await addTextBlock(core, ALICE, work.id, '开场的一段文字。');
    await addMomentToWork(core, ALICE, work.id, moment.id);

    const published = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    const slug = published.publication.slug;

    const before = await viewPublication(core, ANONYMOUS, slug);
    expect(before.status).toBe('ok');
    const frozen = JSON.stringify(before.status === 'ok' ? before.page.version.snapshot : null);

    // ── 现在把实时内容改得面目全非 ──
    const detail = await getMomentDetail(core, ALICE, moment.id);
    await reviseInterpretation(core, ALICE, moment.id, {
      content: '发布之后我的想法完全变了。',
      expectedCurrentId: detail.current?.id,
    });
    await addObservation(core, ALICE, moment.id, { content: '发布之后补记的观察。' });
    await addTextBlock(core, ALICE, work.id, '发布之后加的一段。');

    // ── 旧链接必须一个字节都没变 ──
    const after = await viewPublication(core, ANONYMOUS, slug);
    expect(after.status).toBe('ok');
    expect(JSON.stringify(after.status === 'ok' ? after.page.version.snapshot : null)).toBe(frozen);

    // 具体点名：访客看到的仍然是发布时的那句理解
    const snap = after.status === 'ok' ? after.page.version.snapshot : null;
    const block = snap!.blocks.find((b) => b.type === 'moment_ref');
    expect(block?.type === 'moment_ref' ? block.moment?.interpretation?.content : null).toBe(
      '发布之前的理解。'
    );
    expect(snap!.blocks).toHaveLength(2); // 发布后加的第三段不在快照里
  });

  it('再次发布 → 同一个链接，新版本；旧版本仍在历史里', async () => {
    const { moment } = await createMoment(core, ALICE, {
      firstObservation: '初次观察。',
      now: NOW,
    });
    await reviseInterpretation(core, ALICE, moment.id, { content: '初次理解。' });

    const work = await createWork(core, ALICE, { title: uniq('重新发布') });
    await addMomentToWork(core, ALICE, work.id, moment.id);

    const first = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    expect(first.firstPublish).toBe(true);
    expect(first.version.versionNumber).toBe(1);

    const detail = await getMomentDetail(core, ALICE, moment.id);
    await reviseInterpretation(core, ALICE, moment.id, {
      content: '修订后的理解。',
      expectedCurrentId: detail.current?.id,
    });

    const second = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    expect(second.firstPublish).toBe(false);
    expect(second.version.versionNumber).toBe(2);
    // 链接必须不变 —— 已经分享出去的 URL 不能因为作者改了错别字就失效
    expect(second.publication.slug).toBe(first.publication.slug);
    expect(second.publication.id).toBe(first.publication.id);

    const view = await viewPublication(core, ANONYMOUS, first.publication.slug);
    const snap = view.status === 'ok' ? view.page.version.snapshot : null;
    const block = snap!.blocks.find((b) => b.type === 'moment_ref');
    expect(block?.type === 'moment_ref' ? block.moment?.interpretation?.content : null).toBe(
      '修订后的理解。'
    );

    // 第 1 版没有被覆盖，它仍然在版本历史里
    const versions = await core.publications.listVersions(ALICE, work.id, 'narrative');
    expect(versions.map((v) => v.versionNumber)).toEqual([2, 1]);
  });

  it('撤回保留记录：访客看到「已下架」，不是 404', async () => {
    const work = await createWork(core, ALICE, { title: uniq('撤回验证') });
    await addTextBlock(core, ALICE, work.id, '一段文字。');
    const pub = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });

    await withdrawPublication(core, ALICE, pub.publication.id);

    const view = await viewPublication(core, ANONYMOUS, pub.publication.slug);
    expect(view.status).toBe('withdrawn');

    // 记录还在，withdrawn_at 有值 —— 不能分不清「作者下架了」和「从来不存在」
    const [row] = await sql<{ withdrawn_at: Date | null }>(
      'SELECT withdrawn_at FROM publications WHERE id = $1',
      [pub.publication.id]
    );
    expect(row?.withdrawn_at).toBeTruthy();
  });
});

describe('灵魂 4：用户之间互不可见', () => {
  it('Alice 不能把 Bob 的 Moment 引进自己的作品', async () => {
    const bobMoment = await createMoment(core, BOB, {
      firstObservation: 'Bob 的私人记录。',
      now: NOW,
    });
    const aliceWork = await createWork(core, ALICE, { title: uniq('越权尝试') });

    // 用**真实存在**的 id 测试 —— 用一个随机 UUID 只能证明「找不到不存在的东西」
    await expect(
      addMomentToWork(core, ALICE, aliceWork.id, bobMoment.moment.id)
    ).rejects.toThrow(NotFoundError);

    // 返回的必须是 NotFound 而不是 Forbidden：区分两者会泄露「这个 id 存在」
    const err = await addMomentToWork(core, ALICE, aliceWork.id, bobMoment.moment.id).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.code).toBe('NOT_FOUND');

    // 确认真的没写进去
    const blocks = await core.works.listBlocks(ALICE, aliceWork.id);
    expect(blocks).toHaveLength(0);
  });

  it('绕过用例层直接写 SQL 也会被数据库拦下（W-2 兜底触发器）', async () => {
    const bobMoment = await createMoment(core, BOB, { firstObservation: 'x', now: NOW });
    const aliceWork = await createWork(core, ALICE, { title: uniq('绕过用例层') });

    // 未来某个批量导入脚本、某个修 bug 时加的新入口，都不会经过 addMomentToWork。
    // 所以这条不变量必须在数据库里也成立。
    await expect(
      sql(
        `INSERT INTO work_blocks (work_id, position, type, moment_id) VALUES ($1, 0, 'moment_ref', $2)`,
        [aliceWork.id, bobMoment.moment.id]
      )
    ).rejects.toThrow(/W-2/);
  });

  it('Alice 不能把自己的 Moment 归到 Bob 的 Journey 里', async () => {
    const bobJourney = await createJourney(core, BOB, {
      title: uniq('Bob 的旅程'),
      type: 'trip',
      startedAt: NOW,
    });
    await expect(
      createMoment(core, ALICE, { journeyId: bobJourney.id, now: NOW })
    ).rejects.toThrow(NotFoundError);
  });

  it('匿名访客看不到 private 的发布，且与「不存在」无法区分', async () => {
    const work = await createWork(core, ALICE, { title: uniq('私有发布') });
    await addTextBlock(core, ALICE, work.id, '只给我自己看。');
    const pub = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      visibility: 'private',
      now: NOW,
    });

    const anon = await viewPublication(core, ANONYMOUS, pub.publication.slug);
    const nonexistent = await viewPublication(core, ANONYMOUS, 'slug-that-never-existed');
    expect(anon.status).toBe('not_found');
    expect(nonexistent.status).toBe('not_found');
    expect(anon).toEqual(nonexistent);

    // 作者自己能看
    const owner = await viewPublication(core, ALICE, pub.publication.slug);
    expect(owner.status).toBe('ok');
  });
});

describe('灵魂 5：删除的语义 —— 整理容器不等于销毁内容', () => {
  it('删 Journey → Moment 保留，变成未归类', async () => {
    const journey = await createJourney(core, ALICE, {
      title: uniq('待删除旅程'),
      type: 'outing',
      startedAt: NOW,
    });
    const { moment } = await createMoment(core, ALICE, {
      journeyId: journey.id,
      firstObservation: '这条记录不该跟着容器一起消失。',
      now: NOW,
    });

    await deleteJourney(core, ALICE, journey.id);

    const after = await getMomentDetail(core, ALICE, moment.id);
    expect(after.moment.id).toBe(moment.id);
    expect(after.moment.journeyId).toBeUndefined();
    expect(after.observations[0]!.content).toContain('不该跟着容器');

    const unfiled = await listMoments(core, ALICE, { journeyId: null });
    expect(unfiled.map((m) => m.id)).toContain(moment.id);
  });

  it('删 Work → 已发布的链接仍然打得开', async () => {
    const { moment } = await createMoment(core, ALICE, {
      firstObservation: '发布过的内容。',
      now: NOW,
    });
    const work = await createWork(core, ALICE, { title: uniq('待删除作品') });
    await addMomentToWork(core, ALICE, work.id, moment.id);
    const pub = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });

    await deleteWork(core, ALICE, work.id);

    // 作者整理草稿箱，不该让三个月前分享出去的链接变成 404
    const view = await viewPublication(core, ANONYMOUS, pub.publication.slug);
    expect(view.status).toBe('ok');
    const page = view.status === 'ok' ? view.page : null;
    expect(page!.version.snapshot.blocks).toHaveLength(1);
    // work_id 已置空，但快照仍然完整
    expect(page!.version.workId).toBeUndefined();

    // 草稿确实没了
    expect(await core.works.findById(ALICE, work.id)).toBeNull();
  });

  it('删 Moment → 引用它的作品段落变成墓碑，不出现空洞', async () => {
    const { moment } = await createMoment(core, ALICE, {
      title: uniq('会被删的 Moment'),
      firstObservation: '删除前的观察内容。',
      now: NOW,
    });
    await reviseInterpretation(core, ALICE, moment.id, { content: '删除前的理解。' });

    const work = await createWork(core, ALICE, { title: uniq('含墓碑的作品') });
    await addMomentToWork(core, ALICE, work.id, moment.id);

    // 如果不先写墓碑，chk_block_shape 会让这一步直接失败。
    // 这条测试同时在验证「删除路径记得处理引用」。
    const { tombstonedBlocks } = await deleteMoment(core, ALICE, moment.id, NOW);
    expect(tombstonedBlocks).toBe(1);

    const blocks = await core.works.listBlocks(ALICE, work.id);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.momentId).toBeUndefined();
    expect(blocks[0]!.tombstone?.observations).toEqual(['删除前的观察内容。']);
    expect(blocks[0]!.tombstone?.interpretation).toBe('删除前的理解。');

    // 带墓碑的作品照样能发布，快照里是墓碑而不是空洞
    const pub = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
    const block = pub.version.snapshot.blocks[0]!;
    expect(block.type).toBe('moment_ref');
    expect(block.type === 'moment_ref' ? block.tombstone?.observations : null).toEqual([
      '删除前的观察内容。',
    ]);
  });
});
