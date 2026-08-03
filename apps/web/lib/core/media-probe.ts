/**
 * MediaProbe / ImageDeriver 的实现 —— sharp + exifr + music-metadata
 *
 * 放在 apps/web 而不是单开一个包：这三个依赖已经在这边，
 * 而这个 adapter 只有一个消费者。包的数量本身也是成本。
 *
 * ## 这个文件里最重要的一件事
 *
 * **不把没有时区的时间说成有时区的时间。**
 *
 * exifr 默认会把 `2026:08:03 14:35:00` 解析成 `Date` 对象 —— 而 `Date` 必然
 * 落在某个时区上，于是「相机所在地的 14:35」被悄悄说成了「服务器时区的
 * 14:35」。所以这里用 `reviveValues: false` 拿原始字符串自己处理。
 *
 * 这一行配置就是 ADR-009 的全部技术含量。
 */

import sharp from 'sharp';
import type { ImageDeriver, MediaProbe, ProbedMedia, DerivedImage } from '@tc/application';
import type { AssetType } from '@tc/domain';
import { sniffImageMime } from '@/lib/api/guard';

/** 原始元数据的体积上限。相机厂商的私有段能塞进几百 KB，没必要全存。 */
const MAX_ORIGINAL_METADATA_BYTES = 32 * 1024;

/**
 * 按魔术字节判定真实类型。
 *
 * 浏览器声明的 Content-Type 只作参考 —— 一个改了扩展名的可执行文件
 * 不该因为写着 image/jpeg 就被当成图片处理。
 *
 * 图片部分复用 lib/api/guard 里那份（已被单元测试覆盖），
 * 这里只补音频。
 */
function sniffMime(buf: Buffer): string | null {
  const image = sniffImageMime(buf);
  if (image) return image;
  if (buf.length < 12) return null;

  // RIFF....WAVE
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    return 'audio/wav';
  }
  // ID3 标签开头的 MP3
  if (buf.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg';
  // 裸 MPEG 帧同步：11 位全 1
  if (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0) return 'audio/mpeg';
  // ISO-BMFF 的音频 brand（m4a）
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (brand === 'M4A ' || brand === 'M4B ' || brand === 'mp42') return 'audio/mp4';
  }
  return null;
}

function typeOf(mime: string): AssetType | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return null;
}

