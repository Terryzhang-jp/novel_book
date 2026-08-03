/**
 * AudioDeriver 的实现 —— ffmpeg 重新编码
 *
 * ## 为什么是「重新编码」而不是「删掉标签」
 *
 * 音频容器里的身份信息比想象的多：设备型号、录音软件、创建时间，
 * 某些格式还带位置标签和厂商私有段。逐个删已知字段挡不住私有扩展 ——
 * 格式很多，扩展更多，漏掉一个就是漏掉。
 *
 * 解码成 PCM 再重新编码之后，能穿过来的只有声音本身。这和图片走
 * sharp 重新编码是同一个思路（ADR-008 A8）。
 *
 * ## 参数是产品决定，不是技术细节
 *
 *   Opus / Ogg   开放格式，同码率下语音质量最好，浏览器普遍支持
 *   单声道        这一版的音频是「现场速记」，不是立体声作品。
 *                 双声道翻倍的字节换不来对应的信息量。
 *                 **代价**：环境录音的空间感会丢失 —— 这是已知取舍，
 *                 将来做立体声就是一个新预设名，不是改这里的参数。
 *   48kHz        Opus 的原生采样率，重采样到别的值只会多一次转换
 *   64kbps       语音清晰的下限之上，一小时录音约 28MB
 *
 * 改任何一个参数都必须换一个新的 preset 名（audio_opus64 → …），
 * 否则旧的发布副本会被追溯解释成新参数。
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import type { AudioDeriver, DerivedAudio } from '@tc/application';

const run = promisify(execFile);

/** 一段录音最长转多久。超时说明输入有问题，不该把工作进程一直占着。 */
const TIMEOUT_MS = 120_000;

/** 输出上限，防御性：一个畸形输入不该产出一个几 GB 的文件 */
const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;

/**
 * 优先用系统 ffmpeg（部署镜像里通常已经有），否则用打包的静态二进制。
 *
 * 两者都找不到就**明确失败**。回退到「跳过音频」会让这个缺口悄悄回来 ——
 * 而它正是 15C 要关掉的那一个。
 */
function ffmpegPath(): string {
  const configured = process.env.FFMPEG_PATH ?? ffmpegStatic;
  if (!configured) {
    throw new Error(
      '找不到 ffmpeg。音频发布需要它 —— 设置 FFMPEG_PATH，或确认 ffmpeg-static 已安装。'
    );
  }
  return configured;
}

export class FfmpegAudioDeriver implements AudioDeriver {
  async derive(bytes: Uint8Array): Promise<DerivedAudio> {
    // ffmpeg 对管道输入的 seek 支持很差，很多容器（m4a 的 moov 在文件尾）
    // 会直接失败。走临时文件，用完即删。
    const dir = await mkdtemp(join(tmpdir(), 'tc-audio-'));
    const input = join(dir, 'in');
    const output = join(dir, 'out.opus');

    try {
      await writeFile(input, bytes);

      await run(
        ffmpegPath(),
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', input,

          // ⭐ 剥离元数据的三行。
          // -map_metadata -1 丢掉容器级标签；-map_chapters -1 丢掉章节
          // （里面可能有标题文字）；-vn 丢掉内嵌封面 —— 封面是一张完整的
          // 图片，它自己就带 EXIF。
          '-map_metadata', '-1',
          '-map_chapters', '-1',
          '-vn',

          '-c:a', 'libopus',
          '-b:a', '64k',
          '-ac', '1',
          '-ar', '48000',
          // Opus 对语音有专门的分析模式
          '-application', 'audio',

          '-f', 'ogg',
          '-y', output,
        ],
        { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }
      );

      const out = await readFile(output);
      if (out.byteLength === 0) {
        throw new Error('转码产出空文件 —— 输入可能不是有效音频');
      }
      if (out.byteLength > MAX_OUTPUT_BYTES) {
        throw new Error('转码结果过大，拒绝发布');
      }

      // 时长从**输出**文件读，不是输入。发布页上的播放器读的是这一份，
      // 两者理论上应该一致，不一致时以实际发出去的为准。
      const durationMs = await this.probeDurationMs(output);

      return { bytes: new Uint8Array(out), mimeType: 'audio/ogg', durationMs };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * 用 ffmpeg 自己读时长。
   *
   * 不额外依赖 ffprobe：ffmpeg-static 只提供 ffmpeg 一个二进制，
   * 再引一个包会让部署多一份东西要管。
   * `-f null -` 把整个文件解一遍，stderr 里的最后一个 time= 就是总时长。
   */
  private async probeDurationMs(path: string): Promise<number> {
    const { stderr } = await run(
      ffmpegPath(),
      ['-nostdin', '-hide_banner', '-i', path, '-f', 'null', '-'],
      { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
    ).catch((err: { stderr?: string }) => ({ stderr: err.stderr ?? '' }));

    const matches = [...String(stderr).matchAll(/time=(\d+):(\d{2}):(\d{2})\.(\d{2})/g)];
    const last = matches.at(-1);
    if (!last) {
      // A-3 的同款要求：读不出时长就明确失败，而不是存一个 0
      // 然后在播放器里表现成损坏文件。
      throw new Error('无法读取转码后音频的时长');
    }
    const [, h, m, sec, cs] = last;
    const ms =
      Number(h) * 3_600_000 + Number(m) * 60_000 + Number(sec) * 1000 + Number(cs) * 10;
    if (ms <= 0) throw new Error('转码后音频时长为 0');
    return ms;
  }
}
