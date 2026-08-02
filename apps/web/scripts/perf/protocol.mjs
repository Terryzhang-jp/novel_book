/**
 * 性能测量协议 —— 固定方法，结构化输出
 *
 * ## 为什么需要一份「协议」而不是一个脚本
 *
 * 审计阶段我把 /login 的首屏量测成了 472 KB，真值是 1,026 KB ——
 * 因为采样时 10 个字体文件还在传输中没被计入。同一个页面用不同方法测，
 * 能得到好几个「看起来都对」的数字。
 *
 * 所以测量方法必须固定并版本化，否则前后两次的数字没有可比性。
 *
 * ## 固定协议
 *
 *   构建     生产构建（next build），不是 dev
 *   缓存     冷缓存，每次新建 browser context
 *   SW       禁用 Service Worker
 *   重复     3 次，取中位数（不是平均 —— 平均会被单次抖动带偏）
 *   记录     transferred（压缩后）与 decoded（解压后）分别记录
 *   压缩     记录 content-encoding，gzip / br 分开统计
 *   浏览器   固定 Chromium 版本，写进结果
 *   视口     固定
 *   节流     desktop 无节流 / mobile 4x CPU + Slow 4G，两组分别报告
 *
 * ## 三态输出
 *
 *   measured      真的测了，有数字
 *   not-measured  没测（缺环境/缺登录态/未实现），**不是通过**
 *   failed        测了但出错
 *
 * 「没测」绝不能显示成绿色。这是这份协议存在的主要原因。
 */

export const PROTOCOL_VERSION = '1.0.0';

/** @typedef {'measured' | 'not-measured' | 'failed'} MeasurementStatus */

export const REPEAT_COUNT = 3;

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3 },
};

/**
 * 节流档位。
 * Slow 4G 的数值取自 Lighthouse 的 mobileSlow4G 预设，保持可比性。
 */
export const THROTTLING = {
  none: null,
  slow4g: {
    // Chrome DevTools Protocol Network.emulateNetworkConditions
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
    uploadThroughput: (750 * 1024) / 8, // 750 Kbps
    cpuThrottlingRate: 4,
  },
};

/**
 * 取中位数。样本数为偶数时取中间两个的平均。
 * 用中位数而不是平均 —— 单次 GC 或磁盘抖动会把平均值带偏。
 */
export function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * 构造一条测量结果。
 * 强制带 status —— 没有「默认成功」这种事。
 *
 * @param {object} input
 * @param {string} input.id            测量项标识，例如 "route:/login:desktop"
 * @param {MeasurementStatus} input.status
 * @param {string} [input.reason]      not-measured / failed 时必填
 * @param {object} [input.samples]     各次原始样本
 * @param {object} [input.value]       中位数结果
 */
export function measurement({ id, status, reason, samples, value, meta }) {
  if (status !== 'measured' && !reason) {
    throw new Error(`测量项 ${id} 状态为 ${status} 但没有说明原因`);
  }
  return {
    id,
    status,
    ...(reason ? { reason } : {}),
    ...(value ? { value } : {}),
    ...(samples ? { samples } : {}),
    ...(meta ? { meta } : {}),
  };
}

/**
 * 组装最终报告。
 *
 * 关键：`ok` 只在「没有 failed 且没有 not-measured」时为 true。
 * 有任何一项没测到，整份报告就不算完整 —— 调用方不能把它当作通过。
 */
export function buildReport({ measurements, env }) {
  const byStatus = { measured: 0, 'not-measured': 0, failed: 0 };
  for (const m of measurements) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;

  return {
    protocolVersion: PROTOCOL_VERSION,
    // 时间戳由调用方注入，保持函数可测试
    env,
    summary: {
      total: measurements.length,
      ...byStatus,
      complete: byStatus.failed === 0 && byStatus['not-measured'] === 0,
    },
    measurements,
  };
}

/** 人类可读的摘要。not-measured 用醒目的颜色，不能被当成通过。 */
export function formatReport(report) {
  const lines = [];
  const { summary } = report;
  lines.push(`性能报告  协议 v${report.protocolVersion}`);
  lines.push(
    `  measured ${summary.measured} · not-measured ${summary['not-measured']} · failed ${summary.failed}`
  );
  lines.push('');

  const icon = { measured: '\x1b[32m✓\x1b[0m', 'not-measured': '\x1b[33m○\x1b[0m', failed: '\x1b[31m✗\x1b[0m' };
  for (const m of report.measurements) {
    lines.push(`  ${icon[m.status]} ${m.id}`);
    if (m.status === 'measured' && m.value) {
      for (const [k, v] of Object.entries(m.value)) {
        lines.push(`      ${k}: ${typeof v === 'number' ? Math.round(v) : v}`);
      }
    } else {
      lines.push(`      ${m.reason}`);
    }
  }

  lines.push('');
  if (!summary.complete) {
    lines.push(
      '\x1b[33m  ⚠ 报告不完整 —— 有测量项未执行或失败。这不等于性能达标。\x1b[0m'
    );
  }
  return lines.join('\n');
}
