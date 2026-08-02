/**
 * 行 → 领域对象的映射
 *
 * ## 一条从事故里学来的规则
 *
 * 旧系统的 Gallery bug 是这样发生的：某个方法的 SELECT 少取了两列，
 * 映射函数读到 `undefined` 就当成「没有值」，于是照片的地点和元数据
 * 在那个页面上静默消失。没有报错，没有日志，只有用户说「我的照片信息没了」。
 *
 * 所以这里区分两种 undefined：
 *
 *   `undefined`  这一列**没被 SELECT 出来** → 抛错，这是代码 bug
 *   `null`       数据库里就是空 → 正常，映射成可选字段缺失
 *
 * 每个表的列清单写成常量，所有查询共用 —— 「某个方法漏列」这种错误
 * 不可能再发生：要么都有，要么都没有。
 */

import type {
  InterpretationRevision,
  InterpretationStatus,
  Journey,
  JourneyType,
  Moment,
  MomentProvenance,
  MomentTombstone,
  Observation,
  PresentationConfig,
  Publication,
  RendererType,
  Visibility,
  Work,
  WorkBlock,
  WorkBlockType,
  WorkPresentation,
  WorkSnapshot,
  WorkVersion,
} from '@tc/domain';

/**
 * 给列清单加表别名：`prefixed(WORK_COLUMNS, 'w')` → `w.id, w.user_id, ...`
 *
 * JOIN 查询里必须写别名，否则 `id` 会有歧义。写成函数而不是再抄一份带别名的
 * 常量 —— 抄一份就意味着改列时要改两处，而漏改的那处会静默返回错误的数据。
 */
export function prefixed(columns: string, alias: string): string {
  return columns
    .split(',')
    .map((c) => `${alias}.${c.trim()}`)
    .join(', ');
}

export class RowMappingError extends Error {
  readonly code = 'ROW_MAPPING_ERROR' as const;
  constructor(table: string, column: string) {
    super(
      `${table}.${column} 是 undefined —— 这一列没有被 SELECT 出来。` +
        '这是代码缺陷，不是数据问题。检查查询是否用了共享的 COLUMNS 常量。'
    );
    this.name = 'RowMappingError';
  }
}

/** 必须存在（可以是 null，但不能是 undefined） */
function present<T>(table: string, column: string, value: T | undefined): T {
  if (value === undefined) throw new RowMappingError(table, column);
  return value;
}

/** 必须存在且非空 */
function required<T>(table: string, column: string, value: T | null | undefined): T {
  const v = present(table, column, value);
  if (v === null) throw new RowMappingError(table, column);
  return v;
}

/**
 * timestamptz → ISO 字符串。
 *
 * pg 把 timestamptz 解析成 Date。领域层用字符串 —— 因为快照要被 JSON 化，
 * 而 Date 在 JSON 里本来就是字符串。在边界上统一，比在十几个地方各转一次好。
 *
 * 行类型里时间列的类型是 `Date | string`，因为两条路径给的东西不一样：
 * 直接 SELECT 拿到 Date，JOIN 查询用 `to_jsonb(row)` 取整行拿到 ISO 字符串。
 * 只写 Date 的话，JOIN 路径会静默产出 Invalid Date。
 */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function optIso(value: Date | string | null): string | undefined {
  return value === null ? undefined : toIso(value);
}

function opt<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

// ════════════════════════════════════════════════════════════════════════════
// Journey
// ════════════════════════════════════════════════════════════════════════════

export const JOURNEY_COLUMNS =
  'id, user_id, title, type, intent, started_at, ended_at, created_at, updated_at';

