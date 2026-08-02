#!/usr/bin/env node
/**
 * 架构边界检查 —— ADR-000 / ADR-001 / ADR-002 的自动执行
 *
 * 基于 TypeScript AST，不是正则。原因见 ADR-001「静态检查的边界」：
 * 正则版本会在这些情况下失效或误报 ——
 *   · 多行方法签名
 *   · 泛型参数里的括号  foo<T extends Map<string, number>>(actor: Actor)
 *   · interface / abstract class 的方法声明
 *   · 箭头函数属性  findById = async (actor: Actor, id) => {}
 *   · 函数重载
 *   · 注释和字符串里的假匹配
 *
 * ⚠️ 这个脚本保证的是**架构形状**，不是**安全语义**。
 *    `findById(actor, id)` 里 actor 没被用上，它照样放行。
 *    证明隔离真的生效是集成测试的职责。
 *
 * 用法：
 *   node scripts/check-architecture.mjs           检查
 *   node scripts/check-architecture.mjs --self-test  跑 fixture 自测
 *
 * 退出码 0 = 无违规。
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');
const MONOREPO = resolve(ROOT, '../..');

// ════════════════════════════════════════════════════════════════════════════
// 规则定义
// ════════════════════════════════════════════════════════════════════════════

/**
 * 模块导入规则：某些目录下禁止 import 某些模块。
 * @type {{ id: string, adr: string, reason: string, roots: string[], deny: (spec: string) => boolean }[]}
 */
const IMPORT_RULES = [
  {
    id: 'domain-no-vendor',
    adr: 'ADR-000',
    reason: '新核心必须供应商无关 —— 一个平台实例的消失不能让系统失去可运行性',
    roots: [
      'packages/domain/src',
      'packages/application/src',
      'packages/infrastructure-storage/src',
    ],
    deny: (s) => s.startsWith('@supabase/'),
  },
  {
    id: 'domain-pure',
    adr: 'ADR-000',
    reason: 'packages/domain 必须是纯类型 + 纯函数：零 IO、零 UI 框架、零外部依赖',
    roots: ['packages/domain/src'],
    deny: (s) =>
      s === 'react' ||
      s.startsWith('react/') ||
      s.startsWith('next') ||
      s === 'pg' ||
      /^(node:)?(fs|http|https|net|child_process|crypto|os|path)(\/|$)/.test(s),
  },
  {
    id: 'no-cross-app-import',
    adr: 'ADR-000',
    reason: '新应用不得直接 import 遗留应用的文件，只能通过 packages/* 共享',
    roots: ['apps/studio'],
    deny: (s) => s.includes('apps/web/'),
  },
];

/** SQL / 平台特有标识符：在新核心里出现即违规 */
const FORBIDDEN_IDENTIFIERS = [
  {
    id: 'no-legacy-users-table',
    adr: 'ADR-001',
    reason:
      '身份的唯一来源是 Better Auth 的 "user" 表。users 已废弃（migration ' +
      '20260802010000），不得在新代码里新增对它的查询或外键。',
    roots: [
      'packages/domain/src',
      'packages/application/src',
      'packages/infrastructure-postgres/src',
      'packages/legacy-adapters/src',
      'apps/studio',
    ],
    // 匹配 SQL 里对 users 表的引用：FROM users / JOIN users / REFERENCES users
    // 不匹配 "user"（带引号的才是 Better Auth 那张表）
    pattern: /\b(from|join|into|update|references)\s+users\b/i,
  },
  {
    id: 'domain-no-vendor-sql',
    adr: 'ADR-000',
    reason: '新核心不得依赖 Supabase 特有的 SQL 语义（auth.uid / service_role）',
    roots: [
      'packages/domain/src',
      'packages/application/src',
      'packages/infrastructure-postgres/src',
    ],
    // 只在字符串字面量和模板串里查 —— 这些是 SQL 会出现的地方
    pattern: /\bauth\.uid\s*\(|\bservice_role\b/,
  },
];

/**
 * Repository 方法必须以 actor 作为第一个参数。
 *
 * 这里列的是**目录**，规则只对其中名字以 Repository 结尾的 class/interface
 * 生效。写全一点 —— 少列一个目录，规则就在那里静默失效。
 */
const REPOSITORY_ROOTS = [
  'packages/legacy-adapters/src',
  'packages/infrastructure-postgres/src',
  'packages/application/src',
  'packages/db/src',
];

// ════════════════════════════════════════════════════════════════════════════
// 工具
// ════════════════════════════════════════════════════════════════════════════

function collectSourceFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectSourceFiles(p));
    else if (/\.(ts|tsx|mts|cts)$/.test(entry) && !/\.(test|spec|d)\./.test(entry)) out.push(p);
  }
  return out;
}

