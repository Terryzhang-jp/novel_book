/**
 * 领域纯函数的单元测试
 *
 * 这些函数没有 IO，所以可以穷举边界。它们承载的是**领域知识**：
 * 理解链是什么形状、快照怎样才算自洽、哪些输入根本不该被接受。
 *
 * ## 为什么值得单独测
 *
 * 集成测试证明「正常路径能跑通」，但正常路径不会经过分叉的理解链、
 * 成环的数据、缺内容的快照 —— 而那些正是出事时的形状。
 * 等它们在生产里出现再排查，手上唯一的线索会是一个 UI 空白页。
 */

import { describe, expect, it } from 'vitest';
import {
  assertSnapshotIsSelfContained,
  assertValidBlock,
  assertValidJourneyInput,
  assertValidSupersede,
  buildInterpretationChain,
  buildMomentTombstone,
  currentInterpretation,
  InvariantViolation,
  isPubliclyVisible,
  isWithdrawn,
  renumber,
  slugify,
  userProvenance,
  type InterpretationRevision,
  type Publication,
  type WorkSnapshot,
} from '@tc/domain';

// ── 造数据的小工具 ───────────────────────────────────────────────────────────

function rev(
  id: string,
  supersedesId?: string,
  status: 'current' | 'superseded' = 'superseded'
): InterpretationRevision {
  return {
    id,
    momentId: 'm1',
    userId: 'u1',
    content: `内容 ${id}`,
    ...(supersedesId ? { supersedesId } : {}),
    basedOnObservationIds: [],
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

// ════════════════════════════════════════════════════════════════════════════

describe('Journey 输入校验', () => {
  it('拒绝空标题', () => {
    expect(() =>
      assertValidJourneyInput({ title: '  ', type: 'trip', startedAt: '2026-01-01' })
    ).toThrow(InvariantViolation);
  });

  it('拒绝 trip / outing 之外的类型', () => {
    expect(() =>
      assertValidJourneyInput({
        title: 'x',
        type: 'encounter' as never,
        startedAt: '2026-01-01',
      })
    ).toThrow(/J-1/);
  });

  it('拒绝结束早于开始', () => {
    expect(() =>
      assertValidJourneyInput({
        title: 'x',
        type: 'trip',
        startedAt: '2026-03-10T00:00:00Z',
        endedAt: '2026-03-09T00:00:00Z',
      })
    ).toThrow(/J-4/);
  });

  it('接受进行中的 Journey（没有结束时间）', () => {
    expect(() =>
      assertValidJourneyInput({ title: 'x', type: 'outing', startedAt: '2026-03-10T00:00:00Z' })
    ).not.toThrow();
  });
});

describe('理解链的形状', () => {
  it('把乱序的 revision 还原成从早到晚的链', () => {
    const chain = buildInterpretationChain([
      rev('v3', 'v2', 'current'),
      rev('v1'),
      rev('v2', 'v1'),
    ]);
    expect(chain.map((r) => r.id)).toEqual(['v1', 'v2', 'v3']);
  });

  it('空列表返回空链', () => {
    expect(buildInterpretationChain([])).toEqual([]);
  });

  it('分叉必须报错，不能返回半条链', () => {
    // v2 和 v2b 都 supersede v1 —— 「我现在的理解」无法回答。
    // 静默返回 [v1, v2] 会让用户以为自己没写过 v2b。
    expect(() =>
      buildInterpretationChain([rev('v1'), rev('v2', 'v1'), rev('v2b', 'v1')])
    ).toThrow(/I-5/);
  });

  it('成环必须报错', () => {
    expect(() => buildInterpretationChain([rev('a', 'b'), rev('b', 'a')])).toThrow(/I-6/);
  });

  it('两条 current 必须报错', () => {
    expect(() => currentInterpretation([rev('v1', undefined, 'current'), rev('v2', 'v1', 'current')])).toThrow(
      /I-1/
    );
  });

  it('没有理解时 current 是 null，不是抛错', () => {
    expect(currentInterpretation([])).toBeNull();
  });
});

describe('supersede 的合法性', () => {
  it('首版不能 supersede 任何东西', () => {
    expect(() => assertValidSupersede('m1', null, 'v0')).toThrow(/I-2/);
  });

  it('已有当前理解时，新版必须 supersede 它', () => {
    expect(() => assertValidSupersede('m1', rev('v1', undefined, 'current'), undefined)).toThrow(
      /I-2/
    );
  });

  it('不能 supersede 历史版本，只能 supersede 当前版本', () => {
    expect(() => assertValidSupersede('m1', rev('v2', 'v1', 'current'), 'v1')).toThrow(/I-2/);
  });

  it('正常的 v1 → v2 通过', () => {
    expect(() => assertValidSupersede('m1', rev('v1', undefined, 'current'), 'v1')).not.toThrow();
  });
});

describe('Work block 的形状', () => {
  it('text block 必须有内容', () => {
    expect(() => assertValidBlock('text', { textContent: '   ' })).toThrow(/W-block/);
  });

  it('moment_ref block 必须指定 momentId', () => {
    expect(() => assertValidBlock('moment_ref', {})).toThrow(/W-block/);
  });
});

describe('position 重排', () => {
  it('排序后重新编号成连续的 0..n-1', () => {
    const out = renumber([{ position: 7 }, { position: 2 }, { position: 5 }]);
    expect(out.map((b) => b.position)).toEqual([0, 1, 2]);
  });

  it('不修改入参', () => {
    const input = [{ position: 3 }, { position: 1 }];
    renumber(input);
    expect(input.map((b) => b.position)).toEqual([3, 1]);
  });
});

describe('slug 生成', () => {
  it('保留中文', () => {
    expect(slugify('秩父三日')).toBe('秩父三日');
  });

  it('空白和标点变连字符，首尾不留', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello-world');
  });

  it('全是标点时退回 untitled，而不是空字符串', () => {
    // 空 slug 会生成 /p/ 这样的 URL —— 路由匹配不到，且违反唯一约束
    expect(slugify('!!!')).toBe('untitled');
  });

  it('截断到 60 字符以内', () => {
    expect(slugify('あ'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('provenance', () => {
  it('只给填了值的字段记来源', () => {
    const p = userProvenance(
      { title: '有值', placeLabel: '', occurredAt: undefined },
      '2026-01-01T00:00:00.000Z'
    );
    expect(p.title).toEqual({ source: 'user', recordedAt: '2026-01-01T00:00:00.000Z' });
    expect(p.placeLabel).toBeUndefined();
    expect(p.occurredAt).toBeUndefined();
    expect(p._v).toBe(1);
  });
});

describe('墓碑', () => {
  it('冻下标题、全部观察和当前理解', () => {
    const t = buildMomentTombstone(
      { title: '坡道' },
      [{ content: 'obs1' }, { content: 'obs2' }],
      { content: '当时的理解' },
      '2026-08-03T00:00:00.000Z'
    );
    expect(t).toEqual({
      _v: 1,
      title: '坡道',
      observations: ['obs1', 'obs2'],
      interpretation: '当时的理解',
      deletedAt: '2026-08-03T00:00:00.000Z',
    });
  });

  it('没有标题和理解时不放这两个键 —— 而不是放 undefined', () => {
    // JSON 序列化后 `{title: undefined}` 和「没有 title 键」是不同的，
    // 而快照要能逐字节比较
    const t = buildMomentTombstone({}, [], null, '2026-08-03T00:00:00.000Z');
    expect(Object.keys(t).sort()).toEqual(['_v', 'deletedAt', 'observations']);
  });
});

describe('快照自洽性', () => {
  const base: WorkSnapshot = {
    _v: 1,
    work: { id: 'w1', title: '作品' },
    presentation: { rendererType: 'web', config: { _v: 1 } },
    blocks: [],
  };

  it('空作品也是自洽的', () => {
    expect(() => assertSnapshotIsSelfContained(base)).not.toThrow();
  });

  it('拒绝只有 id 没有冻结内容的 moment_ref —— 那是假快照', () => {
    expect(() =>
      assertSnapshotIsSelfContained({
        ...base,
        blocks: [{ type: 'moment_ref', position: 0, momentId: 'm1' }],
      })
    ).toThrow(/P-3/);
  });

  it('墓碑也算冻结内容 —— Moment 被删过的作品照样能发布', () => {
    expect(() =>
      assertSnapshotIsSelfContained({
        ...base,
        blocks: [
          {
            type: 'moment_ref',
            position: 0,
            momentId: null,
            tombstone: { _v: 1, observations: ['x'], deletedAt: '2026-01-01T00:00:00.000Z' },
          },
        ],
      })
    ).not.toThrow();
  });

  it('position 不连续要报错', () => {
    expect(() =>
      assertSnapshotIsSelfContained({
        ...base,
        blocks: [
          { type: 'text', position: 0, text: 'a' },
          { type: 'text', position: 2, text: 'b' },
        ],
      })
    ).toThrow(/P-1/);
  });

  it('缺少 work.title 要报错', () => {
    expect(() =>
      assertSnapshotIsSelfContained({ ...base, work: { id: 'w1', title: '' } })
    ).toThrow(/P-1/);
  });

  it('未知的 _v 要报错', () => {
    expect(() =>
      assertSnapshotIsSelfContained({ ...base, _v: 2 as unknown as 1 })
    ).toThrow(/P-1/);
  });
});

describe('Publication 可见性', () => {
  const pub = (over: Partial<Publication> = {}): Publication => ({
    id: 'p1',
    workVersionId: 'v1',
    userId: 'u1',
    slug: 's',
    visibility: 'public',
    publishedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  it('撤回之后任何人都看不到', () => {
    const p = pub({ withdrawnAt: '2026-02-01T00:00:00.000Z' });
    expect(isWithdrawn(p)).toBe(true);
    expect(isPubliclyVisible(p)).toBe(false);
  });

  it('private 不对外可见', () => {
    expect(isPubliclyVisible(pub({ visibility: 'private' }))).toBe(false);
  });

  it('unlisted 对拿到链接的人可见', () => {
    expect(isPubliclyVisible(pub({ visibility: 'unlisted' }))).toBe(true);
  });
});
