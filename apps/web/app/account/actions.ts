'use server';

/**
 * 撤销删除 —— **不需要登录**
 *
 * 这是整个系统里唯一一个「匿名调用者可以改写账号状态」的动作，
 * 所以它的理由必须写清楚：
 *
 * 申请删除的那一刻，该用户的全部 session 被撤销，并且认证中间件
 * 从此拒绝为他建立新 session（ADR-007）。如果撤销要求先登录，
 * 那就没有任何人能撤销 —— 冷静期成了一句空话。
 *
 * 所以身份证明换成了一次性令牌：256 位随机数，库里只存 sha256。
 * 它能且只能做一件事 —— 把**它自己对应的那个账号**从 deletion_requested
 * 拉回 active。
 */

import { redirect } from 'next/navigation';
import { cancelAccountDeletion } from '@tc/application';
import { ANONYMOUS } from '@tc/domain';
import { getAccountDeps } from '@/lib/core/context';
import { toUserMessage } from '@/lib/core/errors';

export async function cancelDeletionAction(form: FormData): Promise<never> {
  const token = String(form.get('token') ?? '').trim();
  let target: string;
  try {
    if (!token) throw new Error('请填写撤销令牌。');
    await cancelAccountDeletion(getAccountDeps(), ANONYMOUS, token);
    target = `/login?notice=${encodeURIComponent('已撤销删除申请，现在可以正常登录了。')}`;
  } catch (error) {
    target = `/account/restore?error=${encodeURIComponent(toUserMessage(error))}`;
  }
  redirect(target);
}