function parse(filePath, source) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    /\.tsx$/.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

// ════════════════════════════════════════════════════════════════════════════
// 检查实现
// ════════════════════════════════════════════════════════════════════════════

/**
 * 收集一个文件里全部的模块说明符（import / export from / dynamic import / require）。
 * 用 AST 而不是正则 —— 注释和字符串里的 "@supabase/x" 不会被误判。
 */
function collectModuleSpecifiers(sourceFile) {
  /** @type {{ spec: string, node: ts.Node }[]} */
  const specs = [];

  const visit = (node) => {
    // import x from 'y'  /  export { x } from 'y'
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push({ spec: node.moduleSpecifier.text, node: node.moduleSpecifier });
    }
    // import('y')
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specs.push({ spec: node.arguments[0].text, node: node.arguments[0] });
    }
    // require('y')
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specs.push({ spec: node.arguments[0].text, node: node.arguments[0] });
    }
    // import type x from 'y' 也走 ImportDeclaration，已覆盖
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specs;
}

/** 收集全部字符串字面量与模板串的内容（用于查 SQL 里的平台标识符） */
function collectStringContents(sourceFile) {
  /** @type {{ text: string, node: ts.Node }[]} */
  const out = [];
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) out.push({ text: node.text, node });
    else if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push({ text: node.getText(sourceFile), node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

/**
 * 判断一个参数是否是合格的 actor 参数。
 * 接受 `actor: Actor`、`actor: ActorContext`、`readonly actor: Actor`。
 * 不接受名字对但类型明显不对的（例如 actor: string）。
 */
function isActorParam(param, sourceFile) {
  if (!param || !ts.isIdentifier(param.name)) return false;
  if (param.name.text !== 'actor') return false;
  if (!param.type) return false; // 必须显式标注类型
  const typeText = param.type.getText(sourceFile);
  return /\bActor\b|\bActorContext\b/.test(typeText);
}

/**
 * Repository 里的每个公开方法都必须以 actor 为第一参数。
 * 覆盖：class 方法、abstract 方法、interface 方法签名、箭头函数属性。
 */
function checkRepositoryActors(sourceFile, filePath, violations) {
  const report = (name, node, detail) => {
    violations.push({
      rule: 'repository-needs-actor',
      adr: 'ADR-001',
      reason: 'Repository 的每个公开方法必须以 actor: Actor 作为第一个参数',
      file: relative(MONOREPO, filePath),
      line: lineOf(sourceFile, node),
      text: `${name}(${detail})`,
    });
  };

  /** 一个「像 repository 方法」的成员是否合规 */
  const checkMember = (member) => {
    // 跳过 private / protected / static
    const mods = ts.getCombinedModifierFlags(member);
    if (mods & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Static)) return;
    if (member.name && ts.isIdentifier(member.name) && member.name.text.startsWith('_')) return;

    let name = null;
    let params = null;

    if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
      name = member.name?.getText(sourceFile) ?? '<anonymous>';
      params = member.parameters;
    } else if (
      (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) &&
      member.initializer &&
      (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))
    ) {
      // findById = async (actor, id) => {}
      name = member.name?.getText(sourceFile) ?? '<anonymous>';
      params = member.initializer.parameters;
    } else if (
      (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) &&
      member.type &&
      ts.isFunctionTypeNode(member.type)
    ) {
      // findById: (actor: Actor, id: string) => Promise<...>
      name = member.name?.getText(sourceFile) ?? '<anonymous>';
      params = member.type.parameters;
    }

    if (name === null || params === null) return;
    if (params.length === 0) {
      report(name, member, '无参数');
      return;
    }
    if (!isActorParam(params[0], sourceFile)) {
      report(name, member, params[0].getText(sourceFile));
    }
  };

  const visit = (node) => {
    const isRepoLike =
      (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
      node.name &&
      /Repository$/.test(node.name.text);
    if (isRepoLike) {
      for (const member of node.members) checkMember(member);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

// ════════════════════════════════════════════════════════════════════════════
// 主流程
// ════════════════════════════════════════════════════════════════════════════

/** @param {string} monorepoRoot */
export function runChecks(monorepoRoot = MONOREPO) {
  /** @type {{rule:string,adr:string,reason:string,file:string,line:number,text:string}[]} */
  const violations = [];
  const scanned = new Set();

  const resolveRoot = (r) => resolve(monorepoRoot, r);
  const rel = (p) => relative(monorepoRoot, p);

  // 模块导入规则
  for (const rule of IMPORT_RULES) {
    for (const root of rule.roots) {
      const dir = resolveRoot(root);
      if (!existsSync(dir)) continue;
      scanned.add(root);
      for (const file of collectSourceFiles(dir)) {
        const src = readFileSync(file, 'utf8');
        const sf = parse(file, src);
        for (const { spec, node } of collectModuleSpecifiers(sf)) {
          if (rule.deny(spec)) {
            violations.push({
              rule: rule.id, adr: rule.adr, reason: rule.reason,
              file: rel(file), line: lineOf(sf, node), text: `import '${spec}'`,
            });
          }
        }
      }
    }
  }

  // SQL / 平台标识符
  for (const rule of FORBIDDEN_IDENTIFIERS) {
    for (const root of rule.roots) {
      const dir = resolveRoot(root);
      if (!existsSync(dir)) continue;
      scanned.add(root);
      for (const file of collectSourceFiles(dir)) {
        const src = readFileSync(file, 'utf8');
        const sf = parse(file, src);
        for (const { text, node } of collectStringContents(sf)) {
          if (rule.pattern.test(text)) {
            violations.push({
              rule: rule.id, adr: rule.adr, reason: rule.reason,
              file: rel(file), line: lineOf(sf, node),
              text: text.replace(/\s+/g, ' ').slice(0, 80),
            });
          }
        }
      }
    }
  }

  // Repository actor 契约
  for (const root of REPOSITORY_ROOTS) {
    const dir = resolveRoot(root);
    if (!existsSync(dir)) continue;
    scanned.add(root);
    for (const file of collectSourceFiles(dir)) {
      const src = readFileSync(file, 'utf8');
      const sf = parse(file, src);
      checkRepositoryActors(sf, file, violations);
    }
  }

  return { violations, scanned: [...scanned] };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const { violations, scanned } = runChecks();

  if (scanned.length === 0) {
    console.log('▸ 架构检查：新架构目录尚未创建，跳过');
    console.log('  （packages/domain、packages/application、apps/studio 将在 Phase 2 建立）');
    process.exit(0);
  }

  console.log(`▸ 架构检查：扫描 ${scanned.length} 个目录`);
  scanned.forEach((r) => console.log(`    ${r}`));

  if (violations.length === 0) {
    console.log('✓ 无违规');
    console.log('  注意：静态检查只保证架构形状，安全语义由集成测试保证（见 ADR-001）');
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
}
