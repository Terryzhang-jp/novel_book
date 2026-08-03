/**
 * 架构检查器的 fixture 测试
 *
 * 检查器本身是 CI 门禁，如果它有假阴性（漏报），整条防线就是纸糊的；
 * 如果有假阳性（误报），团队会很快学会忽略它。两种都要测。
 *
 * 重点覆盖正则实现会翻车的那些情况：
 *   · 多行方法签名
 *   · 泛型参数里带括号
 *   · interface / abstract 方法声明
 *   · 箭头函数属性、函数类型属性
 *   · 函数重载
 *   · 注释和字符串里的假匹配
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runChecks } from '../../scripts/check-architecture.mjs';

let root: string;

/** 在临时 monorepo 里写一个源文件 */
function write(relPath: string, content: string) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function check() {
  return runChecks(root);
}

function rulesHit() {
  return check().violations.map((v) => v.rule);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'arch-fixture-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ADR-000 · 供应商中立', () => {
  it('domain 里 import @supabase/* → 违规', () => {
    write('packages/domain/src/a.ts', `import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;`);
    expect(rulesHit()).toContain('domain-no-vendor');
  });

  it("动态 import('@supabase/…') 也要抓到", () => {
    write('packages/domain/src/a.ts', `export const load = () => import('@supabase/supabase-js');`);
    expect(rulesHit()).toContain('domain-no-vendor');
  });

  it("require('@supabase/…') 也要抓到", () => {
    write('packages/domain/src/a.ts', `const c = require('@supabase/supabase-js');\nexport default c;`);
    expect(rulesHit()).toContain('domain-no-vendor');
  });

  it('注释里提到 @supabase/supabase-js → 不应误报', () => {
    write(
      'packages/domain/src/a.ts',
      `// 本文件刻意不使用 @supabase/supabase-js，见 ADR-000\n/* 也不使用 @supabase/storage-js */\nexport const x = 1;`
    );
    expect(rulesHit()).not.toContain('domain-no-vendor');
  });

  it('字符串里出现 @supabase/… 但不是 import → 不应误报', () => {
    write('packages/domain/src/a.ts', `export const DOC_URL = 'https://npmjs.com/@supabase/supabase-js';`);
    expect(rulesHit()).not.toContain('domain-no-vendor');
  });

  it('domain 里 import react → 违反纯净性', () => {
    write('packages/domain/src/a.ts', `import { useState } from 'react';\nexport const x = useState;`);
    expect(rulesHit()).toContain('domain-pure');
  });

  it('domain 里 import node:fs → 违反纯净性', () => {
    write('packages/domain/src/a.ts', `import { readFileSync } from 'node:fs';\nexport const x = readFileSync;`);
    expect(rulesHit()).toContain('domain-pure');
  });

  it('type-only import 同样受约束', () => {
    write('packages/domain/src/a.ts', `import type { SupabaseClient } from '@supabase/supabase-js';\nexport type X = SupabaseClient;`);
    expect(rulesHit()).toContain('domain-no-vendor');
  });

  it('干净的 domain 文件 → 零违规', () => {
    write(
      'packages/domain/src/journey.ts',
      `export interface Journey { readonly id: string; readonly title: string }\nexport const isNamed = (j: Journey) => j.title.length > 0;`
    );
    expect(check().violations).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ADR-000 · SQL 里的平台标识符', () => {
  it('SQL 字符串里的 auth.uid() → 违规', () => {
    write(
      'packages/infrastructure-postgres/src/q.ts',
      `export const SQL = 'SELECT * FROM photos WHERE user_id = auth.uid()';`
    );
    expect(rulesHit()).toContain('domain-no-vendor-sql');
  });

  it('模板串里的 service_role → 违规', () => {
    write(
      'packages/infrastructure-postgres/src/q.ts',
      'export const g = (t: string) => `GRANT SELECT ON ${t} TO service_role`;'
    );
    expect(rulesHit()).toContain('domain-no-vendor-sql');
  });

  it('普通 SQL → 不误报', () => {
    write(
      'packages/infrastructure-postgres/src/q.ts',
      `export const SQL = 'SELECT * FROM photos WHERE user_id = $1';`
    );
    expect(rulesHit()).not.toContain('domain-no-vendor-sql');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ADR-000 · 跨应用引用', () => {
  it('apps/studio 引用 apps/web → 违规', () => {
    write('apps/studio/x.ts', `import { photoStorage } from '../../apps/web/lib/storage/photo-storage';\nexport const p = photoStorage;`);
    expect(rulesHit()).toContain('no-cross-app-import');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('ADR-001 · Repository 必须带 actor', () => {
  const REPO = 'packages/infrastructure-postgres/src/repositories/photo.ts';

  it('缺少 actor → 违规', () => {
    write(REPO, `export class PhotoRepository {\n  async findById(id: string) { return null; }\n}`);
    expect(rulesHit()).toContain('repository-needs-actor');
  });

  it('有 actor → 放行', () => {
    write(REPO, `import type { Actor } from '@tc/domain';\nexport class PhotoRepository {\n  async findById(actor: Actor, id: string) { return null; }\n}`);
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });

  it('多行签名 → 正确解析', () => {
    write(
      REPO,
      `import type { Actor } from '@tc/domain';
export class PhotoRepository {
  async findByUserId(
    actor: Actor,
    options: { limit?: number; offset?: number },
  ): Promise<unknown[]> {
    return [];
  }
}`
    );
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });

  it('多行签名且缺 actor → 仍然抓到', () => {
    write(
      REPO,
      `export class PhotoRepository {
  async findByUserId(
    userId: string,
    options: { limit?: number },
  ): Promise<unknown[]> {
    return [];
  }
}`
    );
    expect(rulesHit()).toContain('repository-needs-actor');
  });

  it('泛型参数里带括号 → 不被括号计数搞晕', () => {
    write(
      REPO,
      `import type { Actor } from '@tc/domain';
export class PhotoRepository {
  async query<T extends Record<string, (x: number) => string>>(actor: Actor, spec: T) { return spec; }
}`
    );
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });

  it('interface 方法签名 → 同样受约束', () => {
    write(
      REPO,
      `export interface PhotoRepository {\n  findById(id: string): Promise<unknown>;\n}`
    );
    expect(rulesHit()).toContain('repository-needs-actor');
  });

  it('abstract 方法 → 同样受约束', () => {
    write(
      REPO,
      `export abstract class PhotoRepository {\n  abstract findById(id: string): Promise<unknown>;\n}`
    );
    expect(rulesHit()).toContain('repository-needs-actor');
  });

  it('箭头函数属性 → 同样受约束', () => {
    write(
      REPO,
      `export class PhotoRepository {\n  findById = async (id: string) => null;\n}`
    );
    expect(rulesHit()).toContain('repository-needs-actor');
  });

  it('函数类型属性 → 同样受约束', () => {
    write(
      REPO,
      `import type { Actor } from '@tc/domain';\nexport interface PhotoRepository {\n  findById: (actor: Actor, id: string) => Promise<unknown>;\n}`
    );
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });

  it('private / protected / static 方法 → 豁免', () => {
    write(
      REPO,
      `export class PhotoRepository {
  private mapRow(row: unknown) { return row; }
  protected buildQuery(sql: string) { return sql; }
  static create(pool: unknown) { return new PhotoRepository(); }
  _internal(x: number) { return x; }
}`
    );
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });

  it('constructor → 豁免', () => {
    write(REPO, `export class PhotoRepository {\n  constructor(private readonly pool: unknown) {}\n}`);
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });

  it('参数名叫 actor 但类型不是 Actor → 仍然违规', () => {
    write(REPO, `export class PhotoRepository {\n  async findById(actor: string, id: string) { return null; }\n}`);
    expect(rulesHit()).toContain('repository-needs-actor');
  });

  it('actor 没有类型标注 → 仍然违规', () => {
    write(REPO, `export class PhotoRepository {\n  async findById(actor, id) { return null; }\n}`);
    expect(rulesHit()).toContain('repository-needs-actor');
  });

  it('ActorContext 也接受（兼容命名）', () => {
    write(
      REPO,
      `import type { ActorContext } from '@tc/domain';\nexport class PhotoRepository {\n  async findById(actor: ActorContext, id: string) { return null; }\n}`
    );
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });

  it('非 Repository 命名的 class → 不受此约束', () => {
    write(
      'packages/infrastructure-postgres/src/repositories/helper.ts',
      `export class QueryBuilder {\n  build(sql: string) { return sql; }\n}`
    );
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });

  it('注释里写着 findById(id) → 不误报', () => {
    write(
      REPO,
      `import type { Actor } from '@tc/domain';
export class PhotoRepository {
  /**
   * 旧签名是 findById(id: string)，已废弃。
   * @example repo.findById(actor, 'abc')
   */
  async findById(actor: Actor, id: string) { return null; }
}`
    );
    expect(rulesHit()).not.toContain('repository-needs-actor');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('检查器自身行为', () => {
  it('目录不存在时不报错、不误报', () => {
    const r = check();
    expect(r.violations).toHaveLength(0);
    expect(r.scanned).toHaveLength(0);
  });

  it('.test.ts 文件被排除', () => {
    write('packages/domain/src/a.test.ts', `import { createClient } from '@supabase/supabase-js';\nexport const x = createClient;`);
    expect(rulesHit()).not.toContain('domain-no-vendor');
  });

  it('违规项带上文件名和行号', () => {
    write('packages/domain/src/a.ts', `export const x = 1;\nimport { c } from '@supabase/supabase-js';\nexport const y = c;`);
    const v = check().violations.find((x) => x.rule === 'domain-no-vendor');
    expect(v).toBeDefined();
    expect(v!.file).toBe('packages/domain/src/a.ts');
    expect(v!.line).toBe(2);
    expect(v!.adr).toBe('ADR-000');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('Phase 3A · 遗留写入冻结', () => {
  it('豁免清单之外新增 photos 表写入 → 违规', () => {
    write(
      'apps/web/app/api/new-upload/route.ts',
      `import { supabaseAdmin } from '@/lib/supabase/admin';
       export async function POST(u: string) {
         await supabaseAdmin.from('photos').insert({ user_id: u });
       }`
    );
    expect(rulesHit()).toContain('no-new-legacy-writes');
  });

  it('新增 Supabase Storage 上传 → 违规', () => {
    write(
      'apps/web/lib/新上传.ts',
      `import { supabaseAdmin } from './supabase/admin';
       export const put = (b: Buffer) =>
         supabaseAdmin.storage.from('photos').upload('a/b.jpg', b);`
    );
    expect(rulesHit()).toContain('no-new-legacy-writes');
  });

  it('调用旧的 uploadFile 封装 → 违规', () => {
    write(
      'apps/web/app/api/x/route.ts',
      `import { uploadFile } from '@/lib/supabase/storage';
       export const POST = () => uploadFile('photos', 'a.jpg', Buffer.from(''));`
    );
    expect(rulesHit()).toContain('no-new-legacy-writes');
  });

  it('豁免清单里的遗留 adapter 不违规', () => {
    // 旧文件继续存在是允许的 —— 要挡的是**新增**入口。
    write(
      'apps/web/lib/storage/photo-storage.ts',
      `import { supabaseAdmin } from '../supabase/admin';
       export const create = (u: string) => supabaseAdmin.from('photos').insert({ user_id: u });`
    );
    expect(rulesHit()).not.toContain('no-new-legacy-writes');
  });

  it('注释和字符串里提到这些形状 → 不应误报', () => {
    // 门禁只看调用表达式。纯正则会把解释性注释也算违规，
    // 于是后来的人为了让 CI 变绿就得删注释 —— 那是在惩罚写文档的人。
    write(
      'apps/web/lib/notes.ts',
      `// 历史上这里是 supabaseAdmin.from('photos').insert({...})，现在走 uploadAsset
       export const NOTE = "以前用 storage.from('photos').upload(path, buf)";`
    );
    expect(rulesHit()).not.toContain('no-new-legacy-writes');
  });

  it('读取旧表不算违规 —— Phase 3A 只冻结写入', () => {
    write(
      'apps/web/app/api/gallery/route.ts',
      `import { supabaseAdmin } from '@/lib/supabase/admin';
       export const GET = () => supabaseAdmin.from('photos').select('*');`
    );
    expect(rulesHit()).not.toContain('no-new-legacy-writes');
  });
});
