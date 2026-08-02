/**
 * 快照组装的单元测试
 *
 * `buildWorkSnapshot` 是纯函数 —— 给定「发布那一刻的实时数据」，产出快照。
 * 所以这里能穷举集成测试碰不到的形状：Moment 读不到、有观察没理解、
 * position 有空洞、引用的内容一半已被删除。
 *
 * 这些形状不是假想的：Moment 被删、并发编辑、数据迁移都会造出它们。
 * 而它们出问题的表现是「三个月前的链接打开是空白」——
 * 那时候没有任何日志能告诉你当初发生了什么。
 */

import { describe, expect, it } from 'vitest';
import { buildWorkSnapshot, type SnapshotSources } from '@tc/application';
import type { InterpretationRevision, Moment, Observation, Work, WorkBlock } from '@tc/domain';

const NOW = '2026-08-03T00:00:00.000Z';

const work: Work = {
  id: 'w1',
  userId: 'u1',
  title: '秩父三日',
  createdAt: NOW,
  updatedAt: NOW,
};

function block(over: Partial<WorkBlock> & Pick<WorkBlock, 'position' | 'type'>): WorkBlock {
  return {
    id: `b${over.position}`,
    workId: 'w1',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as WorkBlock;
}

const moment: Moment = {
  id: 'm1',
  userId: 'u1',
  title: '坡道',
  occurredAt: '2026-03-14T07:20:00.000Z',
  placeLabel: '秩父神社',
  provenance: { _v: 1 },
  createdAt: NOW,
  updatedAt: NOW,
};

const obs: Observation = {
  id: 'o1',
  momentId: 'm1',
  userId: 'u1',
  content: '有人在扫别人家门口的落叶。',
  recordedAt: '2026-03-14T07:25:00.000Z',
  createdAt: NOW,
};

function rev(id: string, status: 'current' | 'superseded'): InterpretationRevision {
  return {
    id,
    momentId: 'm1',
    userId: 'u1',
    content: `理解 ${id}`,
    basedOnObservationIds: ['o1'],
    status,
    createdAt: NOW,
  };
}

function sources(over: Partial<SnapshotSources> = {}): SnapshotSources {
  return {
    work,
    blocks: [],
    presentation: { rendererType: 'web', config: { _v: 1, theme: 'plain' } },
    moments: new Map(),
    observations: new Map(),
    interpretations: new Map(),
    now: NOW,
    ...over,
  };
}

// ════════════════════════════════════════════════════════════════════════════

describe('buildWorkSnapshot', () => {
  it('冻结的是内容本身，不是 id', () => {
    const snap = buildWorkSnapshot(
      sources({
        blocks: [block({ position: 0, type: 'moment_ref', momentId: 'm1' })],
        moments: new Map([['m1', moment]]),
        observations: new Map([['m1', [obs]]]),
        interpretations: new Map([['m1', [rev('r1', 'current')]]]),
      })
    );

    const b = snap.blocks[0]!;
    expect(b.type).toBe('moment_ref');
    if (b.type !== 'moment_ref') return;

    expect(b.moment?.title).toBe('坡道');
    expect(b.moment?.placeLabel).toBe('秩父神社');
    expect(b.moment?.observations.map((o) => o.content)).toEqual([
      '有人在扫别人家门口的落叶。',
    ]);
    // 关键：理解的**文字**被存下来了，不只是 revisionId
    expect(b.moment?.interpretation?.content).toBe('理解 r1');
    expect(b.moment?.interpretation?.revisionId).toBe('r1');
  });

  it('只冻当前理解，历史版本不进快照', () => {
    const snap = buildWorkSnapshot(
      sources({
        blocks: [block({ position: 0, type: 'moment_ref', momentId: 'm1' })],
        moments: new Map([['m1', moment]]),
        interpretations: new Map([['m1', [rev('r1', 'superseded'), rev('r2', 'current')]]]),
      })
    );
    const b = snap.blocks[0]!;
    expect(b.type === 'moment_ref' ? b.moment?.interpretation?.content : null).toBe('理解 r2');
  });

  it('有观察没理解也能发布 —— 理解不是必须的', () => {
    const snap = buildWorkSnapshot(
      sources({
        blocks: [block({ position: 0, type: 'moment_ref', momentId: 'm1' })],
        moments: new Map([['m1', moment]]),
        observations: new Map([['m1', [obs]]]),
      })
    );
    const b = snap.blocks[0]!;
    expect(b.type === 'moment_ref' ? b.moment?.interpretation : 'x').toBeUndefined();
  });

  it('引用的 Moment 读不到时用墓碑兜底，绝不产出只有 id 的假快照', () => {
    const snap = buildWorkSnapshot(
      sources({
        // moments 里没有 m1 —— 模拟「发布的瞬间它刚被删掉」
        blocks: [block({ position: 0, type: 'moment_ref', momentId: 'm1' })],
      })
    );
    const b = snap.blocks[0]!;
    expect(b.type === 'moment_ref' ? b.tombstone?.deletedAt : null).toBe(NOW);
    expect(b.type === 'moment_ref' ? b.moment : 'x').toBeUndefined();
  });

  it('block 上已有的墓碑优先，不被现造的覆盖', () => {
    const existing = {
      _v: 1 as const,
      title: '原标题',
      observations: ['删除时保留的内容'],
      deletedAt: '2026-05-01T00:00:00.000Z',
    };
    const snap = buildWorkSnapshot(
      sources({
        blocks: [block({ position: 0, type: 'moment_ref', tombstone: existing })],
      })
    );
    const b = snap.blocks[0]!;
    // 墓碑记的是「删除那一刻的样子」，重新发布不该把它改写成今天
    expect(b.type === 'moment_ref' ? b.tombstone : null).toEqual(existing);
  });

  it('position 有空洞时重新编号成连续的', () => {
    const snap = buildWorkSnapshot(
      sources({
        blocks: [
          block({ position: 5, type: 'text', textContent: 'b' }),
          block({ position: 0, type: 'text', textContent: 'a' }),
        ],
      })
    );
    expect(snap.blocks.map((b) => b.position)).toEqual([0, 1]);
    expect(snap.blocks.map((b) => (b.type === 'text' ? b.text : ''))).toEqual(['a', 'b']);
  });

  it('presentation 被完整冻进快照 —— 换主题不影响已发布的页面', () => {
    const snap = buildWorkSnapshot(
      sources({ presentation: { rendererType: 'web', config: { _v: 1, theme: 'serif' } } })
    );
    expect(snap.presentation).toEqual({ rendererType: 'web', config: { _v: 1, theme: 'serif' } });
  });

  it('产出的快照一定通过自洽性检查', () => {
    // buildWorkSnapshot 在返回前自己跑一次 assertSnapshotIsSelfContained。
    // 与其相信这段代码永远正确，不如让它在写库之前自己证明一次。
    const snap = buildWorkSnapshot(
      sources({
        blocks: [
          block({ position: 0, type: 'text', textContent: '开场' }),
          block({ position: 1, type: 'moment_ref', momentId: 'm1' }),
        ],
        moments: new Map([['m1', moment]]),
      })
    );
    expect(snap._v).toBe(1);
    expect(snap.blocks).toHaveLength(2);
  });
});
