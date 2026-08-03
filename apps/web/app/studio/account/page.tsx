/**
 * /studio/account —— 账号状态与删除申请
 *
 * 这个页面刻意**不做**几件事：
 *
 *   没有「停用我的账号」          停用是管理员动作，不是自助功能
 *   没有「立即永久删除」按钮       冷静期存在的意义就是没有这个按钮
 *   删除申请没有做成一次点击       要打字确认，因为下一步就登不进来了
 */

import { getAccount, listAccountEvents } from '@tc/application';
import { ACCOUNT_STATUS_LABELS, accountStatusExplanation, DELETION_GRACE_DAYS } from '@tc/domain';
import { getCore, requirePageActor } from '@/lib/core/context';
import {
  Banner,
  buttonClass,
  Card,
  Field,
  fmtDateTime,
  H1,
  H2,
  inputClass,
  Muted,
  Shell,
} from '@/components/studio/chrome';
import { requestDeletionAction } from './actions';

export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<string, string> = {
  disabled: '账号被停用',
  reactivated: '账号被恢复',
  deletion_requested: '申请删除账号',
  deletion_cancelled: '撤销删除申请',
  deletion_finalized: '永久删除已执行',
  sessions_revoked: '登录状态被撤销',
  storage_cleanup_incomplete: '存储清理未完成',
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const actor = await requirePageActor();
  const core = getCore();

  const [account, events] = await Promise.all([
    getAccount(core, actor),
    listAccountEvents(core, actor),
  ]);

  return (
    <Shell>
      <H1>账号</H1>
      <Muted>{account.email}</Muted>
      <div className="mt-4">
        <Banner error={error} notice={notice} />
      </div>

      <Card>
        <p className="text-sm" data-testid="account-status">
          当前状态：<strong>{ACCOUNT_STATUS_LABELS[account.status]}</strong>
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          {accountStatusExplanation(account.status)}
        </p>
      </Card>

      <H2>删除账号</H2>
      <Card>
        <div className="mb-4 space-y-2 text-sm text-neutral-700">
          <p>点击之后立刻发生：</p>
          <ul className="list-disc pl-5">
            <li>
              你会被登出，并且<strong>在等待期内无法再登录</strong>
            </li>
            <li>你所有已发布的公开页面立刻打不开</li>
            <li>数据仍然完整保留 {DELETION_GRACE_DAYS} 天</li>
          </ul>
          <p>
            {DELETION_GRACE_DAYS} 天之后，你的旅程、片段、素材原图、作品和发布页
            会被<strong>永久删除，无法恢复</strong>。
          </p>
          <p className="text-neutral-900">
            等待期内可以撤销，但撤销需要下一页显示的那串令牌 —— 那串东西只出现一次。
          </p>
        </div>

        <form action={requestDeletionAction}>
          <Field label="为什么要删除（可以留空）">
            <input name="reason" className={inputClass} data-testid="deletion-reason" />
          </Field>
          <Field label="请打出「删除我的账号」以确认">
            <input
              name="confirm"
              className={inputClass}
              required
              autoComplete="off"
              placeholder="删除我的账号"
              data-testid="deletion-confirm"
            />
          </Field>
          <button
            type="submit"
            className={`${buttonClass} bg-red-700 hover:bg-red-800`}
            data-testid="request-deletion"
          >
            申请删除账号
          </button>
        </form>
      </Card>

      <H2>账号变更记录</H2>
      <Card>
        {events.length === 0 ? (
          <Muted>还没有任何状态变更。</Muted>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="account-events">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="text-neutral-500">{fmtDateTime(e.occurredAt.toISOString())}</span>
                <span>{EVENT_LABELS[e.type] ?? e.type}</span>
                {e.reason ? <span className="text-neutral-500">· {e.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
