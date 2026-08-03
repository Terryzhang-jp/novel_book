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
  ACCOUNT_STATUSES,
  assertDeletable,
  assertTransitionAllowed,
  canAuthenticate,
  canCancelDeletion,
  canServePublications,
  canTransition,
  deletionDeadline,
  DELETION_GRACE_DAYS,
  isDeletionDue,
  type AccountStatus,
  assertSnapshotIsSelfContained,
  assertValidBlock,
  assertValidTimezone,
  canResolveAbsoluteTime,
  formatCapturedTime,
  UNKNOWN_TIMEZONE,
  assertValidJourneyInput,
  assertValidSupersede,
  buildInterpretationChain,
  buildMomentTombstone,
  currentInterpretation,
  InvariantViolation,
  isPubliclyVisible,
  isWithdrawn,
  DEFAULT_NARRATIVE_CONFIG,
  freezePresentation,
  normalizeSnapshot,
  parsePresentationConfig,
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
    _v: 2,
    work: { id: 'w1', title: '作品' },
    presentation: freezePresentation('narrative', DEFAULT_NARRATIVE_CONFIG),
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
      assertSnapshotIsSelfContained({ ...base, _v: 99 as unknown as 2 })
    ).toThrow(/P-1/);
  });

  it('缺少 rendererVersion 要报错 —— 那意味着视觉表达没有被冻结', () => {
    expect(() =>
      assertSnapshotIsSelfContained({
        ...base,
        presentation: { ...base.presentation, rendererVersion: 0 },
      })
    ).toThrow(/rendererVersion/);
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

describe('Presentation 的边界（ADR-010）', () => {
  it('未知字段被丢弃 —— 想加 hiddenBlockIds 得先改类型定义', () => {
    const config = parsePresentationConfig('narrative', {
      theme: 'paper',
      hiddenBlockIds: ['a', 'b'],
      blockOrder: [2, 1, 0],
    });
    expect(config).not.toHaveProperty('hiddenBlockIds');
    expect(config).not.toHaveProperty('blockOrder');
    expect(config.renderer).toBe('narrative');
  });

  it('缺失字段补默认，非法枚举值报错', () => {
    expect(parsePresentationConfig('gallery', {})).toEqual({
      _v: 1,
      renderer: 'gallery',
      columns: 2,
      imageFit: 'cover',
      captionMode: 'below',
      textDensity: 'compact',
    });
    // 报错而不是静默用默认值：静默会让用户以为自己的设置生效了
    expect(() => parsePresentationConfig('gallery', { columns: 7 })).toThrow(/PR-1/);
    expect(() => parsePresentationConfig('narrative', { theme: 'neon' })).toThrow(/PR-1/);
  });

  it('columns 是数字不是字符串 —— 表单来的值要转回去', () => {
    const config = parsePresentationConfig('gallery', { columns: '3' });
    expect(config).toMatchObject({ columns: 3 });
  });
});

describe('快照版本迁移（ADR-010 R6）', () => {
  const v1 = {
    _v: 1,
    work: { id: 'w1', title: '旧作品' },
    presentation: { rendererType: 'web', config: { _v: 1, theme: 'plain' } },
    blocks: [{ type: 'text', position: 0, text: '一段话' }],
  };

  it('v1 读到时升级成 v2，web 变成 narrative@1', () => {
    const up = normalizeSnapshot(v1);
    expect(up._v).toBe(2);
    expect(up.presentation.rendererType).toBe('narrative');
    expect(up.presentation.rendererVersion).toBe(1);
    // v1 的 config 是开放结构（theme:'plain' 在 v2 的枚举里不存在），
    // 和 v2 没有忠实对应关系。所以用默认配置而不是猜 ——
    // 报错会让所有旧发布页打不开，硬映射是在替用户决定他当时想要什么。
    expect(up.presentation.config).toEqual(DEFAULT_NARRATIVE_CONFIG);
    expect(up.blocks).toHaveLength(1);
  });

  it('升级是纯函数：不修改传进来的对象', () => {
    const before = JSON.stringify(v1);
    normalizeSnapshot(v1);
    expect(JSON.stringify(v1)).toBe(before);
  });

  it('v2 原样返回，但仍然过一次 config 校验', () => {
    const v2 = {
      _v: 2,
      work: { id: 'w1', title: '新作品' },
      presentation: {
        rendererType: 'gallery',
        rendererVersion: 1,
        presentationSchemaVersion: 1,
        config: { _v: 1, renderer: 'gallery', columns: 3, sneaky: 'x' },
      },
      blocks: [],
    };
    const out = normalizeSnapshot(v2);
    expect(out.presentation.config).not.toHaveProperty('sneaky');
    expect(out.presentation.config).toMatchObject({ columns: 3 });
  });

  it('无法识别的版本要报错，不猜', () => {
    expect(() => normalizeSnapshot({ _v: 99 })).toThrow(/P-1/);
    expect(() => normalizeSnapshot(null)).toThrow(/P-1/);
  });
});

describe('时区的两种语义必须分开（schema hardening）', () => {
  it('固定偏移不能被登记成 IANA 时区名', () => {
    // '+09:00' 可能是东京、首尔、雅库茨克 —— 混进 iana 就等于伪造了夏令时规则
    expect(() =>
      assertValidTimezone({ kind: 'iana', value: '+09:00', source: 'user' })
    ).toThrow(/TZ-1/);
    expect(() =>
      assertValidTimezone({ kind: 'iana', value: 'Asia/Tokyo', source: 'user' })
    ).not.toThrow();
  });

  it('offset 必须是 ±HH:MM', () => {
    expect(() =>
      assertValidTimezone({ kind: 'offset', value: 'Asia/Tokyo', source: 'user' })
    ).toThrow(/TZ-1/);
    expect(() =>
      assertValidTimezone({ kind: 'offset', value: '+09:00', source: 'user' })
    ).not.toThrow();
  });

  it('unknown 不能带值', () => {
    expect(() =>
      assertValidTimezone({ kind: 'unknown', value: '+09:00', source: 'unknown' })
    ).toThrow(/TZ-1/);
    expect(() => assertValidTimezone(UNKNOWN_TIMEZONE)).not.toThrow();
  });

  it('只有固定偏移能算出绝对时间 —— IANA 需要夏令时规则数据', () => {
    expect(canResolveAbsoluteTime({ kind: 'offset', value: '+09:00', source: 'user' })).toBe(true);
    expect(canResolveAbsoluteTime({ kind: 'iana', value: 'Asia/Tokyo', source: 'user' })).toBe(
      false
    );
    expect(canResolveAbsoluteTime(UNKNOWN_TIMEZONE)).toBe(false);
  });

  it('时区未知时不显示 UTC，也不做转换', () => {
    const shown = formatCapturedTime({
      capturedLocalAt: '2026-08-03T14:35:00',
      timezone: UNKNOWN_TIMEZONE,
    });
    expect(shown.text).toBe('2026-08-03 14:35 · 相机本地时间，时区未知');
    expect(shown.text).not.toContain('UTC');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 账号状态机（ADR-007）
//
// 这一组穷举的是**不该发生的迁移**。放在单元层是因为它是纯函数：
// 集成测试只会走正常路径，而账号状态机出事的形状恰恰在正常路径之外 ——
// 「已删除的账号被恢复了」「冷静期被重置了」这类问题不会在快乐路径上出现。
// ════════════════════════════════════════════════════════════════════════════

describe('账号状态机', () => {
  it('允许的迁移正好是 ADR-007 画的那四条箭头', () => {
    const allowed: [AccountStatus, AccountStatus][] = [
      ['active', 'disabled'],
      ['active', 'deletion_requested'],
      ['disabled', 'active'],
      ['deletion_requested', 'active'],
      ['deletion_requested', 'deleted'],
    ];
    for (const [from, to] of allowed) {
      expect(canTransition(from, to), `${from} → ${to} 应当允许`).toBe(true);
    }

    // 其余组合一律禁止。穷举而不是抽查 —— 新增状态时这条会立刻变红，
    // 迫使作者显式决定新状态能去哪里，而不是默认放行。
    for (const from of ACCOUNT_STATUSES) {
      for (const to of ACCOUNT_STATUSES) {
        const isListed = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(isListed);
      }
    }
  });

  it('deleted 是终点：任何方向都出不来', () => {
    for (const to of ACCOUNT_STATUSES) {
      expect(canTransition('deleted', to)).toBe(false);
    }
  });

  it('停用的账号不能自助申请删除 —— 他根本登录不进来', () => {
    expect(canTransition('disabled', 'deletion_requested')).toBe(false);
    expect(() => assertTransitionAllowed('disabled', 'deletion_requested')).toThrow(
      InvariantViolation
    );
  });

  it('原地不动也是错误，不是幂等成功', () => {
    // 「已经是这个状态了」必须报错而不是静默通过：
    // 静默通过意味着第二次申请删除会覆盖第一次的等待期。
    for (const s of ACCOUNT_STATUSES) {
      expect(() => assertTransitionAllowed(s, s)).toThrow(/已经是/);
    }
  });

  it('只有 active 能登录、能对外提供内容', () => {
    for (const s of ACCOUNT_STATUSES) {
      expect(canAuthenticate(s)).toBe(s === 'active');
      expect(canServePublications(s)).toBe(s === 'active');
    }
  });
});

describe('删除冷静期', () => {
  const T0 = new Date('2026-08-03T00:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;
  const window = { requestedAt: T0, effectiveAt: deletionDeadline(T0) };

  it('等待期正好 30 天', () => {
    expect(window.effectiveAt.getTime() - T0.getTime()).toBe(DELETION_GRACE_DAYS * DAY);
  });

  it('到期那一毫秒：不能再撤销，可以执行删除', () => {
    const justBefore = new Date(window.effectiveAt.getTime() - 1);
    const exactly = window.effectiveAt;

    expect(canCancelDeletion(window, justBefore)).toBe(true);
    expect(isDeletionDue(window, justBefore)).toBe(false);

    // 边界上两者必须互斥 —— 同时成立就意味着存在「一边在删一边被撤销」的窗口
    expect(canCancelDeletion(window, exactly)).toBe(false);
    expect(isDeletionDue(window, exactly)).toBe(true);
  });

  it('差 1 毫秒的永久删除必须被拒绝', () => {
    expect(() =>
      assertDeletable('deletion_requested', window, new Date(window.effectiveAt.getTime() - 1))
    ).toThrow(InvariantViolation);
  });

  it('状态不对时，错误说的是状态而不是时间', () => {
    const late = new Date(window.effectiveAt.getTime() + DAY);
    expect(() => assertDeletable('active', window, late)).toThrow(/deletion_requested/);
    expect(() => assertDeletable('disabled', window, late)).toThrow(/deletion_requested/);
  });

  it('deletion_requested 但没有等待期字段 —— 宁可报错也不删', () => {
    expect(() => assertDeletable('deletion_requested', undefined, new Date())).toThrow(
      InvariantViolation
    );
  });
});
