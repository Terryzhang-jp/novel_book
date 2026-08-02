#!/usr/bin/env node
/**
 * 架构边界检查 —— ADR-000 / ADR-001 / ADR-002 的自动执行
 *
 * ADR 里写「领域层不得依赖 Supabase」如果只是一句话，三个月后必然被违反。
 * 这个脚本让它变成 CI 门禁。
 *
 * 用法：node scripts/check-architecture.mjs
 * 退出码 0 = 无违规。
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MONOREPO = resolve(ROOT, '../..');

/** @typedef {{ id: string, adr: string, reason: string, roots: string[], forbidden: RegExp[] }} Rule */

/** @type {Rule[]} */
const RULES = [
  {
    id: 'domain-no-vendor',
    adr: 'ADR-000',
    reason: '领域层必须供应商无关 —— 一个平台实例的消失不能让系统失去可运行性',
    roots: ['packages/domain/src', 'packages/db/src'],
    forbidden: [
      /from\s+['"]@supabase\/[^'"]+['"]/,
      /require\(\s*['"]@supabase\/[^'"]+['"]\s*\)/,
      /import\(\s*['"]@supabase\/[^'"]+['"]\s*\)/,
      /\bauth\.uid\s*\(/,
      /\bservice_role\b/,
    ],
  },
  {
    id: 'domain-pure',
    adr: 'ADR-000',
    reason: 'packages/domain 必须是纯类型 + 纯函数：零 IO、零 React、零外部依赖',
    roots: ['packages/domain/src'],
    forbidden: [
      /from\s+['"]react['"]/,
      /from\s+['"]next[/'"]/,
      /from\s+['"]node:(fs|http|https|net|child_process)['"]/,
      /from\s+['"](fs|http|https|net|child_process)['"]/,
      /from\s+['"]pg['"]/,
    ],
  },
  {
    id: 'no-cross-app-import',
    adr: 'ADR-000',
    reason: '新应用不得直接 import 遗留应用的文件，只能通过 packages/* 共享',
    roots: ['apps/studio'],
    forbidden: [/from\s+['"].*apps\/web\//],
  },
  {
    id: 'repository-needs-actor',
    adr: 'ADR-001',
    reason: 'Repository 方法必须接收 ActorContext —— 不存在「不带身份的查询」',
    roots: ['packages/db/src/repositories'],
    // 这条用专门的检查函数，见下方 checkRepositoryActor
    forbidden: [],
  },
];

/** 递归收集 .ts/.tsx 文件 */
function collect(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collect(p));
    else if (/\.(ts|tsx|mts|cts)$/.test(entry) && !/\.(test|spec)\./.test(entry)) out.push(p);
  }
  return out;
}

const violations = [];

for (const rule of RULES) {
  if (rule.forbidden.length === 0) continue;
  for (const root of rule.roots) {
    for (const file of collect(resolve(MONOREPO, root))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // 跳过注释行 —— ADR 引用和说明性注释里会提到这些词
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        for (const pattern of rule.forbidden) {
          if (pattern.test(line)) {
            violations.push({
              rule: rule.id,
              adr: rule.adr,
              reason: rule.reason,
              file: relative(MONOREPO, file),
              line: i + 1,
              text: trimmed.slice(0, 100),
            });
          }
        }
      });
    }
  }
}

/**
 * ADR-001：Repository 的每个 public 异步方法第一个参数必须是 actor。
 * 单独实现，因为这需要看函数签名而不是单行匹配。
 */
function checkRepositoryActor() {
  const dir = resolve(MONOREPO, 'packages/db/src/repositories');
  for (const file of collect(dir)) {
    const src = readFileSync(file, 'utf8');
    // 匹配 class 内的 async 方法：  async foo(...) 或 foo(...): Promise<
    const methodRe = /^\s{2}(?:public\s+)?(?:async\s+)?([a-zA-Z_]\w*)\s*\(([^)]*)\)/gm;
    let m;
    while ((m = methodRe.exec(src)) !== null) {
      const [, name, params] = m;
      if (name === 'constructor' || name.startsWith('_')) continue;
      const firstParam = params.split(',')[0]?.trim() ?? '';
      if (firstParam && !/^actor\s*:/.test(firstParam)) {
        const line = src.slice(0, m.index).split('\n').length;
        violations.push({
          rule: 'repository-needs-actor',
          adr: 'ADR-001',
          reason: 'Repository 方法必须以 actor: ActorContext 作为第一个参数',
          file: relative(MONOREPO, file),
          line,
          text: `${name}(${firstParam}…)`,
        });
      }
    }
  }
}
checkRepositoryActor();

// ── 报告 ────────────────────────────────────────────────────────────────────
const checkedRoots = RULES.flatMap((r) => r.roots).filter((r) =>
  existsSync(resolve(MONOREPO, r))
);

if (checkedRoots.length === 0) {
  console.log('▸ 架构检查：新架构目录尚未创建，跳过');
  console.log('  （packages/domain、packages/db、apps/studio 将在 Phase 2 建立）');
  process.exit(0);
}

console.log(`▸ 架构检查：扫描 ${checkedRoots.length} 个目录`);
checkedRoots.forEach((r) => console.log(`    ${r}`));

if (violations.length === 0) {
  console.log('✓ 无违规');
  process.exit(0);
}

console.error(`\n✗ 发现 ${violations.length} 处架构违规：\n`);
const byRule = new Map();
for (const v of violations) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, []);
  byRule.get(v.rule).push(v);
}
for (const [ruleId, vs] of byRule) {
  console.error(`  [${vs[0].adr}] ${ruleId}`);
  console.error(`  ${vs[0].reason}\n`);
  for (const v of vs) console.error(`    ${v.file}:${v.line}\n      ${v.text}`);
  console.error('');
}
process.exit(1);