export interface JourneyRow {
  id: string;
  user_id: string;
  title: string;
  type: string;
  intent: string | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapJourney(row: JourneyRow): Journey {
  const t = 'journeys';
  return {
    id: required(t, 'id', row.id),
    userId: required(t, 'user_id', row.user_id),
    title: required(t, 'title', row.title),
    type: required(t, 'type', row.type) as JourneyType,
    ...optionalField('intent', opt(present(t, 'intent', row.intent))),
    startedAt: toIso(required(t, 'started_at', row.started_at)),
    ...optionalField('endedAt', optIso(present(t, 'ended_at', row.ended_at))),
    createdAt: toIso(required(t, 'created_at', row.created_at)),
    updatedAt: toIso(required(t, 'updated_at', row.updated_at)),
  };
}

/**
 * 可选字段的展开。
 *
 * 写成 `intent: undefined` 和「没有 intent 这个键」在 JSON 序列化后是不同的，
 * 而快照要逐字节可比。所以缺失就真的不放这个键。
 */
function optionalField<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : ({ [key]: value } as Record<string, T>);
}

// ════════════════════════════════════════════════════════════════════════════
// Moment
// ════════════════════════════════════════════════════════════════════════════

export const MOMENT_COLUMNS =
  'id, user_id, journey_id, title, occurred_at, place_label, provenance, created_at, updated_at';

