/**
 * API Route: /api/locations/expand-url
 *
 * Expands a short Google Maps URL (e.g., https://maps.app.goo.gl/xyz) to its full URL.
 * This is done server-side because it requires following HTTP redirects, which can't
 * be done reliably on the client side due to CORS restrictions.
 *
 * Method: POST
 * Body: { url: string }
 * Response: { expandedUrl: string }
 *
 * ⚠️ 安全历史（PERFORMANCE-AUDIT.md 第七组 #9）：
 * 此前的白名单校验是 `url.includes('goo.gl')`，而不是比对 hostname。
 * 因此 `http://169.254.169.254/latest/meta-data/?x=goo.gl` 能通过校验并被
 * 服务端 fetch，构成 SSRF（可探测内网、访问云元数据端点，并从 Location
 * 响应头回显信息）。且该路由此前完全没有鉴权。
 *
 * 现在：精确 hostname 白名单 + 强制 https + 必须登录 + 限流。
 */

import { NextResponse } from 'next/server';
import { requireAuthWithRateLimit } from '@/lib/api/guard';

export const runtime = 'nodejs';

/** 只有这些 host 允许被服务端访问 */
const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
]);

type UrlVerdict =
  | { kind: 'passthrough' }               // 不是短链，原样返回，不发请求
  | { kind: 'expand'; url: URL }          // 允许展开
  | { kind: 'reject'; reason: string };   // 拒绝

function classifyUrl(raw: string): UrlVerdict {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { kind: 'reject', reason: 'Malformed URL' };
  }

  // 只允许 https —— 排除 file:, gopher:, http: 等常见 SSRF 载体
  if (parsed.protocol !== 'https:') {
    return { kind: 'reject', reason: 'Only https URLs are supported' };
  }

  // 精确比对 hostname，不用 includes()
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    // 不是已知的地图 host —— 不发任何请求，原样退回给客户端自己处理
    return { kind: 'passthrough' };
  }

  return { kind: 'expand', url: parsed };
}

/**
 * Expand a short URL by following redirects
 */
export async function POST(req: Request) {
  try {
    const guard = await requireAuthWithRateLimit(req, 'expand-url', {
      limit: 30,
      windowMs: 60_000,
    });
    if (guard.response) return guard.response;

    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    }

    if (url.length > 2048) {
      return NextResponse.json({ error: 'URL too long' }, { status: 413 });
    }

    const verdict = classifyUrl(url);

    if (verdict.kind === 'reject') {
      return NextResponse.json({ error: verdict.reason }, { status: 400 });
    }

    if (verdict.kind === 'passthrough') {
      // 非短链：原样返回，服务端不发起任何出站请求
      return NextResponse.json({ expandedUrl: url });
    }

    // 到这里 host 已经在白名单里，可以安全地跟一次重定向
    const response = await fetch(verdict.url, {
      method: 'HEAD',
      redirect: 'manual',
    });

    const locationHeader = response.headers.get('Location');
    if (locationHeader) {
      return NextResponse.json({ expandedUrl: locationHeader });
    }

    // HEAD 没拿到就退回 GET（部分短链服务不支持 HEAD）
    const getResponse = await fetch(verdict.url, {
      method: 'GET',
      redirect: 'manual',
    });

    const getLocationHeader = getResponse.headers.get('Location');
    if (getLocationHeader) {
      return NextResponse.json({ expandedUrl: getLocationHeader });
    }

    return NextResponse.json({
      expandedUrl: url,
      warning: 'Could not expand URL, returning original',
    });
  } catch (error) {
    console.error('[POST /api/locations/expand-url] failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Failed to expand URL' }, { status: 500 });
  }
}
