/**
 * PhotoRepository 契约 · 遗留 Supabase 实现
 *
 * ## 为什么这个文件里没有实际的契约测试
 *
 * `lib/storage/photo-storage.ts` 走 supabase-js → PostgREST → 数据库。
 * PostgREST 是一个独立服务，必须由完整的 Supabase 本地栈提供（需要 Docker）。
 * 当前环境没有它。
 *
 * 关键在于**怎么表达这件事**：
 *
 *   ❌ 用 describe.skip / it.skip
 *      → 报告里显示为 "skipped"，混在通过数旁边，久而久之被当成已覆盖
 *
 *   ✅ 一条会通过的测试，明确断言「这个实现尚未被验证」
 *      → 它出现在通过列表里，但标题就写着 not verified，任何人看报告
 *        都知道 Supabase adapter 的正确性**没有**被这套契约证明过
 *
 * 换句话说：不装作验证过，也不假装这个文件不存在。
 *
 * ## 接入条件
 *
 * 具备以下之一时，把 runPhotoRepositoryContract 挂上来：
 *   · 本地跑起完整 Supabase（pnpm db:start，需要 Docker）
 *   · 有一个可用的远程 staging
 *
 * 届时同一套契约会跑两遍，两个实现的行为差异会立刻暴露 ——
 * 那也是判断「旧 adapter 能否安全淘汰」的依据。
 */

import { describe, it, expect } from 'vitest';

/** 完整 Supabase 栈是否可用。目前只看环境变量，不做网络探测。 */
function supabaseStackAvailable(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && key && process.env.RUN_SUPABASE_CONTRACT === '1');
}

describe('PhotoRepository 契约 · 遗留 Supabase 实现', () => {
  it('【未验证 not verified】需要完整 Supabase 栈才能运行', () => {
    const available = supabaseStackAvailable();

    if (available) {
      throw new Error(
        'Supabase 栈可用，但契约测试还没挂上来。' +
          '请把 runPhotoRepositoryContract 接到 SupabasePhotoRepository 上。'
      );
    }

    // 这条断言的意义不在于「通过」，而在于让报告里始终存在一行明确的
    // 「这个实现没有被验证」。它是一条待办，不是一个成就。
    expect(available).toBe(false);
  });

  it('【未验证 not verified】旧 photoStorage 的字段映射未被契约覆盖', () => {
    // 审计发现的两个 Gallery bug（locationId / metadata 丢失）就出在这一层。
    // 修复已经做了，但**修复本身没有被自动化测试守护** ——
    // PostgresPhotoRepository 的契约覆盖的是新实现，不是旧的那条路径。
    //
    // 这是当前测试体系里最明确的一个缺口，写在这里以免被遗忘。
    expect(supabaseStackAvailable()).toBe(false);
  });
});
