#!/usr/bin/env node
/**
 * 路由级构建产物测量 —— 不需要浏览器，不需要跑起来的应用
 *
 * 从 .next/app-build-manifest.json 解析每个路由实际加载的 chunk，
 * 逐个算原始/gzip/brotli 体积。这个数字是**确定的**：
 * 它不受采样时机、网络抖动、页面内容影响。
 *
 * 浏览器实测（FCP/LCP/TBT/实际字体下载量）由 measure-browser.mjs 负责，
 * 那个需要跑起来的应用。两者互补：
 *
 *   measure-routes    确定性字节数，任何时候都能测      ← 适合当 CI 门禁
 *   measure-browser   真实加载行为，需要运行环境        ← 适合人工回归
 *
 * 用法：
 *   node scripts/perf/measure-routes.mjs [--json out.json]
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { buildReport, formatReport, measurement } from './protocol.mjs';

const APP_ROOT = resolve(import.meta.dirname, '../..');
const NEXT_DIR = join(APP_ROOT, '.next');
const MANIFEST = join(NEXT_DIR, 'app-build-manifest.json');

/** 要测量的路由。key 是展示名，value 是 manifest 里的 page key。 */
const ROUTES = {
  '/': '/page',
  '/login': '/login/page',
  '/chichibu': '/chichibu/page',
  '/gallery': '/gallery/page',
  '/gallery/explore': '/gallery/explore/page',
  '/gallery/journal': '/gallery/journal/page',
  '/canvas': '/canvas/page',
  '/documents/[id]': '/documents/[id]/page',
};

function sizes(relPath) {
  const abs = join(NEXT_DIR, relPath);
  if (!existsSync(abs)) return null;
  const raw = readFileSync(abs);
  return {
    raw: statSync(abs).size,
    gzip: gzipSync(raw, { level: 9 }).length,
    brotli: brotliCompressSync(raw, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

function main() {
  const measurements = [];

  if (!existsSync(MANIFEST)) {
    measurements.push(
      measurement({
        id: 'build-manifest',
        status: 'not-measured',
        reason: '找不到 .next/app-build-manifest.json —— 请先跑 pnpm build（必须是生产构建，不是 dev）',
      })
    );
    output(measurements);
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const layout = manifest.pages['/layout'] ?? [];

  // 根 layout 的 CSS 是「每个页面都要付」的成本，单独作为一项
  const layoutCss = layout.filter((f) => f.endsWith('.css'));
  const layoutCssTotals = layoutCss.reduce(
    (acc, f) => {
      const s = sizes(f);
      if (s) {
        acc.raw += s.raw;
        acc.gzip += s.gzip;
        acc.brotli += s.brotli;
        acc.files += 1;
      }
      return acc;
    },
    { raw: 0, gzip: 0, brotli: 0, files: 0 }
  );

  measurements.push(
    measurement({
      id: 'root-layout-css',
      status: 'measured',
      value: {
        files: layoutCssTotals.files,
        rawBytes: layoutCssTotals.raw,
        gzipBytes: layoutCssTotals.gzip,
        brotliBytes: layoutCssTotals.brotli,
      },
      meta: { note: '渲染阻塞资源，每个页面都要加载' },
    })
  );

  for (const [display, key] of Object.entries(ROUTES)) {
    const page = manifest.pages[key];
    if (!page) {
      measurements.push(
        measurement({
          id: `route:${display}`,
          status: 'not-measured',
          reason: `manifest 里没有 ${key} —— 路由可能已改名或被删除`,
        })
      );
      continue;
    }

    const all = [...new Set([...layout, ...page])];
    const totals = { js: { raw: 0, gzip: 0, brotli: 0, files: 0 }, css: { raw: 0, gzip: 0, brotli: 0, files: 0 } };
    let missing = 0;

    for (const f of all) {
      const s = sizes(f);
      if (!s) {
        missing += 1;
        continue;
      }
      const bucket = f.endsWith('.css') ? totals.css : f.endsWith('.js') ? totals.js : null;
      if (!bucket) continue;
      bucket.raw += s.raw;
      bucket.gzip += s.gzip;
      bucket.brotli += s.brotli;
      bucket.files += 1;
    }

    if (missing > 0) {
      measurements.push(
        measurement({
          id: `route:${display}`,
          status: 'failed',
          reason: `manifest 引用了 ${missing} 个不存在的文件 —— 构建产物可能不完整`,
        })
      );
      continue;
    }

    measurements.push(
      measurement({
        id: `route:${display}`,
        status: 'measured',
        value: {
          jsFiles: totals.js.files,
          jsGzipBytes: totals.js.gzip,
          cssFiles: totals.css.files,
          cssGzipBytes: totals.css.gzip,
          totalGzipBytes: totals.js.gzip + totals.css.gzip,
          totalBrotliBytes: totals.js.brotli + totals.css.brotli,
        },
      })
    );
  }

  // 浏览器实测占位 —— 明确标为未测量，不伪装成通过
  measurements.push(
    measurement({
      id: 'browser:runtime-metrics',
      status: 'not-measured',
      reason:
        'FCP/LCP/TBT/内存/实际字体下载量需要跑起来的应用。' +
        '登录态页面还需要可用的认证环境。见 scripts/perf/measure-browser.mjs',
    })
  );

  output(measurements);
}

function output(measurements) {
  const report = buildReport({
    measurements,
    env: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  });

  console.log(formatReport(report));

  const jsonIdx = process.argv.indexOf('--json');
  if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
    const out = resolve(process.cwd(), process.argv[jsonIdx + 1]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\n结构化结果已写入 ${out}`);
  }

  // 有 failed 才算失败。not-measured 不阻断 —— 但摘要里已经醒目标出，
  // 且 summary.complete 为 false，调用方不能把它当作通过。
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main();
