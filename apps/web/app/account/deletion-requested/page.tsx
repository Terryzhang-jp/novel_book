/**
 * 申请删除之后落到的页面 —— 显示撤销令牌
 *
 * ## 为什么它必须是公开页面
 *
 * 走到这一步时，这个人的 session 已经在同一个事务里被全部撤销了。
 * 如果这个页面要求登录，用户会在申请成功之后被弹回登录页，
 * 而登录又被拒绝 —— 令牌永远不会被显示出来。
 *
 * ## 令牌在 URL 里安全吗
 *
 * 这是一次服务端重定向，令牌没有离开这个人的浏览器。风险是它会留在
 * 浏览历史里 —— 而这恰好是我们想要的：这串东西丢了就撤销不了了。
 *
 * 真正的补齐是把它同时发到注册邮箱，邮件通道还没接
 * （verification-gaps.json → account-cancel-token-not-emailed）。
 */

import Link from 'next/link';
import { DELETION_GRACE_DAYS } from '@tc/domain';

export const dynamic = 'force-dynamic';

export default async function DeletionRequestedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">删除申请已提交</h1>
      <p className="mt-3 text-sm text-neutral-700">
        你的公开页面已经全部下架，登录也已经关闭。数据仍然完整保存着，
        {DELETION_GRACE_DAYS} 天后被永久删除。
      </p>

      {token ? (
        <section className="mt-6 rounded border-2 border-red-300 bg-red-50 p-4">
          <h2 className="text-sm font-semibold text-red-900">
            撤销令牌 —— 这串东西只显示这一次
          </h2>
          <p className="mt-1 text-xs text-red-800">
            现在就把它存到安全的地方。服务器上只保存了它的哈希，我们无法再显示一次，
            也无法替你还原。
          </p>
          <code
            className="mt-3 block break-all rounded bg-white p-3 font-mono text-sm"
            data-testid="cancel-token"
          >
            {token}
          </code>
          <p className="mt-3 text-xs text-red-800">
            撤销地址：
            <Link
              href={`/account/restore?token=${encodeURIComponent(token)}`}
              className="underline"
              data-testid="restore-link"
            >
              /account/restore
            </Link>
          </p>
        </section>
      ) : (
        <p className="mt-6 text-sm text-neutral-600">
          没有拿到令牌。如果你需要撤销删除，请联系管理员。
        </p>
      )}

      <p className="mt-8 text-sm">
        <Link href="/login" className="underline">
          返回登录页
        </Link>
      </p>
    </main>
  );
}
