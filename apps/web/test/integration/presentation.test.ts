/**
 * Phase 2C 灵魂测试 —— 一份内容，多种表现
 *
 * 要证明的那句话是：
 *
 *   同一份 Work 内容可以形成多种作品表现，
 *   **而不会重新产生多份内容真相**。
 *
 * 所以这一组里最重要的不是「两个页面长得不一样」，
 * 而是「改表现的时候，一行内容都没有被写过」。
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  addMomentToWork,
  addTextBlock,
  createMoment,
  createWork,
  deletePresentation,
  getWorkDetail,
  publishWork,
  reviseInterpretation,
  savePresentation,
  viewPublication,
  type PublishDeps,
} from '@tc/application';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import {
  ANONYMOUS,
  assertRendererAvailable,
  DEFAULT_GALLERY_CONFIG,
  DEFAULT_NARRATIVE_CONFIG,
  InvariantViolation,
  normalizeSnapshot,
  NotFoundError,
  parsePresentationConfig,
  RENDERER_VERSIONS,
  userActor,
  type WorkSnapshot,
} from '@tc/domain';
import { getPool, sql } from '../db/setup';
import { getAudioDeriver, getImageDeriver, getStorageKit } from '@/lib/core/storage';

const ALICE = userActor('11111111-1111-1111-1111-111111111111', 'sess-alice');
const BOB = userActor('22222222-2222-2222-2222-222222222222', 'sess-bob');
const NOW = '2026-08-03T00:00:00.000Z';

let core: PostgresUnitOfWork;
let publishDeps: PublishDeps;

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

beforeAll(() => {
  core = new PostgresUnitOfWork(getPool() as unknown as Pool);
  publishDeps = { core, storage: getStorageKit(), deriver: getImageDeriver(), audioDeriver: getAudioDeriver() };
});

/**
 * 用户在验收场景里给的那个 Work：
 *
 *   TextBlock      前言
 *   MomentRefBlock 秩父支路
 *   MomentRefBlock 商业主街
 *   TextBlock      结论
 */
async function buildWork(title: string) {
  const a = await createMoment(core, ALICE, {
    title: '秩父支路',
    firstObservation: '住家门口没有招牌。',
    now: NOW,
  });
  await reviseInterpretation(core, ALICE, a.moment.id, { content: '这里的人还打算住下去。' });

  const b = await createMoment(core, ALICE, {
    title: '商业主街',
    firstObservation: '每一块招牌都在互相盖过对方。',
    now: NOW,
  });

  const work = await createWork(core, ALICE, { title });
  await addTextBlock(core, ALICE, work.id, '前言');
  await addMomentToWork(core, ALICE, work.id, a.moment.id);
  await addMomentToWork(core, ALICE, work.id, b.moment.id);
  await addTextBlock(core, ALICE, work.id, '结论');
  return { work, momentA: a.moment, momentB: b.moment };
}

/** 快照的**语义内容** —— 不含任何表现信息。两种表现的这一部分必须完全相同。 */
function semanticContent(snapshot: WorkSnapshot) {
  return snapshot.blocks.map((b) =>
    b.type === 'text'
      ? { type: b.type, position: b.position, text: b.text }
      : {
          type: b.type,
          position: b.position,
          momentId: b.momentId,
          title: b.moment?.title,
          observations: b.moment?.observations.map((o) => o.content),
          interpretation: b.moment?.interpretation?.content,
        }
  );
}

// ════════════════════════════════════════════════════════════════════════════

