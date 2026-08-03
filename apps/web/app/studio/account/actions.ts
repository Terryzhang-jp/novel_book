'use server';

/**
 * 账号生命周期里**用户自己**能做的动作
 *
 * 只有一个：申请删除。
 *
 * 撤销不在这里 —— 申请之后 session 全部失效，用户根本进不到 /studio。
 * 它在 app/account/actions.ts，那是一条不需要登录的路径。
 *
 * 停用 / 恢复 / 永久删除也不在这里：它们是运维动作，
 * 入口是 scripts/account-lifecycle.mjs。做成页面上的按钮，
 * 等于让「不可逆」离一次误点只差一个确认框。
 */

import { redirect } from 'next/navigation';
import { requestAccountDeletion } from '@tc/application';
import { getAccountDeps, requireActor } from '@/lib/core/context';
import { toUserMessage } from '@/lib/core/errors';

export async function requestDeletionAction(form: FormData): Promise<never> {
  let target: string;
  try {
    const actor = await requireActor();

    // 二次确认。要求原样打出这五个字不是仪式感 —— 这一步之后账号就
    // 登不进来了，而恢复要靠一个只出现一次的令牌。误点的代价太高。
    if (String(form.get('confirm') ?? '').trim() !== '删除我的账号') {
      throw new Error('确认文字不匹配，账号没有任何变化。');
    }

    const reason = String(form.get('reason') ?? '').trim();
    const result = await requestAccountDeletion(getAccountDeps(), actor, {
      ...(reason ? { reason } : {}),
    });

    // ⚠️ 令牌明文只在这一次存在（库里只有 sha256）。
    // 它进 URL 是为了让下一个页面能显示它 —— 那个页面必须是公开的，
    // 因为此刻这个人已经没有 session 了。
    target = `/account/deletion-requested?token=${encodeURIComponent(result.cancelToken)}`;
  } catch (error) {
    target = `/studio/account?error=${encodeURIComponent(toUserMessage(error))}`;
  }
  redirect(target);
}
