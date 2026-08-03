/**
 * 两个 Web Renderer —— `narrative@1` 与 `gallery@1`
 *
 * ## 它们渲染的是**同一份 block 列表**
 *
 * 这个文件里没有任何一处按 Presentation 配置去隐藏、重排或改写 block。
 * 想验证这一点：下面两个渲染器都从 `snapshot.blocks` 直接 `.map()`，
 * 中间没有 `filter`、没有 `sort`、没有 `slice`。
 *
 * 一旦出现其中任何一个，Presentation 就变成了第二份内容真相 ——
 * 那正是 ADR-010 R3 禁止的事。
 *
 * ## 版本号跟着这个文件走
 *
 * 改了排版让**同一份 config 的视觉结果变了**，就要新增 `narrative-v2`
 * 并把 `RENDERER_VERSIONS.narrative` 升到 2，旧函数留着给旧 Publication 用。
 * 修 bug 让它符合原本的意图不算。
 */

import type {
  GalleryConfig,
  SnapshotAsset,
  NarrativeConfig,
  PresentationConfig,
  SnapshotBlock,
  WorkSnapshot,
} from '@tc/domain';
import { assertRendererAvailable, publicAssetFile } from '@tc/domain';
import { MOMENT_ASSET_ROLE_LABELS } from '@tc/application';
import { fmtDate } from './chrome';

// ── 内容提取：两个渲染器共用，保证语义内容完全一致 ──────────────────────────

/**
 * 派生副本的公开地址。
 *
 * 扩展名由 mimeType 决定 —— 原来这里写死 `.webp`，音频接进来之后
 * 那会让每一段录音都以 .webp 结尾。文件名对外是契约的一部分，
 * 不该跟着「当时只有一种格式」的假设走。
 */
