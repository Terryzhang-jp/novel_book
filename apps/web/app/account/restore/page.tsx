/**
 * /account/restore —— 用令牌撤销删除申请
 *
 * 公开路径。理由见 app/account/actions.ts：申请删除之后没有任何 session
 * 能存在，所以撤销不可能要求先登录。
 *
 * 页面本身不查库、不显示账号信息 —— 拿着一个错误的令牌打开这一页，
 * 除了「令牌不对」什么都看不到。
 */

import Link from 'next/link';
import { DELETION_GRACE_DAYS } from '@tc/domain';
import { cancelDeletionAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function RestorePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">撤销删除申请</h1>
      <p className="mt-3 text-sm text-neutral-700">
        在 {DELETION_GRACE_DAYS} 天等待期内，用申请时拿到的令牌可以把账号恢复正常。
        恢复之后内容和发布页都会回到原样。
      </p>

      {error ? (
        <p
          className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          data-testid="restore-error"
        >
          {error}
        </p>
      ) : null}

      <form action={cancelDeletionAction} className="mt-6">
        <label className="block text-sm font-medium" htmlFor="token">
          撤销令牌
        </label>
        <input
          id="token"
          name="token"
          defaultValue={token ?? ''}
          required
          autoComplete="off"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm"
          data-testid="restore-token"
        />
        <button
          type="submit"
          className="mt-4 rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          data-testid="restore-submit"
        >
          撤销删除，恢复账号
        </button>
      </form>

      <p className="mt-8 text-sm">
        <Link href="/login" className="underline">
          返回登录页
        </Link>
      </p>
    </main>
  );
}
