#!/usr/bin/env tsx
/**
 * 直接验证遗留 Supabase Storage 对象的**可访问性**
 *
 *   pnpm verify:legacy-storage
 *
 * ## 为什么需要这个脚本
 *
 * 之前有一处判断是错的：
 *
 *   「数据库行删了之后，遗留照片的 URL 在界面上取不到，
 *     所以这是存储残留，不是泄露。」
 *
 * 这个推理只在 bucket 是 private 时成立。而 ADR 里记录过，旧系统的
 * `photos` bucket 是 **public**，`is_public` 字段只控制应用要不要显示，
 * **不控制对象能不能被直接访问**。
 *
 * 也就是说，只要那个 URL 曾经出现在浏览器历史、日志、分享链接或别人手里，
 * 删掉数据库行之后它仍然可能返回 200。
 *
 * 「在 UI 里找不到」不等于「取不到」。所以这件事必须**实测**，
 * 不能靠推理，也不能靠「应该是安全的」。
 *
 * ## 三种结论
 *
 *   平台不可达    历史实例已经不存在 —— 没有可执行的清理对象。
 *                 **不等于「已经清理」**，只是没有东西可清。
 *   bucket private / 对象 404
 *                 只是存储成本问题，按残留处理。
 *   匿名 200      **隐私缺口**。必须把遗留对象纳入 storage_cleanup_jobs。
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local'), quiet: true });
loadEnv({ path: resolve(process.cwd(), '.env'), quiet: true });

const TIMEOUT_MS = 15_000;

interface Finding {
  readonly verdict: 'platform-gone' | 'private' | 'public-leak' | 'inconclusive';
  readonly detail: string;
}

async function probe(url: string, headers: Record<string, string> = {}) {
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function main(): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base) {
    console.log('⚠ 没有配置 NEXT_PUBLIC_SUPABASE_URL —— 这个环境不指向任何遗留实例。');
    process.exit(0);
  }
  console.log(`▸ 目标实例：${new URL(base).host}`);

  // ── 1. 平台还在吗 ──────────────────────────────────────────────────────
  let buckets: { name: string; public: boolean }[] | null = null;
  try {
    const res = await probe(`${base}/storage/v1/bucket`, {
      apikey: serviceKey ?? '',
      Authorization: `Bearer ${serviceKey ?? ''}`,
    });
    if (res.ok) {
      buckets = (await res.json()) as { name: string; public: boolean }[];
    } else {
      console.log(`  bucket 列表返回 ${res.status}`);
    }
  } catch (err) {
    const finding: Finding = {
      verdict: 'platform-gone',
      detail: `无法连接（${(err as Error).message}）。历史实例已不存在。`,
    };
    report(finding);
    console.log(
      '\n  ⚠ 记为「无法访问的历史平台，无可执行清理对象」——\n' +
        '    这**不等于**「已经清理干净」。如果将来重新配置一个遗留实例，\n' +
        '    必须重跑这个脚本，因为那时候风险会一并回来。'
    );
    process.exit(0);
  }

  // ── 2. bucket 是不是 public ────────────────────────────────────────────
  const photoBuckets = (buckets ?? []).filter((b) => /photo|image|media|ai/i.test(b.name));
  console.log(`▸ 找到 ${buckets?.length ?? 0} 个 bucket，其中 ${photoBuckets.length} 个可能存素材`);
  for (const b of photoBuckets) {
    console.log(`    ${b.name}  public=${b.public}`);
  }

  const publicOnes = photoBuckets.filter((b) => b.public);
  if (publicOnes.length === 0) {
    report({ verdict: 'private', detail: '素材 bucket 全部是 private —— 直连 URL 取不到。' });
    process.exit(0);
  }

  // ── 3. ⭐ 真的去匿名取一个对象 ─────────────────────────────────────────
  // 只看 bucket 的 public 标记还不够 —— 要证明的是「匿名请求能不能拿到字节」。
  for (const b of publicOnes) {
    const listRes = await probe(`${base}/storage/v1/object/list/${b.name}`, {
      apikey: serviceKey ?? '',
      Authorization: `Bearer ${serviceKey ?? ''}`,
      'Content-Type': 'application/json',
    }).catch(() => null);

    let firstKey: string | undefined;
    if (listRes?.ok) {
      const items = (await listRes.json()) as { name: string }[];
      firstKey = items.find((i) => i.name && !i.name.endsWith('/'))?.name;
    }
    if (!firstKey) {
      console.log(`    ${b.name}：列不出对象，无法实测`);
      continue;
    }

    // 不带任何凭据 —— 这就是「随便一个人拿着 URL」
    const anon = await probe(`${base}/storage/v1/object/public/${b.name}/${firstKey}`);
    console.log(`    ${b.name}/${firstKey} 匿名 GET → ${anon.status}`);
    if (anon.ok) {
      report({
        verdict: 'public-leak',
        detail:
          `bucket ${b.name} 是 public 且匿名可取（HTTP ${anon.status}）。` +
          '删除数据库行**不会**让这些字节失效 —— 必须纳入清理队列。',
      });
      process.exit(1);
    }
  }

  report({ verdict: 'inconclusive', detail: '有 public bucket，但抽样对象匿名取不到。' });
}

function report(f: Finding): void {
  const icon = f.verdict === 'public-leak' ? '✖' : f.verdict === 'private' ? '✓' : '▸';
  console.log(`\n${icon} 结论：${f.verdict}\n  ${f.detail}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
