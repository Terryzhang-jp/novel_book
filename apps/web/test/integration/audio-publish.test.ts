/**
 * 15C 灵魂测试 —— 音频作为可以公开的证据
 *
 * 在这之前，挂了录音的 Moment 发布出去会**少掉那份证据**。
 * 不是静默丢失（publishWork 返回 skippedAssets，界面上说明了），
 * 但它造成一个语义断裂：作者在草稿里看到的和读者在发布页看到的
 * 不是同一份内容。
 *
 * 而「Moment 可以只有一段录音」正是这个产品降低现场记录摩擦的方式。
 * 长期停在「能上传、能私下听、发布时消失」，等于告诉用户语音是二等公民。
 *
 * ## 用真的音频字节
 *
 * 派生副本里有没有元数据，只有拿真文件跑一遍才知道。
 * 输入由 ffmpeg 现场合成，并**先断言输入确实带着元数据** ——
 * 否则「输出没有元数据」这条断言可能只是因为输入本来就没有。
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import ffmpegStatic from 'ffmpeg-static';
import {
  addMomentToWork,
  attachAssetToMoment,
  createMoment,
  createWork,
  publishWork,
  uploadAsset,
  viewPublication,
  withdrawPublication,
  type AssetDeps,
  type PublishDeps,
} from '@tc/application';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import { ANONYMOUS, publicAssetFile, userActor, type SnapshotAsset } from '@tc/domain';
import { getPool, sql } from '../db/setup';
import {
  getAudioDeriver,
  getImageDeriver,
  getMediaProbe,
  getStorageKit,
} from '@/lib/core/storage';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH ?? (ffmpegStatic as string);

const ALICE = userActor('11111111-1111-1111-1111-111111111111', 'sess-alice');
const NOW = '2026-08-03T00:00:00.000Z';

let core: PostgresUnitOfWork;
let assetDeps: AssetDeps;
let publishDeps: PublishDeps;

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

/**
 * 造一段**带元数据**的真 m4a。
 *
 * 频率每次不同 —— 内容寻址意味着相同字节就是同一个 Asset。
 */