/** `2026:08:03 14:35:00` → `2026-08-03T14:35:00`。失败返回 undefined，不猜。 */
function exifDateToLocalStamp(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/** `+09:00` / `-0500` / `Z` → 规范化的 `+09:00`。不认识就返回 undefined。 */
function normalizeOffset(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (s === 'Z' || s === '+00:00') return '+00:00';
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(s);
  return m ? `${m[1]}${m[2]}:${m[3]}` : undefined;
}

function boundedMetadata(raw: unknown): Record<string, unknown> {
  const base = { _v: 1 as const };
  if (!raw || typeof raw !== 'object') return base;
  const json = JSON.stringify(raw, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
  if (json && json.length <= MAX_ORIGINAL_METADATA_BYTES) {
    return { ...base, exif: JSON.parse(json) };
  }
  // 超限时保留最有价值的几项，并**记下自己截断过** ——
  // 静默丢弃会让将来排查「元数据怎么少了」无从下手
  const r = raw as Record<string, unknown>;
  return {
    ...base,
    truncated: true,
    exif: {
      Make: r.Make,
      Model: r.Model,
      LensModel: r.LensModel,
      DateTimeOriginal: r.DateTimeOriginal,
      OffsetTimeOriginal: r.OffsetTimeOriginal,
      latitude: r.latitude,
      longitude: r.longitude,
      Orientation: r.Orientation,
    },
  };
}

export class SharpMediaProbe implements MediaProbe {
  async probe(bytes: Uint8Array, declaredMimeType: string): Promise<ProbedMedia> {
    const buf = Buffer.from(bytes);
    const sniffed = sniffMime(buf);
    if (!sniffed) {
      throw new Error(
        `无法识别的文件类型（浏览器声明的是 ${declaredMimeType}，但字节头不匹配任何支持的格式）`
      );
    }
    const type = typeOf(sniffed);
    if (!type) throw new Error(`不支持的类型 ${sniffed}`);

    if (type === 'image') return this.probeImage(buf, sniffed);
    if (type === 'audio') return this.probeAudio(buf, sniffed);
    // video 走到这里由用例层拒绝（A-5），探测器本身不做产品决策
    return {
      type,
      mimeType: sniffed,
      timezoneSource: 'unknown',
      originalMetadata: { _v: 1 },
    };
  }

  private async probeImage(buf: Buffer, mimeType: string): Promise<ProbedMedia> {
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) {
      throw new Error('无法读取图片尺寸 —— 文件可能已损坏');
    }

    // exifr 是可选路径：没有 EXIF 的图片（截图、下载图）完全正常，
    // 不能因为读不到 EXIF 就让上传失败
    let raw: Record<string, unknown> | undefined;
    try {
      const exifr = await import('exifr');
      raw = (await exifr.parse(buf, {
        tiff: true,
        exif: true,
        gps: true,
        // ⭐ 关键：拿原始字符串，不让它变成 Date。
        // 变成 Date 就等于替相机决定了它在哪个时区（ADR-009）。
        reviveValues: false,
      })) as Record<string, unknown> | undefined;
    } catch {
      raw = undefined;
    }

    const capturedLocalAt = exifDateToLocalStamp(
      raw?.DateTimeOriginal ?? raw?.CreateDate ?? raw?.DateTime
    );
    const offset = normalizeOffset(raw?.OffsetTimeOriginal ?? raw?.OffsetTime);

    // EXIF 只给偏移量，给不了 IANA 时区名。
    // `+09:00` 可能是东京也可能是首尔 —— 猜一个就是伪造。
    // 所以 timezone 存偏移量本身：它是我们真正知道的东西。
    const timezone = capturedLocalAt && offset ? offset : undefined;
    const capturedAt =
      capturedLocalAt && offset
        ? new Date(`${capturedLocalAt}${offset}`).toISOString()
        : undefined;

    // 旋转后的显示尺寸。sharp 的 width/height 是存储尺寸，
    // EXIF Orientation 5–8 时宽高要对调 —— 不处理的话竖拍照片在页面上会横躺。
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = rotated ? meta.height : meta.width;
    const height = rotated ? meta.width : meta.height;

    return {
      type: 'image',
      mimeType,
      width,
      height,
      ...(capturedLocalAt ? { capturedLocalAt } : {}),
      ...(capturedAt ? { capturedAt } : {}),
      ...(timezone ? { timezone } : {}),
      timezoneSource: timezone ? 'exif' : 'unknown',
      originalMetadata: boundedMetadata(raw),
    };
  }

  private async probeAudio(buf: Buffer, mimeType: string): Promise<ProbedMedia> {
    // 动态 import：只有真的上传音频时才把这个包加载进来
    const { parseBuffer } = await import('music-metadata');
    const parsed = await parseBuffer(new Uint8Array(buf), { mimeType });
    const seconds = parsed.format.duration;
    if (!seconds || seconds <= 0) {
      // A-3 要求音频必须有时长。读不出来就明确失败，
      // 而不是存一个「时长未知」的行然后在播放器里表现成损坏文件。
      throw new Error('无法读取音频时长 —— 文件可能已损坏或格式不受支持');
    }
    return {
      type: 'audio',
      mimeType,
      durationMs: Math.round(seconds * 1000),
      timezoneSource: 'unknown',
      originalMetadata: boundedMetadata({
        container: parsed.format.container,
        codec: parsed.format.codec,
        sampleRate: parsed.format.sampleRate,
        numberOfChannels: parsed.format.numberOfChannels,
        bitrate: parsed.format.bitrate,
      }),
    };
  }
}

/**
 * 发布派生副本的生成 —— ADR-008 A8。
 *
 * 三件事必须同时做到，少一件这个副本就不能公开：
 *   1. 长边受控 —— 否则「发布」等于把 24MP 原图挂到公网
 *   2. 剥离全部元数据 —— GPS 会精确到用户家门口
 *   3. 统一格式 —— 派生对象也内容寻址，格式不统一会让同一张图产出多份
 */
export class SharpImageDeriver implements ImageDeriver {
  async derive(bytes: Uint8Array, options: { maxEdge: number }): Promise<DerivedImage> {
    const out = await sharp(Buffer.from(bytes))
      // 按 EXIF Orientation 实际旋转像素。派生副本不带 EXIF，
      // 所以方向信息必须在这一步烧进像素里，否则竖拍照片会横躺。
      .rotate()
      .resize({
        width: options.maxEdge,
        height: options.maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      // sharp 默认就不带入元数据（不调 .withMetadata() 即可），
      // 这里显式写出来是为了让「剥离元数据」这件事在代码里看得见。
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: new Uint8Array(out.data),
      mimeType: 'image/webp',
      width: out.info.width,
      height: out.info.height,
    };
  }
}
