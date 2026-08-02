/**
 * 发布页渲染器
 *
 * ## 这个组件的唯一输入是 WorkSnapshot
 *
 * 没有 props 指向数据库，没有 fetch，没有任何 id 会被拿去查表。
 * 这是 ADR-006 判定标准在代码里的形状：
 *
 *   渲染一个 Publication 时，不允许查询 moments / observations /
 *   interpretation_revisions / work_blocks / work_presentations 任何实时表。
 *
 * 想验证这一点，把 SnapshotView 的 props 换成任何别的类型都会立刻编译失败 ——
 * 它拿不到 repository，也拿不到 actor。
 */

import type { WorkSnapshot } from '@tc/domain';
import { fmtDate } from './chrome';

export function SnapshotView({ snapshot }: { snapshot: WorkSnapshot }) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-semibold" data-testid="pub-title">
        {snapshot.work.title}
      </h1>

      {snapshot.blocks.map((block) => {
        if (block.type === 'text') {
          return (
            <p key={block.position} className="mb-6 whitespace-pre-wrap leading-relaxed">
              {block.text}
            </p>
          );
        }

        // Moment 被删除后留下的墓碑。
        // 显示它而不是跳过 —— 作品里出现一个无法解释的空洞，
        // 比明说「这里原本有一段，作者后来删掉了素材」更糟。
        if (block.tombstone) {
          return (
            <section
              key={block.position}
              data-testid="pub-tombstone"
              className="mb-6 rounded border border-dashed border-neutral-300 p-4 text-sm text-neutral-500"
            >
              <p className="mb-2">
                {block.tombstone.title ? `「${block.tombstone.title}」` : '这个片段'}
                的原始记录已被作者删除，以下是发布时保留的内容：
              </p>
              {block.tombstone.observations.map((o, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 快照是不可变的，索引就是稳定标识
                <p key={i} className="mb-1">
                  {o}
                </p>
              ))}
              {block.tombstone.interpretation ? (
                <p className="mt-2 italic">{block.tombstone.interpretation}</p>
              ) : null}
            </section>
          );
        }

        const m = block.moment;
        if (!m) return null;

        return (
          <section key={block.position} className="mb-8" data-testid="pub-moment">
            {m.title ? <h2 className="mb-1 text-lg font-medium">{m.title}</h2> : null}
            {m.occurredAt || m.placeLabel ? (
              <p className="mb-3 text-xs text-neutral-500">
                {[fmtDate(m.occurredAt), m.placeLabel].filter(Boolean).join(' · ')}
              </p>
            ) : null}

            {m.observations.map((o) => (
              <p key={o.id} className="mb-2 whitespace-pre-wrap leading-relaxed">
                {o.content}
              </p>
            ))}

            {/* 冻结的是发布那一刻的理解。作者后来改了想法，这里也不会变。 */}
            {m.interpretation ? (
              <blockquote
                data-testid="pub-interpretation"
                className="mt-3 border-l-2 border-neutral-300 pl-3 italic text-neutral-700"
              >
                {m.interpretation.content}
              </blockquote>
            ) : null}
          </section>
        );
      })}
    </article>
  );
}
