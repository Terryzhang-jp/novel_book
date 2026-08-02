/**
 * /studio/moments —— 全部 Moment
 *
 * 存在的理由：作品编辑页要能引用任意一个 Moment，用户得先能找到它的 id。
 * 第一版就是一张列表，没有筛选、没有聚类、没有地图（都在「暂不接」清单里）。
 */

import Link from 'next/link';
import { listMoments } from '@tc/application';
import { getCore, requireActor } from '@/lib/core/context';
import { Banner, Card, fmtDate, H1, Muted, Shell } from '@/components/studio/chrome';

export const dynamic = 'force-dynamic';

export default async function MomentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const actor = await requireActor();
  const moments = await listMoments(getCore(), actor);

  return (
    <Shell>
      <H1>全部 Moment（{moments.length}）</H1>
      <Muted>不管属于哪段旅程，也包括还没归类的。</Muted>
      <div className="mt-4">
        <Banner error={error} notice={notice} />
      </div>

      <ul className="mt-4" data-testid="all-moments">
        {moments.map((m) => (
          <li key={m.id}>
            <Card>
              <div className="flex items-baseline justify-between gap-4">
                <Link href={`/studio/moments/${m.id}`} className="font-medium hover:underline">
                  {m.title || <span className="text-neutral-400">（无标题）</span>}
                </Link>
                {/* 作品编辑页要手动贴 id —— 第一版不做选择器。
                    朴素，但足以验证「引用而非复制」这个模型。 */}
                <code className="select-all text-xs text-neutral-400">{m.id}</code>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {[fmtDate(m.occurredAt), m.placeLabel, m.journeyId ? '已归类' : '未归类']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </Card>
          </li>
        ))}
        {moments.length === 0 ? <Muted>还没有任何 Moment。</Muted> : null}
      </ul>
    </Shell>
  );
}