function assetUrl(slug: string, asset: SnapshotAsset): string {
  return `/p/${encodeURIComponent(slug)}/a/${publicAssetFile(asset)}`;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * 一段录音。
 *
 * `preload="none"` —— 一篇文章里可能有好几段，全部预加载会让「打开页面」
 * 就产生几 MB 流量。读者点了才下载。
 *
 * 两个渲染器共用它，和 TextBlock / Tombstone 同一个理由：
 * 这是**内容提取**，必须完全一致。差异只允许出现在布局上。
 */
function AudioEvidence({ src, asset }: { src: string; asset: SnapshotAsset }) {
  if (asset.kind !== 'audio') return null;
  return (
    <figure data-testid="pub-asset" className="my-5">
      {/* biome-ignore lint/a11y/useMediaCaption: 用户录音没有字幕轨，挂一个空的更糟 */}
      <audio controls preload="none" src={src} data-testid="pub-audio" className="w-full" />
      <figcaption className="mt-1 text-xs text-neutral-500">
        {MOMENT_ASSET_ROLE_LABELS[asset.role]} · {formatDuration(asset.durationMs)}
        {asset.note ? ` · ${asset.note}` : ''}
      </figcaption>
    </figure>
  );
}

function TextBlock({ text, className }: { text: string; className: string }) {
  return <p className={className}>{text}</p>;
}

function Tombstone({ block }: { block: Extract<SnapshotBlock, { type: 'moment_ref' }> }) {
  const t = block.tombstone!;
  return (
    <section
      data-testid="pub-tombstone"
      className="mb-6 rounded border border-dashed border-neutral-300 p-4 text-sm text-neutral-500"
    >
      <p className="mb-2">
        {t.title ? `「${t.title}」` : '这个片段'}的原始记录已被作者删除，以下是发布时保留的内容：
      </p>
      {t.observations.map((o, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 快照不可变，索引就是稳定标识
        <p key={i} className="mb-1">
          {o}
        </p>
      ))}
      {t.interpretation ? <p className="mt-2 italic">{t.interpretation}</p> : null}
    </section>
  );
}

// ── narrative@1 ──────────────────────────────────────────────────────────────

export function NarrativeV1({
  snapshot,
  slug,
  config,
}: {
  snapshot: WorkSnapshot;
  slug: string;
  config: NarrativeConfig;
}) {
  const width = config.contentWidth === 'wide' ? 'max-w-3xl' : 'max-w-2xl';
  const paper = config.theme === 'paper';
  const seamless = config.momentStyle === 'seamless';
  const fullWidth = config.imageTreatment === 'full-width';

  return (
    <article
      data-testid="renderer-narrative"
      className={`mx-auto ${width} px-4 py-10 ${paper ? 'bg-[#faf8f3] font-serif' : ''}`}
    >
      <h1 className="mb-8 text-3xl font-semibold" data-testid="pub-title">
        {snapshot.work.title}
      </h1>

      {snapshot.blocks.map((block) => {
        if (block.type === 'text') {
          return (
            <TextBlock
              key={block.position}
              text={block.text}
              className="mb-6 whitespace-pre-wrap leading-relaxed"
            />
          );
        }
        if (block.tombstone) return <Tombstone key={block.position} block={block} />;
        const m = block.moment;
        if (!m) return null;

        return (
          <section
            key={block.position}
            data-testid="pub-moment"
            className={seamless ? 'mb-10' : 'mb-8 rounded border border-neutral-200 p-5'}
          >
            {m.title ? <h2 className="mb-1 text-lg font-medium">{m.title}</h2> : null}
            {m.occurredAt || m.placeLabel ? (
              <p className="mb-3 text-xs text-neutral-500">
                {[fmtDate(m.occurredAt), m.placeLabel].filter(Boolean).join(' · ')}
              </p>
            ) : null}

            {/* 文字在前 —— narrative 让读者先读到观察和理解 */}
            {m.observations.map((o) => (
              <p key={o.id} className="mb-2 whitespace-pre-wrap leading-relaxed">
                {o.content}
              </p>
            ))}
            {m.interpretation ? (
              <blockquote
                data-testid="pub-interpretation"
                className="mt-3 border-l-2 border-neutral-300 pl-3 italic text-neutral-700"
              >
                {m.interpretation.content}
              </blockquote>
            ) : null}

            {(m.assets ?? []).map((a) =>
              a.kind === 'audio' ? (
                <AudioEvidence key={a.derivedHash} src={assetUrl(slug, a)} asset={a} />
              ) : (
                <figure
                  key={a.derivedHash}
                  data-testid="pub-asset"
                  className={fullWidth ? 'my-6 -mx-4' : 'my-5'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetUrl(slug, a)}
                    alt={a.note ?? ''}
                    width={a.width}
                    height={a.height}
                    className="w-full rounded"
                    loading="lazy"
                  />
                  <figcaption className="mt-1 px-4 text-xs text-neutral-500">
                    {MOMENT_ASSET_ROLE_LABELS[a.role]}
                    {a.note ? ` · ${a.note}` : ''}
                  </figcaption>
                </figure>
              )
            )}
          </section>
        );
      })}
    </article>
  );
}

// ── gallery@1 ────────────────────────────────────────────────────────────────

export function GalleryV1({
  snapshot,
  slug,
  config,
}: {
  snapshot: WorkSnapshot;
  slug: string;
  config: GalleryConfig;
}) {
  const cols = config.columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
  const fit = config.imageFit === 'contain' ? 'object-contain' : 'object-cover';
  const compact = config.textDensity === 'compact';
  const minimalCaption = config.captionMode === 'minimal';

  return (
    <article data-testid="renderer-gallery" className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-semibold" data-testid="pub-title">
        {snapshot.work.title}
      </h1>

      {snapshot.blocks.map((block) => {
        if (block.type === 'text') {
          return (
            <TextBlock
              key={block.position}
              text={block.text}
              // 文字仍然全部显示 —— compact 改的是排版密度，不是内容多少。
              // 少显示一句就变成 Presentation 在决定内容了（R3）。
              className={
                compact
                  ? 'mx-auto mb-6 max-w-2xl text-sm leading-relaxed text-neutral-600'
                  : 'mx-auto mb-6 max-w-2xl whitespace-pre-wrap leading-relaxed'
              }
            />
          );
        }
        if (block.tombstone) return <Tombstone key={block.position} block={block} />;
        const m = block.moment;
        if (!m) return null;

        return (
          <section key={block.position} data-testid="pub-moment" className="mb-12">
            {/* 图片在前 —— gallery 让读者先看到视觉对比 */}
            {(m.assets ?? []).length > 0 ? (
              <div className={`grid grid-cols-1 gap-3 ${cols}`}>
                {(m.assets ?? []).map((a) =>
                  a.kind === 'audio' ? (
                    <AudioEvidence key={a.derivedHash} src={assetUrl(slug, a)} asset={a} />
                  ) : (
                    <figure key={a.derivedHash} data-testid="pub-asset">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetUrl(slug, a)}
                        alt={a.note ?? ''}
                        width={a.width}
                        height={a.height}
                        className={`aspect-[4/3] w-full rounded ${fit}`}
                        loading="lazy"
                      />
                      {minimalCaption ? null : (
                        <figcaption className="mt-1 text-xs text-neutral-500">
                          {MOMENT_ASSET_ROLE_LABELS[a.role]}
                          {a.note ? ` · ${a.note}` : ''}
                        </figcaption>
                      )}
                    </figure>
                  )
                )}
              </div>
            ) : null}

            <div className="mx-auto mt-4 max-w-2xl">
              {m.title ? <h2 className="mb-1 text-base font-medium">{m.title}</h2> : null}
              {m.occurredAt || m.placeLabel ? (
                <p className="mb-2 text-xs text-neutral-500">
                  {[fmtDate(m.occurredAt), m.placeLabel].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              {m.observations.map((o) => (
                <p
                  key={o.id}
                  className={compact ? 'mb-1 text-sm text-neutral-600' : 'mb-2 leading-relaxed'}
                >
                  {o.content}
                </p>
              ))}
              {m.interpretation ? (
                <blockquote
                  data-testid="pub-interpretation"
                  className="mt-2 border-l-2 border-neutral-300 pl-3 text-sm italic text-neutral-700"
                >
                  {m.interpretation.content}
                </blockquote>
              ) : null}
            </div>
          </section>
        );
      })}
    </article>
  );
}

// ── Renderer 注册表 ──────────────────────────────────────────────────────────

export interface RendererProps {
  readonly snapshot: WorkSnapshot;
  readonly slug: string;
  readonly config: PresentationConfig;
}

/**
 * `type@version` → 实现。
 *
 * ## 保留契约（ADR-010 R1 的执行形式）
 *
 * 1. **一个版本一旦被任何 Publication 引用过，就不能删。**
 *    删了那些页面就打不开了 —— 而它们本来是不可变的。
 * 2. 改动某个版本的排版**让同一份 config 的视觉结果变了**，
 *    要新增一个版本号，旧函数原地不动。
 * 3. 两个渲染器**不共享布局组件**。共享的只有内容提取
 *    （TextBlock / Tombstone），因为那部分必须完全一致 —— 那正是
 *    「同一份内容」的含义。改共享部分等于同时改两个渲染器，
 *    golden 测试会一起变红，那时候就必须两个都升版本。
 *
 * test/unit/renderer-contract.test.ts 和 test/integration 里的一条
 * 一起守着：前者比对 golden 输出，后者扫数据库里所有被引用过的版本，
 * 确认注册表里都有实现。
 */
export const RENDERER_REGISTRY: Readonly<
  Record<string, (props: RendererProps) => JSX.Element>
> = {
  'narrative@1': ({ snapshot, slug, config }) => (
    <NarrativeV1 snapshot={snapshot} slug={slug} config={config as NarrativeConfig} />
  ),
  'gallery@1': ({ snapshot, slug, config }) => (
    <GalleryV1 snapshot={snapshot} slug={slug} config={config as GalleryConfig} />
  ),
};

export function rendererKey(type: string, version: number): string {
  return `${type}@${version}`;
}

/**
 * 按 `rendererType@rendererVersion` 选。
 *
 * **绝不回退到最新版**（ADR-010 R1）—— 那等于说「我们保存了你当时的配置，
 * 但用今天的代码渲染」，而视觉结果可能完全不同。
 */
export function SnapshotView({ snapshot, slug }: { snapshot: WorkSnapshot; slug: string }) {
  const p = snapshot.presentation;
  assertRendererAvailable(p);

  const key = rendererKey(p.rendererType, p.rendererVersion);
  const Renderer = RENDERER_REGISTRY[key];
  if (!Renderer) {
    // 明确失败。回退到别的版本会让这篇文章悄悄变成另一个样子。
    throw new Error(`没有 ${key} 的渲染器实现 —— 它可能被误删了（ADR-010 保留契约）`);
  }
  return <Renderer snapshot={snapshot} slug={slug} config={p.config} />;
}