export interface MomentRow {
  id: string;
  user_id: string;
  journey_id: string | null;
  title: string | null;
  occurred_at: Date | string | null;
  place_label: string | null;
  provenance: MomentProvenance;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapMoment(row: MomentRow): Moment {
  const t = 'moments';
  return {
    id: required(t, 'id', row.id),
    userId: required(t, 'user_id', row.user_id),
    ...optionalField('journeyId', opt(present(t, 'journey_id', row.journey_id))),
    ...optionalField('title', opt(present(t, 'title', row.title))),
    ...optionalField('occurredAt', optIso(present(t, 'occurred_at', row.occurred_at))),
    ...optionalField('placeLabel', opt(present(t, 'place_label', row.place_label))),
    provenance: required(t, 'provenance', row.provenance),
    createdAt: toIso(required(t, 'created_at', row.created_at)),
    updatedAt: toIso(required(t, 'updated_at', row.updated_at)),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Observation
// ════════════════════════════════════════════════════════════════════════════

export const OBSERVATION_COLUMNS = 'id, moment_id, user_id, content, recorded_at, created_at';

export interface ObservationRow {
  id: string;
  moment_id: string;
  user_id: string;
  content: string;
  recorded_at: Date | string;
  created_at: Date | string;
}

export function mapObservation(row: ObservationRow): Observation {
  const t = 'observations';
  return {
    id: required(t, 'id', row.id),
    momentId: required(t, 'moment_id', row.moment_id),
    userId: required(t, 'user_id', row.user_id),
    content: required(t, 'content', row.content),
    recordedAt: toIso(required(t, 'recorded_at', row.recorded_at)),
    createdAt: toIso(required(t, 'created_at', row.created_at)),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Interpretation
// ════════════════════════════════════════════════════════════════════════════

export const INTERPRETATION_COLUMNS =
  'id, moment_id, user_id, content, supersedes_id, based_on_observation_ids, status, created_at';

export interface InterpretationRow {
  id: string;
  moment_id: string;
  user_id: string;
  content: string;
  supersedes_id: string | null;
  based_on_observation_ids: string[];
  status: string;
  created_at: Date | string;
}

export function mapInterpretation(row: InterpretationRow): InterpretationRevision {
  const t = 'interpretation_revisions';
  return {
    id: required(t, 'id', row.id),
    momentId: required(t, 'moment_id', row.moment_id),
    userId: required(t, 'user_id', row.user_id),
    content: required(t, 'content', row.content),
    ...optionalField('supersedesId', opt(present(t, 'supersedes_id', row.supersedes_id))),
    basedOnObservationIds: required(
      t,
      'based_on_observation_ids',
      row.based_on_observation_ids
    ),
    status: required(t, 'status', row.status) as InterpretationStatus,
    createdAt: toIso(required(t, 'created_at', row.created_at)),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Work
// ════════════════════════════════════════════════════════════════════════════

export const WORK_COLUMNS = 'id, user_id, title, created_at, updated_at';

export interface WorkRow {
  id: string;
  user_id: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapWork(row: WorkRow): Work {
  const t = 'works';
  return {
    id: required(t, 'id', row.id),
    userId: required(t, 'user_id', row.user_id),
    title: required(t, 'title', row.title),
    createdAt: toIso(required(t, 'created_at', row.created_at)),
    updatedAt: toIso(required(t, 'updated_at', row.updated_at)),
  };
}

export const WORK_BLOCK_COLUMNS =
  'id, work_id, position, type, text_content, moment_id, tombstone, created_at, updated_at';

export interface WorkBlockRow {
  id: string;
  work_id: string;
  position: number;
  type: string;
  text_content: string | null;
  moment_id: string | null;
  tombstone: MomentTombstone | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapWorkBlock(row: WorkBlockRow): WorkBlock {
  const t = 'work_blocks';
  return {
    id: required(t, 'id', row.id),
    workId: required(t, 'work_id', row.work_id),
    position: required(t, 'position', row.position),
    type: required(t, 'type', row.type) as WorkBlockType,
    ...optionalField('textContent', opt(present(t, 'text_content', row.text_content))),
    ...optionalField('momentId', opt(present(t, 'moment_id', row.moment_id))),
    ...optionalField('tombstone', opt(present(t, 'tombstone', row.tombstone))),
    createdAt: toIso(required(t, 'created_at', row.created_at)),
    updatedAt: toIso(required(t, 'updated_at', row.updated_at)),
  };
}

export const WORK_PRESENTATION_COLUMNS =
  'id, work_id, renderer_type, config, created_at, updated_at';

export interface WorkPresentationRow {
  id: string;
  work_id: string;
  renderer_type: string;
  config: PresentationConfig;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapWorkPresentation(row: WorkPresentationRow): WorkPresentation {
  const t = 'work_presentations';
  return {
    id: required(t, 'id', row.id),
    workId: required(t, 'work_id', row.work_id),
    rendererType: required(t, 'renderer_type', row.renderer_type) as RendererType,
    config: required(t, 'config', row.config),
    createdAt: toIso(required(t, 'created_at', row.created_at)),
    updatedAt: toIso(required(t, 'updated_at', row.updated_at)),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Version / Publication
// ════════════════════════════════════════════════════════════════════════════

export const WORK_VERSION_COLUMNS =
  'id, work_id, user_id, version_number, snapshot, created_at';

export interface WorkVersionRow {
  id: string;
  work_id: string | null;
  user_id: string;
  version_number: number;
  snapshot: WorkSnapshot;
  created_at: Date | string;
}

export function mapWorkVersion(row: WorkVersionRow): WorkVersion {
  const t = 'work_versions';
  return {
    id: required(t, 'id', row.id),
    ...optionalField('workId', opt(present(t, 'work_id', row.work_id))),
    userId: required(t, 'user_id', row.user_id),
    versionNumber: required(t, 'version_number', row.version_number),
    snapshot: required(t, 'snapshot', row.snapshot),
    createdAt: toIso(required(t, 'created_at', row.created_at)),
  };
}

export const PUBLICATION_COLUMNS =
  'id, work_version_id, user_id, slug, visibility, published_at, withdrawn_at';

export interface PublicationRow {
  id: string;
  work_version_id: string;
  user_id: string;
  slug: string;
  visibility: string;
  published_at: Date | string;
  withdrawn_at: Date | string | null;
}

export function mapPublication(row: PublicationRow): Publication {
  const t = 'publications';
  return {
    id: required(t, 'id', row.id),
    workVersionId: required(t, 'work_version_id', row.work_version_id),
    userId: required(t, 'user_id', row.user_id),
    slug: required(t, 'slug', row.slug),
    visibility: required(t, 'visibility', row.visibility) as Visibility,
    publishedAt: toIso(required(t, 'published_at', row.published_at)),
    ...optionalField('withdrawnAt', optIso(present(t, 'withdrawn_at', row.withdrawn_at))),
  };
}
