/**
 * Phase 2D-1 灵魂测试 —— 账号生命周期
 *
 * 这一轮要守住的那句话是：
 *
 *   用户能够信任这个系统保管他的东西 ——
 *   包括**信任它会在被要求时真的还回来、真的删掉**。
 *
 * 所以这里的每一条都不是「功能有没有实现」，而是「承诺有没有兑现」：
 *
 *   说了「退出登录不动内容」    →  退出前后逐行比对内容表
 *   说了「停用只是不可访问」    →  停用后直接查库确认数据一行没少
 *   说了「立即下架」            →  申请删除后同一秒访问公开链接
 *   说了「30 天内可撤销」       →  撤销后内容和发布页完全恢复
 *   说了「30 天之内不能删」     →  差 1 毫秒也必须拒绝
 *   说了「删了就是删了」        →  原图、发布页、数据库行、磁盘字节全查一遍
 *
 * ## 时间是注入的，不是等出来的
 *
 * 30 天的等待期用 advanceableClock 推进 —— 和生产走**完全相同**的代码路径，
 * 只是时钟不同。没有「测试专用分支」，也没有改系统时间。
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import sharp from 'sharp';
import {
  addMomentToWork,
  advanceableClock,
  attachAssetToMoment,
  cancelAccountDeletion,
  createMoment,
  createWork,
  DAY_MS,
  disableAccount,
  finalizeAccountDeletion,
  listAccountEvents,
  publishWork,
  reactivateAccount,
  requestAccountDeletion,
  reviseInterpretation,
  runDueDeletions,
  systemClock,
  uploadAsset,
  viewPublication,
  type AccountDeps,
  type AssetDeps,
  type FinalizeDeps,
  type PublishDeps,
} from '@tc/application';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import {
  ANONYMOUS,
  DELETION_GRACE_DAYS,
  ForbiddenError,
  InvariantViolation,
  NotFoundError,
  systemActor,
  userActor,
  type Actor,
} from '@tc/domain';
import { getPool, sql } from '../db/setup';
import { getImageDeriver, getMediaProbe, getObjectStorage, getStorageKit } from '@/lib/core/storage';
import { tokenIssuer } from '@/lib/core/tokens';

const NOW = '2026-08-03T00:00:00.000Z';
const T0 = new Date(NOW);

let core: PostgresUnitOfWork;
let assetDeps: AssetDeps;
let publishDeps: PublishDeps;

const OPS: Actor = systemActor('集成测试：模拟运维操作');

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

/**
 * 每条测试用自己的一次性账号。
 *
 * 不能用 seed 里的 Alice —— 这个文件里有真的会把账号删干净的测试，
 * 删掉 Alice 之后同一个 worker 里后面的测试文件全部崩掉，
 * 而且失败原因会指向完全无关的地方。
 */
async function makeUser(tag: string): Promise<{ actor: Actor; userId: string; email: string }> {
  const userId = crypto.randomUUID();
  const email = `${uniq(tag)}@dev.local`;
  await sql(
    `INSERT INTO "user" (id, name, email, email_verified, require_password_change, created_at, updated_at)
     VALUES ($1, $2, $3, true, false, now(), now())`,
    [userId, tag, email]
  );
  return { actor: userActor(userId, `sess-${tag}`), userId, email };
}

/** 造一条 session 行，用来验证「停用会撤销登录状态」 */
async function makeSession(userId: string): Promise<string> {
  const token = uniq('token');
  await sql(
    `INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, now() + interval '7 days', now(), now())`,
    [userId, token]
  );
  return token;
}

