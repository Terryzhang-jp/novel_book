/**
 * Renderer 与 Presentation 配置 —— ADR-010
 *
 * ## 这个文件存在的唯一理由是划一条线
 *
 * Presentation 决定**看起来怎么样**，不决定**有什么内容**。
 *
 * 所以配置是一个**封闭的判别联合**，每个 renderer 只有四个枚举字段。
 * 想加 `hiddenBlockIds` 或 `blockOrder`，必须先改这里的类型、改
 * `parsePresentationConfig`、改 ADR-010 —— 那时候至少有人会问一句
 * 「这真的是表现吗」。
 *
 * 开放的 `Record<string, unknown>` 给不了这个提问的机会。
 */

import { InvariantViolation } from './journey';

/** 第一版只有两个。列在这里的都是**已经实现**的 —— 不为将来占位。 */
export const RENDERER_TYPES = ['narrative', 'gallery'] as const;
export type RendererType = (typeof RENDERER_TYPES)[number];

export function isRendererType(v: unknown): v is RendererType {
  return typeof v === 'string' && (RENDERER_TYPES as readonly string[]).includes(v);
}

/**
 * 渲染**代码**的版本。跟着代码走，不跟着配置走。
 *
 * 判断标准写死：**同一份 config 渲染出的视觉结果变了，就要升版本号。**
 * 修 bug 让它符合原本的意图不算；改默认间距算。
 *
 * 升了之后旧 Publication 继续用旧渲染器 —— 那是「保留当时的表达」的一部分。
 */
export const RENDERER_VERSIONS: Readonly<Record<RendererType, number>> = {
  narrative: 1,
  gallery: 1,
};

/** 配置**结构**的版本。结构变了需要迁移函数，值变了不需要。 */
export const PRESENTATION_SCHEMA_VERSION = 1;

// ── 配置 ─────────────────────────────────────────────────────────────────────

/** 文字与理解主导 */
export interface NarrativeConfig {
  readonly _v: 1;
  readonly renderer: 'narrative';
  readonly contentWidth: 'reading' | 'wide';
  readonly theme: 'clean' | 'paper';
  readonly imageTreatment: 'inline' | 'full-width';
  readonly momentStyle: 'card' | 'seamless';
}

/** 素材与视觉节奏主导 */
export interface GalleryConfig {
  readonly _v: 1;
  readonly renderer: 'gallery';
  readonly columns: 2 | 3;
  readonly imageFit: 'contain' | 'cover';
  readonly captionMode: 'below' | 'minimal';
  readonly textDensity: 'full' | 'compact';
}

export type PresentationConfig = NarrativeConfig | GalleryConfig;

export const DEFAULT_NARRATIVE_CONFIG: NarrativeConfig = {
  _v: 1,
  renderer: 'narrative',
  contentWidth: 'reading',
  theme: 'clean',
  imageTreatment: 'inline',
  momentStyle: 'seamless',
};

export const DEFAULT_GALLERY_CONFIG: GalleryConfig = {
  _v: 1,
  renderer: 'gallery',
  columns: 2,
  imageFit: 'cover',
  captionMode: 'below',
  textDensity: 'compact',
};

export function defaultConfigFor(renderer: RendererType): PresentationConfig {
  return renderer === 'narrative' ? DEFAULT_NARRATIVE_CONFIG : DEFAULT_GALLERY_CONFIG;
}

/**
 * 每个字段的合法取值。写成数据而不是一串 if ——
 * UI 的下拉框也读它，措辞和校验就不可能不一致。
 */
export const PRESENTATION_FIELDS: Readonly<
  Record<RendererType, readonly { key: string; label: string; options: readonly string[] }[]>
> = {
  narrative: [
    { key: 'contentWidth', label: '正文宽度', options: ['reading', 'wide'] },
    { key: 'theme', label: '主题', options: ['clean', 'paper'] },
    { key: 'imageTreatment', label: '图片处理', options: ['inline', 'full-width'] },
    { key: 'momentStyle', label: 'Moment 样式', options: ['card', 'seamless'] },
  ],
  gallery: [
    { key: 'columns', label: '栏数', options: ['2', '3'] },
    { key: 'imageFit', label: '图片裁切', options: ['contain', 'cover'] },
    { key: 'captionMode', label: '说明文字', options: ['below', 'minimal'] },
    { key: 'textDensity', label: '文字密度', options: ['full', 'compact'] },
  ],
};

/**
 * 运行时校验 —— 写入、发布、渲染三处都要调（ADR-010 R4）。
 *
 * 只在写入处校验是不够的：数据库里可能有迁移脚本写进去的行，
 * 也可能有旧结构的历史数据。渲染时拿到形状不对的 config，
 * 要么崩，要么静默用默认值 —— 后者更糟，用户会以为自己的设置丢了。
 *
 * 规则：**未知字段丢弃，缺失字段补默认，非法枚举值报错。**
 *
 * 丢弃未知字段而不是报错，是因为降级（renderer@2 → @1）时会遇到多出来的
 * 字段，那不该让整页打不开。但**枚举值非法必须报错** ——
 * 那说明有人在往里塞不属于表现的东西。
 */
export function parsePresentationConfig(
  renderer: RendererType,
  raw: unknown
): PresentationConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = defaultConfigFor(renderer) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { _v: 1, renderer };

  for (const field of PRESENTATION_FIELDS[renderer]) {
    const value = src[field.key];
    if (value === undefined || value === null) {
      out[field.key] = base[field.key];
      continue;
    }
    const text = String(value);
    if (!field.options.includes(text)) {
      throw new InvariantViolation(
        'PR-1',
        `${renderer}.${field.key} 只能是 ${field.options.join(' / ')}，收到 ${JSON.stringify(value)}`
      );
    }
    // columns 是数字，其余是字符串。只有它需要转回来。
    out[field.key] = field.key === 'columns' ? Number(text) : text;
  }

  return out as unknown as PresentationConfig;
}

/**
 * 已发布快照里的表现信息。
 *
 * 四个字段缺一不可 —— 少了 rendererVersion，半年后改一次渲染代码，
 * 旧 Publication 的外观就跟着变了，而 JSON 一个字节都没动。
 */
export interface FrozenPresentation {
  readonly rendererType: RendererType;
  readonly rendererVersion: number;
  readonly presentationSchemaVersion: number;
  readonly config: PresentationConfig;
}

export function freezePresentation(
  renderer: RendererType,
  config: PresentationConfig
): FrozenPresentation {
  return {
    rendererType: renderer,
    rendererVersion: RENDERER_VERSIONS[renderer],
    presentationSchemaVersion: PRESENTATION_SCHEMA_VERSION,
    config: parsePresentationConfig(renderer, config),
  };
}

/**
 * 选渲染器。选不到就报错，**绝不回退到最新版**。
 *
 * 回退到最新版正是 rendererVersion 要防的事：那等于说
 * 「我们保存了你当时的配置，但用今天的代码渲染」——
 * 而视觉结果可能完全不同。
 */
export function assertRendererAvailable(frozen: FrozenPresentation): void {
  const current = RENDERER_VERSIONS[frozen.rendererType];
  if (current === undefined) {
    throw new InvariantViolation('PR-2', `未知的 renderer ${frozen.rendererType}`);
  }
  if (frozen.rendererVersion > current) {
    throw new InvariantViolation(
      'PR-2',
      `这篇发布用的是 ${frozen.rendererType}@${frozen.rendererVersion}，` +
        `当前代码只到 @${current} —— 不能用新渲染器冒充旧的`
    );
  }
}