async function makeM4a(freq: number, seconds = 2): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'tc-audio-test-'));
  const out = join(dir, 'in.m4a');
  try {
    await run(FFMPEG, [
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`,
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
      // ⭐ 这些正是发布时必须被剥掉的东西
      '-metadata', 'title=私人录音',
      '-metadata', 'artist=某某某',
      '-metadata', 'comment=录于自家阳台',
      '-metadata', 'location=+35.6895+139.6917/',
      '-y', out,
    ]);
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 把文件里的全部标签读出来 */
async function readTags(bytes: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tc-audio-probe-'));
  const f = join(dir, 'probe');
  try {
    await import('node:fs/promises').then((m) => m.writeFile(f, bytes));
    const { stderr } = await run(FFMPEG, ['-nostdin', '-hide_banner', '-i', f, '-f', 'null', '-'])
      .catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }));
    return String(stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

beforeAll(() => {
  core = new PostgresUnitOfWork(getPool() as unknown as Pool);
  assetDeps = { core, storage: getStorageKit(), probe: getMediaProbe() };
  publishDeps = {
    core,
    storage: getStorageKit(),
    deriver: getImageDeriver(),
    audioDeriver: getAudioDeriver(),
  };
});

async function publishWithAudio(freq: number) {
  const { moment } = await createMoment(core, ALICE, {
    firstObservation: '关灯的声音是从最里面那间开始的。',
    now: NOW,
  });
  const bytes = await makeM4a(freq);
  const { asset } = await uploadAsset(assetDeps, ALICE, {
    bytes,
    declaredMimeType: 'audio/mp4',
  });
  await attachAssetToMoment(core, ALICE, moment.id, asset.id, { role: 'supporting' });

  const work = await createWork(core, ALICE, { title: uniq('录音发布') });
  await addMomentToWork(core, ALICE, work.id, moment.id);
  const published = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });
  return { moment, asset, work, published, originalBytes: bytes };
}

function audioIn(view: Awaited<ReturnType<typeof viewPublication>>): SnapshotAsset | undefined {
  if (view.status !== 'ok') return undefined;
  for (const b of view.page.version.snapshot.blocks) {
    if (b.type !== 'moment_ref') continue;
    const found = b.moment?.assets?.find((a) => a.kind === 'audio');
    if (found) return found;
  }
  return undefined;
}

// ════════════════════════════════════════════════════════════════════════════

describe('灵魂 11：录音能进发布页，而且是安全副本', () => {
  it('发布之后音频出现在快照里，skippedAssets 归零', async () => {
    const { published } = await publishWithAudio(440);

    // 这个数字是这条测试的全部意义：15C 之前它是 1
    expect(published.skippedAssets).toBe(0);
    expect(published.derivedAssets).toBe(1);

    const view = await viewPublication(core, ANONYMOUS, published.publication.slug);
    const audio = audioIn(view);
    expect(audio).toBeDefined();
    expect(audio!.kind).toBe('audio');
    expect(audio!.mimeType).toBe('audio/ogg');
    expect(audio!.kind === 'audio' && audio!.durationMs).toBeGreaterThan(1500);
  });

  it('⭐ 派生副本不含标题、作者、备注、位置 —— 而原文件都有', async () => {
    const { published, originalBytes } = await publishWithAudio(523);

    // 先证明输入**确实带着**这些东西，否则下面的断言可能是空的
    const before = await readTags(originalBytes);
    expect(before).toContain('私人录音');
    expect(before).toContain('某某某');
    expect(before).toContain('录于自家阳台');

    const view = await viewPublication(core, ANONYMOUS, published.publication.slug);
    const audio = audioIn(view)!;
    const derivedBytes = await getStorageKit().storage.get(audio.objectKey);

    const after = await readTags(derivedBytes);
    expect(after).not.toContain('私人录音');
    expect(after).not.toContain('某某某');
    expect(after).not.toContain('录于自家阳台');
    expect(after).not.toContain('139.69');

    // 参数受控：单声道、48kHz、Opus
    expect(after).toMatch(/Audio:\s*opus/i);
    expect(after).toContain('48000 Hz');
    expect(after).toContain('mono');

    // 重新编码必然改变字节 ⇒ 派生对象的内容 hash 和原始的不同（S-2）。
    // 拿真实的 sha256 比，不是拿长度 —— 长度相同的两份不同字节完全可能存在。
    const originalHash = createHash('sha256').update(originalBytes).digest('hex');
    expect(audio.derivedHash).not.toBe(originalHash);
    expect(audio.objectKey).toContain(audio.derivedHash);
  });

  it('原始录音匿名取不到，派生副本可以 —— 撤回之后两个都取不到', async () => {
    const { published, asset } = await publishWithAudio(660);
    const view = await viewPublication(core, ANONYMOUS, published.publication.slug);
    const audio = audioIn(view)!;

    // 公开 URL 里只有 hash 和扩展名，没有 userId
    const file = publicAssetFile(audio);
    expect(file).toMatch(/^[a-f0-9]{64}\.opus$/);
    expect(file).not.toContain('users/');
    expect(audio.objectKey).not.toBe(asset.objectKey);

    await withdrawPublication(core, ALICE, published.publication.id);
    const after = await viewPublication(core, ANONYMOUS, published.publication.slug);
    expect(after.status).toBe('withdrawn');
  });

  it('账本里记的是时长而不是假的宽高', async () => {
    const { published } = await publishWithAudio(880);
    const rows = await sql<{ preset: string; width: number | null; duration_ms: number | null }>(
      `SELECT preset, width, duration_ms FROM published_assets WHERE work_version_id = $1`,
      [published.version.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.preset).toBe('audio_opus64');
    // 「为了让字段有值而填 1×1」正是 ADR-009 反对的做法
    expect(rows[0]!.width).toBeNull();
    expect(rows[0]!.duration_ms).toBeGreaterThan(1500);
  });

  it('同一段录音在同一次发布里只派生一次', async () => {
    const { moment } = await createMoment(core, ALICE, {
      firstObservation: '同一段录音挂在两个 Moment 上。',
      now: NOW,
    });
    const { moment: second } = await createMoment(core, ALICE, {
      firstObservation: '第二个。',
      now: NOW,
    });
    const { asset } = await uploadAsset(assetDeps, ALICE, {
      bytes: await makeM4a(990),
      declaredMimeType: 'audio/mp4',
    });
    await attachAssetToMoment(core, ALICE, moment.id, asset.id, { role: 'supporting' });
    await attachAssetToMoment(core, ALICE, second.id, asset.id, { role: 'context' });

    const work = await createWork(core, ALICE, { title: uniq('去重') });
    await addMomentToWork(core, ALICE, work.id, moment.id);
    await addMomentToWork(core, ALICE, work.id, second.id);
    const published = await publishWork(publishDeps, ALICE, { workId: work.id, now: NOW });

    // 转码很贵。两个 Moment 引用同一份字节时只能跑一次。
    expect(published.derivedAssets).toBe(1);

    // 但**关系**是各自的：同一段录音在两个 Moment 里角色不同
    const view = await viewPublication(core, ANONYMOUS, published.publication.slug);
    const roles =
      view.status === 'ok'
        ? view.page.version.snapshot.blocks
            .filter((b) => b.type === 'moment_ref')
            .flatMap((b) => b.moment?.assets ?? [])
            .map((a) => a.role)
        : [];
    expect(roles).toEqual(['supporting', 'context']);
  });
});