async function makeJpeg(r: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

/** 一个完整的用户：一个 Moment、一张素材、一个已发布的 Work */
async function seedContent(actor: Actor, title: string) {
  const { moment } = await createMoment(core, actor, {
    title: '那天下午',
    placeLabel: '秩父',
    occurredAt: NOW,
    firstObservation: '风很大，鸟居下面没有人。',
    now: NOW,
  });
  await reviseInterpretation(core, actor, moment.id, { content: '我当时以为那是终点。' });

  const { asset } = await uploadAsset(assetDeps, actor, {
    bytes: await makeJpeg(seq % 200),
    declaredMimeType: 'image/jpeg',
  });
  await attachAssetToMoment(core, actor, moment.id, asset.id, { role: 'supporting' });

  const work = await createWork(core, actor, { title: uniq(title) });
  await addMomentToWork(core, actor, work.id, moment.id);
  const published = await publishWork(publishDeps, actor, { workId: work.id, now: NOW });

  return { moment, asset, work, slug: published.publication.slug };
}

/** 事实性快照：这个用户在数据库里还剩多少东西 */
async function contentCounts(userId: string) {
  const one = async (table: string) => {
    const rows = await sql<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE user_id = $1`,
      [userId]
    );
    return Number(rows[0]!.n);
  };
  return {
    moments: await one('moments'),
    observations: await one('observations'),
    interpretations: await one('interpretation_revisions'),
    assets: await one('assets'),
    works: await one('works'),
    versions: await one('work_versions'),
    publications: await one('publications'),
    publishedAssets: await one('published_assets'),
  };
}

beforeAll(() => {
  core = new PostgresUnitOfWork(getPool() as unknown as Pool);
  assetDeps = { core, storage: getStorageKit(), probe: getMediaProbe() };
  publishDeps = { core, storage: getStorageKit(), deriver: getImageDeriver() };
});

// ════════════════════════════════════════════════════════════════════════════

describe('灵魂 1：退出登录什么都不该改', () => {
  it('删掉全部 session 之后，内容表逐行不变', async () => {
    const { actor, userId } = await makeUser('logout');
    await seedContent(actor, '退出登录不该动内容');
    await makeSession(userId);

    const before = await sql<{ id: string; updated_at: string }>(
      `SELECT id, updated_at::text FROM moments WHERE user_id = $1 ORDER BY id`,
      [userId]
    );
    const countsBefore = await contentCounts(userId);

    // 「退出登录」在这个系统里就是删 session 行 —— 它不该走账号状态机
    await sql('DELETE FROM session WHERE user_id = $1', [userId]);

    const after = await sql<{ id: string; updated_at: string }>(
      `SELECT id, updated_at::text FROM moments WHERE user_id = $1 ORDER BY id`,
      [userId]
    );
    expect(after).toEqual(before);
    expect(await contentCounts(userId)).toEqual(countsBefore);

    // 账号状态也不该被碰过 —— 一次登出不是一次状态变更
    const status = await core.accounts.findStatus(OPS, userId);
    expect(status).toBe('active');
    expect(await listAccountEvents(core, OPS, userId)).toHaveLength(0);
  });
});

describe('灵魂 2：停用是「看不见」，不是「没有了」', () => {
  it('停用之后数据一行没少，但公开页面立刻打不开', async () => {
    const { actor, userId } = await makeUser('disabled');
    const { slug } = await seedContent(actor, '停用之后');
    await makeSession(userId);

    const countsBefore = await contentCounts(userId);
    expect((await viewPublication(core, ANONYMOUS, slug)).status).toBe('ok');

    const result = await disableAccount(
      { core, clock: systemClock, tokens: tokenIssuer },
      OPS,
      userId,
      '集成测试：违规内容待核实'
    );

    // ① 数据全在
    expect(await contentCounts(userId)).toEqual(countsBefore);
    expect(countsBefore.moments).toBeGreaterThan(0);

    // ② 公开页面没了 —— 而且是 not_found，不是 withdrawn。
    //    「已下架」会告诉访客「这里曾经有东西，作者收起来了」，
    //    而账号被停用是作者和平台之间的事。
    expect((await viewPublication(core, ANONYMOUS, slug)).status).toBe('not_found');

    // ③ 连本人也看不到自己的发布页 —— 停用状态下他根本拿不到 user actor，
    //    这里直接用 actor 调用是在验证「即使绕过认证层也没有例外」
    expect((await viewPublication(core, actor, slug)).status).toBe('not_found');

    // ④ session 被撤销
    expect(result.revokedSessions).toBe(1);
    expect(await sql('SELECT 1 FROM session WHERE user_id = $1', [userId])).toHaveLength(0);

    // ⑤ 审计写下了谁、何时、为什么
    const events = await listAccountEvents(core, OPS, userId);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('disabled');
    expect(events[0]!.actorType).toBe('system');
    expect(events[0]!.reason).toContain('违规内容待核实');
  });

  it('恢复之后公开页面原样回来', async () => {
    const { actor, userId } = await makeUser('reactivate');
    const { slug } = await seedContent(actor, '恢复之后');

    const deps: AccountDeps = { core, clock: systemClock, tokens: tokenIssuer };
    await disableAccount(deps, OPS, userId, '集成测试');
    expect((await viewPublication(core, ANONYMOUS, slug)).status).toBe('not_found');

    await reactivateAccount(deps, OPS, userId, '集成测试：核实无误');

    const view = await viewPublication(core, ANONYMOUS, slug);
    expect(view.status).toBe('ok');
    // 恢复不是「重新发布」—— 快照里的每个字都还是当初那一份
    expect(view.status === 'ok' && view.page.version.snapshot.blocks.length).toBeGreaterThan(0);
  });

  it('停用不是产品功能：普通用户自己调不动', async () => {
    const { actor, userId } = await makeUser('selfdisable');
    const deps: AccountDeps = { core, clock: systemClock, tokens: tokenIssuer };
    await expect(disableAccount(deps, actor, userId, '我自己来')).rejects.toThrow(ForbiddenError);
  });
});

describe('灵魂 3：申请删除当下就生效', () => {
  it('申请删除的同一刻公开链接就打不开，session 也全没了', async () => {
    const { actor, userId } = await makeUser('request');
    const { slug } = await seedContent(actor, '申请删除');
    await makeSession(userId);
    await makeSession(userId);

    const clock = advanceableClock(T0);
    const deps: AccountDeps = { core, clock, tokens: tokenIssuer };

    expect((await viewPublication(core, ANONYMOUS, slug)).status).toBe('ok');

    const request = await requestAccountDeletion(deps, actor, { reason: '不想用了' });

    // 立刻下架 —— 时钟一毫秒都没有推进
    expect((await viewPublication(core, ANONYMOUS, slug)).status).toBe('not_found');
    expect(request.revokedSessions).toBe(2);
    expect(await sql('SELECT 1 FROM session WHERE user_id = $1', [userId])).toHaveLength(0);

    // 等待期正好 30 天
    expect(request.effectiveAt.getTime() - T0.getTime()).toBe(DELETION_GRACE_DAYS * DAY_MS);

    // 内容一行没删 —— 等待期里数据是完整的
    const counts = await contentCounts(userId);
    expect(counts.moments).toBe(1);
    expect(counts.assets).toBe(1);
    expect(counts.publications).toBe(1);

    // 审计里**不能**出现令牌（明文或哈希都不行）
    const events = await listAccountEvents(core, OPS, userId);
    const dump = JSON.stringify(events);
    expect(dump).not.toContain(request.cancelToken);
    expect(dump).not.toContain(tokenIssuer.hash(request.cancelToken));
  });

  it('库里存的是哈希，不是令牌本身', async () => {
    const { actor, userId } = await makeUser('tokenhash');
    const clock = advanceableClock(T0);
    const request = await requestAccountDeletion(
      { core, clock, tokens: tokenIssuer },
      actor,
      {}
    );

    const rows = await sql<{ h: string }>(
      'SELECT deletion_cancel_token_hash AS h FROM "user" WHERE id = $1',
      [userId]
    );
    expect(rows[0]!.h).toBe(tokenIssuer.hash(request.cancelToken));
    expect(rows[0]!.h).not.toBe(request.cancelToken);
  });

  it('重复申请不会把冷静期悄悄重置', async () => {
    const { actor } = await makeUser('doublerequest');
    const clock = advanceableClock(T0);
    const deps: AccountDeps = { core, clock, tokens: tokenIssuer };

    await requestAccountDeletion(deps, actor, {});
    clock.advance(5 * DAY_MS);

    // 已经是 deletion_requested 了 —— 状态机不允许原地再来一次。
    // 允许的话，一个自动重试的客户端能把 30 天变成无限期。
    await expect(requestAccountDeletion(deps, actor, {})).rejects.toThrow(InvariantViolation);
  });
});

describe('灵魂 4：30 天内撤销要能完全恢复', () => {
  it('第 29 天撤销 —— 内容、发布页、状态全部回到原样', async () => {
    const { actor, userId } = await makeUser('cancel');
    const { slug } = await seedContent(actor, '撤销删除');

    const countsBefore = await contentCounts(userId);
    const viewBefore = await viewPublication(core, ANONYMOUS, slug);
    expect(viewBefore.status).toBe('ok');
    const snapshotBefore =
      viewBefore.status === 'ok' ? JSON.stringify(viewBefore.page.version.snapshot) : '';

    const clock = advanceableClock(T0);
    const deps: AccountDeps = { core, clock, tokens: tokenIssuer };
    const request = await requestAccountDeletion(deps, actor, {});
    expect((await viewPublication(core, ANONYMOUS, slug)).status).toBe('not_found');

    // 29 天后回心转意
    clock.advance(29 * DAY_MS);
    const restored = await cancelAccountDeletion(deps, ANONYMOUS, request.cancelToken);

    expect(restored.status).toBe('active');
    expect(restored.deletion).toBeUndefined();
    expect(await contentCounts(userId)).toEqual(countsBefore);

    const viewAfter = await viewPublication(core, ANONYMOUS, slug);
    expect(viewAfter.status).toBe('ok');
    // 逐字节相同 —— 撤销之后读者看到的是同一篇文章，不是重建的近似品
    expect(viewAfter.status === 'ok' && JSON.stringify(viewAfter.page.version.snapshot)).toBe(
      snapshotBefore
    );

    // 删除相关的字段必须一起清空，否则定时任务还会在 30 天后来收它
    const rows = await sql<{ a: string | null; b: string | null; c: string | null }>(
      `SELECT deletion_requested_at::text AS a, deletion_effective_at::text AS b,
              deletion_cancel_token_hash AS c FROM "user" WHERE id = $1`,
      [userId]
    );
    expect(rows[0]).toEqual({ a: null, b: null, c: null });
  });

  it('令牌只能撤销它自己那个账号', async () => {
    const alice = await makeUser('tokenowner');
    const bob = await makeUser('tokenother');
    const clock = advanceableClock(T0);
    const deps: AccountDeps = { core, clock, tokens: tokenIssuer };

    const aliceRequest = await requestAccountDeletion(deps, alice.actor, {});
    await requestAccountDeletion(deps, bob.actor, {});

    await cancelAccountDeletion(deps, ANONYMOUS, aliceRequest.cancelToken);

    expect(await core.accounts.findStatus(OPS, alice.userId)).toBe('active');
    // Bob 完全没被影响
    expect(await core.accounts.findStatus(OPS, bob.userId)).toBe('deletion_requested');
  });

  it('错误的令牌只会得到「找不到」，不会泄露账号是否存在', async () => {
    const clock = advanceableClock(T0);
    const deps: AccountDeps = { core, clock, tokens: tokenIssuer };
    await expect(cancelAccountDeletion(deps, ANONYMOUS, 'not-a-real-token')).rejects.toThrow(
      NotFoundError
    );
  });

  it('用过一次的令牌不能再用第二次', async () => {
    const { actor } = await makeUser('reuse');
    const clock = advanceableClock(T0);
    const deps: AccountDeps = { core, clock, tokens: tokenIssuer };

    const request = await requestAccountDeletion(deps, actor, {});
    await cancelAccountDeletion(deps, ANONYMOUS, request.cancelToken);

    // 撤销时哈希被清空了，所以同一串东西再也查不到任何账号
    await expect(cancelAccountDeletion(deps, ANONYMOUS, request.cancelToken)).rejects.toThrow(
      NotFoundError
    );
  });

  it('过了 30 天就不能再撤销 —— 否则「30 天」没有终点', async () => {
    const { actor } = await makeUser('toolate');
    const clock = advanceableClock(T0);
    const deps: AccountDeps = { core, clock, tokens: tokenIssuer };

    const request = await requestAccountDeletion(deps, actor, {});
    clock.advance(DELETION_GRACE_DAYS * DAY_MS);

    await expect(cancelAccountDeletion(deps, ANONYMOUS, request.cancelToken)).rejects.toThrow(
      NotFoundError
    );
  });
});

describe('灵魂 5：冷静期是硬的', () => {
  it('差 1 毫秒都不能执行永久删除', async () => {
    const { actor, userId } = await makeUser('early');
    const clock = advanceableClock(T0);
    const deps: FinalizeDeps = {
      core,
      clock,
      tokens: tokenIssuer,
      storage: getObjectStorage(),
    };

    await requestAccountDeletion(deps, actor, {});
    clock.advance(DELETION_GRACE_DAYS * DAY_MS - 1);

    await expect(finalizeAccountDeletion(deps, OPS, userId)).rejects.toThrow(InvariantViolation);
    // 账号必须完好 —— 拒绝之后不能留下一个删了一半的状态
    expect(await core.accounts.findStatus(OPS, userId)).toBe('deletion_requested');
  });

  it('没有申请过删除的账号，永远不会被定时任务扫到', async () => {
    const { userId } = await makeUser('never');
    const clock = advanceableClock(new Date(T0.getTime() + 3650 * DAY_MS));
    const due = await core.accounts.listDueForDeletion(OPS, clock.now());
    expect(due.map((a) => a.userId)).not.toContain(userId);
  });

  it('active 账号直接调永久删除也会被拒绝', async () => {
    const { userId } = await makeUser('activefinalize');
    const deps: FinalizeDeps = {
      core,
      clock: advanceableClock(T0),
      tokens: tokenIssuer,
      storage: getObjectStorage(),
    };
    await expect(finalizeAccountDeletion(deps, OPS, userId)).rejects.toThrow(/deletion_requested/);
  });

  it('永久删除不是产品功能：普通用户调不动', async () => {
    const { actor, userId } = await makeUser('selffinalize');
    const deps: FinalizeDeps = {
      core,
      clock: advanceableClock(T0),
      tokens: tokenIssuer,
      storage: getObjectStorage(),
    };
    await expect(finalizeAccountDeletion(deps, actor, userId)).rejects.toThrow(ForbiddenError);
  });
});

describe('灵魂 6：删了就是删了', () => {
  it('30 天后执行永久删除 —— 数据库、发布页、磁盘字节全部消失', async () => {
    const { actor, userId } = await makeUser('finalize');
    const { slug, asset } = await seedContent(actor, '永久删除');

    const storage = getObjectStorage();
    // 先确认字节确实存在，否则「删掉了」这条断言是空的
    expect(await storage.exists(asset.objectKey)).toBe(true);
    const derivedKeys = (
      await sql<{ object_key: string }>(
        'SELECT object_key FROM published_assets WHERE user_id = $1',
        [userId]
      )
    ).map((r) => r.object_key);
    expect(derivedKeys.length).toBeGreaterThan(0);
    for (const key of derivedKeys) expect(await storage.exists(key)).toBe(true);

    const clock = advanceableClock(T0);
    const deps: FinalizeDeps = { core, clock, tokens: tokenIssuer, storage };

    await requestAccountDeletion(deps, actor, {});
    clock.advance(DELETION_GRACE_DAYS * DAY_MS);

    const result = await finalizeAccountDeletion(deps, OPS, userId);

    // ① 数据库里什么都不剩
    expect(await sql('SELECT 1 FROM "user" WHERE id = $1', [userId])).toHaveLength(0);
    expect(await contentCounts(userId)).toEqual({
      moments: 0,
      observations: 0,
      interpretations: 0,
      assets: 0,
      works: 0,
      versions: 0,
      publications: 0,
      publishedAssets: 0,
    });

    // ② 公开链接打不开
    expect((await viewPublication(core, ANONYMOUS, slug)).status).toBe('not_found');

    // ③ 磁盘上的字节也没了 —— 原图和发布派生副本都要查
    expect(result.failedObjects).toEqual([]);
    expect(await storage.exists(asset.objectKey)).toBe(false);
    for (const key of derivedKeys) expect(await storage.exists(key)).toBe(false);

    // ④ 审计活了下来。这是当初不给 account_events 加外键的全部理由 ——
    //    「删除确实发生过」这条记录不能跟着被删的人一起消失。
    const events = await listAccountEvents(core, OPS, userId);
    const finalized = events.find((e) => e.type === 'deletion_finalized');
    expect(finalized).toBeDefined();
    expect(finalized!.toStatus).toBe('deleted');
    expect(finalized!.reason).toContain('集成测试');
  });

  it('定时任务只删到期的那些人', async () => {
    const early = await makeUser('due-yes');
    const late = await makeUser('due-no');

    const clock = advanceableClock(T0);
    const deps: FinalizeDeps = {
      core,
      clock,
      tokens: tokenIssuer,
      storage: getObjectStorage(),
    };

    await requestAccountDeletion(deps, early.actor, {});
    clock.advance(10 * DAY_MS);
    await requestAccountDeletion(deps, late.actor, {});

    // 从第一个人申请起算 30 天：他到期了，晚 10 天申请的那个还没有
    clock.advance(20 * DAY_MS);

    const { results, errors } = await runDueDeletions(deps, OPS, 50);

    // 这里**故意**不把断言限定在本条测试造的两个账号上。
    // 前面几条测试留下的 deletion_requested 账号此刻也到期了，
    // 它们会一起被这一批扫到 —— 于是这条断言顺便回答了一个更重要的问题：
    // 「定时任务会不会被某一个账号卡住」。
    // （它已经抓到过一次：有作品的账号会因为 chk_block_shape 删不掉。）
    expect(errors).toEqual([]);
    const deleted = results.map((r) => r.userId);
    expect(deleted).toContain(early.userId);
    expect(deleted).not.toContain(late.userId);

    expect(await sql('SELECT 1 FROM "user" WHERE id = $1', [early.userId])).toHaveLength(0);
    expect(await core.accounts.findStatus(OPS, late.userId)).toBe('deletion_requested');
  });

  it('已删除账号的 userId 查不到状态 —— 调用方据此拒绝一切访问', async () => {
    const { actor, userId } = await makeUser('gone');
    const clock = advanceableClock(T0);
    const deps: FinalizeDeps = {
      core,
      clock,
      tokens: tokenIssuer,
      storage: getObjectStorage(),
    };
    await requestAccountDeletion(deps, actor, {});
    clock.advance(DELETION_GRACE_DAYS * DAY_MS);
    await finalizeAccountDeletion(deps, OPS, userId);

    expect(await core.accounts.findStatus(OPS, userId)).toBeNull();
  });
});

describe('灵魂 7：ADR-005 的「删 Work 保留 Publication」在删账号时被覆盖', () => {
  it('删账号会把 Publication 一起删掉，而不是留在网上', async () => {
    const { actor, userId } = await makeUser('override');
    const { slug } = await seedContent(actor, '覆盖规则');

    // 前置：确认它现在确实是一个可访问的公开页面
    expect((await viewPublication(core, ANONYMOUS, slug)).status).toBe('ok');

    const clock = advanceableClock(T0);
    const deps: FinalizeDeps = {
      core,
      clock,
      tokens: tokenIssuer,
      storage: getObjectStorage(),
    };
    await requestAccountDeletion(deps, actor, {});
    clock.advance(DELETION_GRACE_DAYS * DAY_MS);
    await finalizeAccountDeletion(deps, OPS, userId);

    // ADR-005 说删 Work 时 Publication 可以保留 —— 那条只适用于作者整理草稿。
    // 用户要求「我要消失」时，公开作品继续挂在网上与删除预期直接冲突。
    const rows = await sql('SELECT 1 FROM publications WHERE slug = $1', [slug]);
    expect(rows).toHaveLength(0);
  });
});
