/**
 * API 守卫 — 鉴权、文件校验、限流
 *
 * 背景：性能与安全审计（PERFORMANCE-AUDIT.md 第七组）发现 11 个 API 路由
 * 没有任何鉴权，其中 4 个可被任意人调用消耗 AI 额度或写入对象存储。
 * 这个模块提供统一入口，避免每个路由各写一遍（写漏一个就是一个洞）。
 *
 * 用法：
 *   const guard = await requireApiAuth(req);
 *   if (guard.response) return guard.response;   // 401，直接返回
 *   const userId = guard.session.userId;
 */

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/helpers";

// ============================================================
// 鉴权
// ============================================================

export interface ApiSession {
  userId: string;
  email: string;
}

export type GuardResult =
  | { response: NextResponse; session: null }
  | { response: null; session: ApiSession };

/**
 * 要求请求已登录。未登录返回 401 Response（调用方直接 return）。
 *
 * 不抛异常，因为路由里的 try/catch 经常把 401 吞成 500。
 */
export async function requireApiAuth(req: Request): Promise<GuardResult> {
  const session = await getSessionFromRequest(req);

  if (!session?.user?.id) {
    return {
      response: NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
      session: null,
    };
  }

  return {
    response: null,
    session: { userId: session.user.id, email: session.user.email },
  };
}

// ============================================================
// 文件校验
// ============================================================

/** 允许上传的图片类型 */
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/**
 * 通过文件头 magic bytes 判断真实类型。
 *
 * 不能相信 Content-Type 请求头或文件扩展名 —— 两者都由客户端控制。
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";

  // GIF: "GIF87a" / "GIF89a"
  if (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a") {
    return "image/gif";
  }

  // RIFF....WEBP
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }

  // ISO-BMFF (HEIC/HEIF): 前 4 字节是 box size，接着 "ftyp"，再看 brand
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
  }

  return null;
}

export interface FileCheckOptions {
  /** 最大字节数，默认 10 MB */
  maxBytes?: number;
  /** 允许的 MIME，默认为图片集合 */
  allowed?: Set<string>;
}

export type FileCheckResult =
  | { response: NextResponse; mime: null }
  | { response: null; mime: string };

/**
 * 校验上传内容：大小 + 真实 MIME。
 *
 * 返回的 mime 是嗅探出来的真实类型，调用方应该用它而不是用户提供的 Content-Type。
 */
export function checkUploadedImage(
  buf: Buffer,
  options: FileCheckOptions = {}
): FileCheckResult {
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const allowed = options.allowed ?? ALLOWED_IMAGE_MIME;

  if (buf.length === 0) {
    return {
      response: NextResponse.json({ error: "Empty file", code: "EMPTY_FILE" }, { status: 400 }),
      mime: null,
    };
  }

  if (buf.length > maxBytes) {
    return {
      response: NextResponse.json(
        {
          error: `File too large (max ${Math.floor(maxBytes / 1024 / 1024)}MB)`,
          code: "FILE_TOO_LARGE",
        },
        { status: 413 }
      ),
      mime: null,
    };
  }

  const mime = sniffImageMime(buf);
  if (!mime || !allowed.has(mime)) {
    return {
      response: NextResponse.json(
        { error: "Unsupported file type", code: "UNSUPPORTED_TYPE" },
        { status: 415 }
      ),
      mime: null,
    };
  }

  return { response: null, mime };
}

/**
 * 清洗文件名：只保留基本名，去掉路径分隔符和控制字符。
 * 防止 `../` 之类的路径穿越进入对象存储 key。
 */
export function sanitizeFileName(raw: string, fallback = "upload"): string {
  const base = raw.split(/[/\\]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 有意剥离控制字符
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w.\- ]/g, "_")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned.slice(0, 120);
}

// ============================================================
// 限流（内存版）
// ============================================================

/**
 * 进程内滑动窗口限流。
 *
 * 局限：Serverless 每个实例一份计数，不是全局精确限流。
 * 但它能挡住单实例上的暴力刷取，且零依赖、零配置。
 * 需要精确全局限流时换成 Upstash（项目已装 @upstash/ratelimit）。
 */
const buckets = new Map<string, number[]>();

export interface RateLimitOptions {
  /** 窗口内最大请求数 */
  limit: number;
  /** 窗口长度（毫秒） */
  windowMs: number;
}

export function rateLimit(key: string, options: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  const windowStart = now - options.windowMs;

  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (hits.length >= options.limit) {
    const retryAfter = Math.ceil((hits[0] + options.windowMs - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  hits.push(now);
  buckets.set(key, hits);

  // 防止 map 无限增长：超过 5000 个 key 时清掉空桶
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.filter((t) => t > windowStart).length === 0) buckets.delete(k);
    }
  }

  return null;
}

/**
 * 鉴权 + 按用户限流的组合守卫，用于昂贵的 AI 接口。
 */
export async function requireAuthWithRateLimit(
  req: Request,
  scope: string,
  options: RateLimitOptions
): Promise<GuardResult> {
  const guard = await requireApiAuth(req);
  if (guard.response) return guard;

  const limited = rateLimit(`${scope}:${guard.session.userId}`, options);
  if (limited) return { response: limited, session: null };

  return guard;
}