describe('灵魂 1：两种表现，同一份内容', () => {
  it('narrative 和 gallery 的语义内容逐字节相同，只有 presentation 不同', async () => {
    const { work } = await buildWork(uniq('保存与活着'));

    const narrative = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'narrative',
      now: NOW,
    });
    const gallery = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'gallery',
      now: NOW,
    });

    // 内容来源完全相同：block 数量、顺序、Moment 引用、观察、理解
    expect(semanticContent(narrative.version.snapshot)).toEqual(
      semanticContent(gallery.version.snapshot)
    );
    expect(narrative.version.snapshot.blocks).toHaveLength(4);

    // 不同的只有表现
    expect(narrative.version.snapshot.presentation.rendererType).toBe('narrative');
    expect(gallery.version.snapshot.presentation.rendererType).toBe('gallery');

    // 两个独立的 slug
    expect(gallery.publication.slug).not.toBe(narrative.publication.slug);
    expect(gallery.publication.slug).toContain('-gallery');
    expect(gallery.publication.id).not.toBe(narrative.publication.id);

    // 两条独立的版本线，各自从 1 开始
    expect(narrative.version.versionNumber).toBe(1);
    expect(gallery.version.versionNumber).toBe(1);
  });

  it('改表现方式时，一行 work_blocks 都没有被写过', async () => {
    const { work } = await buildWork(uniq('内容不被表现改动'));

    const before = await sql<{ id: string; updated_at: Date }>(
      'SELECT id, updated_at FROM work_blocks WHERE work_id = $1 ORDER BY position',
      [work.id]
    );

    await savePresentation(core, ALICE, work.id, 'narrative', {
      ...DEFAULT_NARRATIVE_CONFIG,
      theme: 'paper',
      contentWidth: 'wide',
    });
    await savePresentation(core, ALICE, work.id, 'gallery', {
      ...DEFAULT_GALLERY_CONFIG,
      columns: 3,
    });

    const after = await sql<{ id: string; updated_at: Date }>(
      'SELECT id, updated_at FROM work_blocks WHERE work_id = $1 ORDER BY position',
      [work.id]
    );

    // 连 updated_at 都不能变 —— 变了说明有人碰了 block
    expect(after).toEqual(before);
  });

  it('改 narrative 不影响 gallery', async () => {
    const { work } = await buildWork(uniq('互不影响'));
    await savePresentation(core, ALICE, work.id, 'gallery', {
      ...DEFAULT_GALLERY_CONFIG,
      columns: 3,
      imageFit: 'contain',
    });
    await savePresentation(core, ALICE, work.id, 'narrative', {
      ...DEFAULT_NARRATIVE_CONFIG,
      theme: 'paper',
    });

    const detail = await getWorkDetail(core, ALICE, work.id);
    const gallery = detail.presentations.find((p) => p.rendererType === 'gallery');
    expect(gallery?.config).toMatchObject({ columns: 3, imageFit: 'contain' });
  });
});

describe('灵魂 2：两个 Publication 各走各的', () => {
  it('发布 narrative 不会更新 gallery 的 Publication', async () => {
    const { work, momentA } = await buildWork(uniq('独立发布'));
    const n1 = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'narrative',
      now: NOW,
    });
    const g1 = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'gallery',
      now: NOW,
    });
    const galleryFrozen = JSON.stringify(g1.version.snapshot);

    // 改内容，然后**只重新发布 narrative**
    await addTextBlock(core, ALICE, work.id, '后来补的一段');
    const detail = await getWorkDetail(core, ALICE, momentA.id).catch(() => null);
    void detail;

    const n2 = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'narrative',
      now: NOW,
    });
    expect(n2.version.versionNumber).toBe(2);
    expect(n2.publication.id).toBe(n1.publication.id); // 同一个链接

    // gallery 一点没动
    const galleryNow = await core.publications.findByWork(ALICE, work.id, 'gallery');
    expect(galleryNow!.publication.id).toBe(g1.publication.id);
    expect(galleryNow!.version.versionNumber).toBe(1);
    expect(JSON.stringify(galleryNow!.version.snapshot)).toBe(galleryFrozen);

    // narrative 有 5 段，gallery 还是 4 段 —— 两边都「有未发布的变化」这件事
    // 在这里表现为：草稿 5 段，gallery 快照 4 段
    expect(n2.version.snapshot.blocks).toHaveLength(5);
    expect(galleryNow!.version.snapshot.blocks).toHaveLength(4);
  });

  it('改了内容之后，两个 Publication 都还停在旧版本 —— 它们各自需要重新发布', async () => {
    const { work } = await buildWork(uniq('都变陈旧'));
    await publishWork(publishDeps, ALICE, { workId: work.id, rendererType: 'narrative', now: NOW });
    await publishWork(publishDeps, ALICE, { workId: work.id, rendererType: 'gallery', now: NOW });

    await addTextBlock(core, ALICE, work.id, '草稿里新加的');

    const draft = await getWorkDetail(core, ALICE, work.id);
    const n = await core.publications.findByWork(ALICE, work.id, 'narrative');
    const g = await core.publications.findByWork(ALICE, work.id, 'gallery');

    expect(draft.blocks).toHaveLength(5);
    expect(n!.version.snapshot.blocks).toHaveLength(4);
    expect(g!.version.snapshot.blocks).toHaveLength(4);
  });

  it('旧 Publication 不受 Presentation 后续修改影响', async () => {
    const { work } = await buildWork(uniq('冻结表现'));
    await savePresentation(core, ALICE, work.id, 'narrative', {
      ...DEFAULT_NARRATIVE_CONFIG,
      theme: 'clean',
    });
    const pub = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'narrative',
      now: NOW,
    });
    expect(pub.version.snapshot.presentation.config).toMatchObject({ theme: 'clean' });

    // 之后把主题改成 paper
    await savePresentation(core, ALICE, work.id, 'narrative', {
      ...DEFAULT_NARRATIVE_CONFIG,
      theme: 'paper',
    });

    // 已发布的那一版仍然是 clean —— 视觉表达也被冻住了，不只是文字
    const view = await viewPublication(core, ANONYMOUS, pub.publication.slug);
    expect(view.status).toBe('ok');
    expect(
      view.status === 'ok' ? view.page.version.snapshot.presentation.config : null
    ).toMatchObject({ theme: 'clean' });
  });

  it('删除一种表现方式，已发布的 Publication 照样打得开', async () => {
    const { work } = await buildWork(uniq('删表现'));
    const pub = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'gallery',
      now: NOW,
    });

    await deletePresentation(core, ALICE, work.id, 'gallery');

    const detail = await getWorkDetail(core, ALICE, work.id);
    expect(detail.presentations.find((p) => p.rendererType === 'gallery')).toBeUndefined();

    // 快照里已经冻了完整的 presentation，所以页面不依赖那一行
    const view = await viewPublication(core, ANONYMOUS, pub.publication.slug);
    expect(view.status).toBe('ok');
    expect(
      view.status === 'ok' ? view.page.version.snapshot.presentation.rendererType : null
    ).toBe('gallery');
  });
});

