/**
 * /studio/assets —— 全部素材
 *
 * ## 这个页面刻意排在导航的第四位
 *
 * 旅程、Moment、作品在前面。素材是**证据**，不是产品中心 ——
 * 把它放到第一屏，产品就退回「照片墙 + 附属说明」了。
 *
 * 它存在的理由只有两个：
 *
 *   1. 上传之后要有一个地方能确认「东西确实进来了」，
 *      而不是只能从某个 Moment 的详情页侧面看见。
 *   2. Phase 3A 需要一个可判定的验收点：从旧上传页传进来的图，
 *      必须在**新系统**里看得到。看不到就说明硬切没有真的完成。
 *
 * 所以这里只做一件事：列出来，说明它从哪来、时间知道多少。
 * 没有编辑、没有分类、没有「设为公开」—— 那些各有归属。
 */

import Link from 'next/link';
import { listAssetDetails } from '@tc/application';
import { getCore, requirePageActor } from '@/lib/core/context';
import { Banner, H1, H2, Muted, Shell } from '@/components/studio/chrome';

export const dynamic = 'force-dynamic';

/** 一次列多少。到了需要翻页的规模，这个页面本身就该重做了。 */
const PAGE_LIMIT = 200;

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function StudioAssets({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const actor = await requirePageActor();
  const details = await listAssetDetails(getCore(), actor, { limit: PAGE_LIMIT });

  return (
    <Shell>
      <H1>素材</H1>
      <Muted>
        照片和录音是证据，不是作品本身。这里能确认它们都在，具体怎么用在 Moment 里决定。
      </Muted>
      <div className="mt-4">
        <Banner error={error} notice={notice} />
      </div>

      <H2>全部（{details.length}）</H2>
      {details.length === 0 ? (
        <Muted>还没有素材。可以在某个 Moment 里上传，也可以从旧相册页上传。</Muted>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3" data-testid="asset-list">
          {details.map(({ asset, effective }) => (
            <li
              key={asset.id}
              className="rounded border border-neutral-200 p-2 text-xs"
              data-testid="asset-item"
              data-asset-id={asset.id}
              data-sha256={asset.sha256}
            >
              {asset.type === 'image' ? (
                // 预览而不是原件：原件带 GPS 且是 no-store，
                // 在一个网格页面里那意味着每次刷新都重新下载几十 MB。
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/studio/assets/${asset.id}/preview?size=thumb`}
                  alt=""
                  loading="lazy"
                  className="mb-2 aspect-square w-full rounded object-cover"
                  data-testid="asset-thumb"
                />
              ) : (
                <div className="mb-2 flex aspect-square w-full items-center justify-center rounded bg-neutral-100 text-neutral-500">
                  录音
                </div>
              )}

              <p className="truncate font-medium" title={asset.mimeType}>
                {asset.mimeType}
              </p>
              <p className="text-neutral-500">{bytes(asset.byteSize)}</p>

              {/*
                时间分三种成色，说清楚是哪一种。
                「2026-08-03 14:35」和「2026-08-03 14:35 (+09:00)」不是同一个
                事实 —— 前者没有时区，换算不成绝对时刻（ADR-009）。
              */}
              {effective.capturedLocalAt ? (
                <p className="text-neutral-500">
                  拍摄 {effective.capturedLocalAt.replace('T', ' ')}
                  {effective.timezone.kind === 'unknown' ? (
                    <span title="相机没有记录时区，无法换算成绝对时刻">（时区未知）</span>
                  ) : (
                    <span>（{effective.timezone.value}）</span>
                  )}
                </p>
              ) : (
                <p className="text-neutral-400">没有拍摄时间</p>
              )}

              {asset.derivedFromAssetId ? (
                <p className="text-neutral-500">由另一份素材加工而来</p>
              ) : null}

              <Link
                href={`/api/studio/assets/${asset.id}/raw`}
                className="mt-1 inline-block text-blue-700 hover:underline"
                prefetch={false}
              >
                原件
              </Link>
            </li>
          ))}
        </ul>
      )}

      {details.length === PAGE_LIMIT ? (
        <Muted>
          只显示了前 {PAGE_LIMIT} 份。这个页面没有翻页 —— 到了需要翻页的规模，
          它本身就该重做了，而不是加一个「下一页」。
        </Muted>
      ) : null}
    </Shell>
  );
}