describe('灵魂 3：表现也有用户边界与版本', () => {
  it('Alice 不能改 Bob 的 Presentation', async () => {
    const bobWork = await createWork(core, BOB, { title: uniq('Bob 的作品') });
    await expect(
      savePresentation(core, ALICE, bobWork.id, 'narrative', DEFAULT_NARRATIVE_CONFIG)
    ).rejects.toThrow(NotFoundError);
    await expect(
      deletePresentation(core, ALICE, bobWork.id, 'narrative')
    ).rejects.toThrow(NotFoundError);
  });

  it('快照带着 rendererVersion，且不会被静默换成新渲染器', async () => {
    const { work } = await buildWork(uniq('版本锁定'));
    const pub = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'narrative',
      now: NOW,
    });

    const frozen = pub.version.snapshot.presentation;
    expect(frozen.rendererVersion).toBe(RENDERER_VERSIONS.narrative);
    expect(frozen.presentationSchemaVersion).toBe(1);

    // 读多少次都还是当初那个版本号
    const again = normalizeSnapshot(JSON.parse(JSON.stringify(pub.version.snapshot)));
    expect(again.presentation.rendererVersion).toBe(frozen.rendererVersion);

    // 快照声称的版本比代码新 → 明确报错，**绝不回退到最新版**。
    // 回退等于说「我们保存了你的配置，但用今天的代码渲染」。
    expect(() =>
      assertRendererAvailable({ ...frozen, rendererVersion: frozen.rendererVersion + 1 })
    ).toThrow(/PR-2/);
  });

  it('数据库拒绝 renderer_type 列与快照里的值不一致', async () => {
    const { work } = await buildWork(uniq('冗余一致性'));
    const pub = await publishWork(publishDeps, ALICE, {
      workId: work.id,
      rendererType: 'narrative',
      now: NOW,
    });
    // 冗余列的风险是两边不一致后没人知道哪个对。让数据库直接拒绝。
    await expect(
      sql(`UPDATE work_versions SET renderer_type = 'gallery' WHERE id = $1`, [pub.version.id])
    ).rejects.toThrow(/PR-3/);
  });

  it('非法的表现配置在写入处就被拒 —— 不会进数据库', async () => {
    const { work } = await buildWork(uniq('非法配置'));
    expect(() =>
      parsePresentationConfig('gallery', { columns: 5 })
    ).toThrow(InvariantViolation);

    await expect(
      savePresentation(core, ALICE, work.id, 'narrative', {
        ...DEFAULT_NARRATIVE_CONFIG,
        theme: 'neon' as never,
      })
    ).rejects.toThrow(/PR-1/);

    const rows = await sql('SELECT 1 FROM work_presentations WHERE work_id = $1', [work.id]);
    expect(rows).toHaveLength(0);
  });
});

describe('灵魂 4：Renderer 保留契约', () => {
  it('数据库里被任何 Publication 引用过的 renderer 版本，都必须还有实现', async () => {
    // 这条测试的价值在于它**扫真实数据**，不是扫代码。
    // 有人删掉 narrative@1 时，单元测试只知道「声明的版本没实现」，
    // 而这条能直接说出「已经有 N 篇发布的页面会打不开」。
    const { RENDERER_REGISTRY, rendererKey } = await import('@/components/studio/renderers');

    const rows = await sql<{ renderer_type: string; renderer_version: number; n: string }>(
      `SELECT snapshot -> 'presentation' ->> 'rendererType' AS renderer_type,
              (snapshot -> 'presentation' ->> 'rendererVersion')::int AS renderer_version,
              count(*)::text AS n
         FROM work_versions
        WHERE snapshot -> 'presentation' ->> 'rendererVersion' IS NOT NULL
        GROUP BY 1, 2`
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const key = rendererKey(row.renderer_type, row.renderer_version);
      expect(
        RENDERER_REGISTRY[key],
        `${key} 没有实现，但有 ${row.n} 个已发布版本引用它 —— 那些页面会打不开`
      ).toBeTypeOf('function');
    }
  });
});
