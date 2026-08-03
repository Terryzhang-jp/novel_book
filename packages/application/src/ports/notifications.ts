/**
 * 账号生命周期的对外通知
 *
 * ## 为什么现在就抽这个接口，却不接邮件供应商
 *
 * 账号生命周期的用例已经稳定下来了（申请、撤销、临近到期、已删除），
 * 现在是**固定通知边界成本最低的时点**。
 *
 * 等到公开 Beta 前再来抽象，`sendEmail(...)` 会已经散落在 Server Action、
 * 路由和用例里 —— 那时候要把它们收回一个接口，改动面比现在大得多，
 * 而且很容易漏掉一两处，让某个状态变更悄悄不发通知。
 *
 * 反过来，现在就选供应商是另一种浪费：模板、退信处理、发送域名、
 * 限流策略都还没有答案，选了也要重做。
 *
 * 所以：**接口现在定，实现先记录不发送。**
 *
 * ## 明文令牌不进 outbox
 *
 * 撤销令牌的明文只在生成那一刻存在，库里只有 sha256（ADR-007）。
 * 那是刻意的：拿到数据库备份的人不该获得撤销任意账号删除的能力。
 *
 * 所以这个接口收的是**已经拼好的 URL**，而实现**不得把它长期落库**。
 * 第一版的失败策略是：发送失败就记一条，页面上仍然把撤销链接显示给用户
 * （那是他当下唯一一次看到它的机会）。
 *
 * 要做可靠投递（重试、outbox）就必须先回答「明文令牌怎么安全地暂存」——
 * 加密 outbox，或者改成可重新签发的通知链接。那个决定留到 Beta 前。
 */

export interface DeletionRequestedNotice {
  readonly userId: string;
  readonly email: string;
  /** 完整的撤销地址。**实现不得持久化它。** */
  readonly cancellationUrl: string;
  readonly expiresAt: Date;
}

export interface DeletionCancelledNotice {
  readonly userId: string;
  readonly email: string;
}

export interface DeletionApproachingNotice {
  readonly userId: string;
  readonly email: string;
  readonly deletesAt: Date;
}

export interface AccountDisabledNotice {
  readonly userId: string;
  readonly email: string;
  readonly reason?: string;
}

/**
 * 四种通知。
 *
 * `deletionApproaching` 现在还没有触发者 —— 它需要一个「到期前 N 天」的
 * 定时任务。放进接口是因为它属于同一组产品承诺：一个 30 天后会消失的
 * 账号，用户理应在消失之前被提醒一次。**先把位置留出来，
 * 比将来在别处临时加一个发送调用要好。**
 */
export interface AccountLifecycleNotifier {
  deletionRequested(notice: DeletionRequestedNotice): Promise<void>;
  deletionCancelled(notice: DeletionCancelledNotice): Promise<void>;
  deletionApproaching(notice: DeletionApproachingNotice): Promise<void>;
  accountDisabled(notice: AccountDisabledNotice): Promise<void>;
}

export type RecordedNotice =
  | { readonly kind: 'deletionRequested'; readonly notice: DeletionRequestedNotice }
  | { readonly kind: 'deletionCancelled'; readonly notice: DeletionCancelledNotice }
  | { readonly kind: 'deletionApproaching'; readonly notice: DeletionApproachingNotice }
  | { readonly kind: 'accountDisabled'; readonly notice: AccountDisabledNotice };

/**
 * 本地实现：**记录，不发送**。
 *
 * 开发和测试都用它。测试可以断言「申请删除时确实产生了一条通知，
 * 而且里面的撤销地址是对的」—— 这正是接线有没有接上的判定标准，
 * 不需要真的发一封邮件。
 *
 * 生产环境用它是**明确的降级**：状态变更照常发生，用户收不到信。
 * 所以它会把每条通知打进日志，而不是静默吞掉。
 */
export class RecordingAccountLifecycleNotifier implements AccountLifecycleNotifier {
  private readonly sent: RecordedNotice[] = [];

  constructor(private readonly log: (message: string) => void = () => {}) {}

  private record(entry: RecordedNotice): void {
    this.sent.push(entry);
    // 不记 cancellationUrl —— 它带着明文令牌，进日志等于进了一个
    // 长期保存、多人可读、还会被转发的地方。
    this.log(`[notify] ${entry.kind} → ${entry.notice.email}（未真正发送）`);
  }

  async deletionRequested(notice: DeletionRequestedNotice): Promise<void> {
    this.record({ kind: 'deletionRequested', notice });
  }
  async deletionCancelled(notice: DeletionCancelledNotice): Promise<void> {
    this.record({ kind: 'deletionCancelled', notice });
  }
  async deletionApproaching(notice: DeletionApproachingNotice): Promise<void> {
    this.record({ kind: 'deletionApproaching', notice });
  }
  async accountDisabled(notice: AccountDisabledNotice): Promise<void> {
    this.record({ kind: 'accountDisabled', notice });
  }

  /** 测试用。返回副本，避免调用方改到内部数组。 */
  recorded(): readonly RecordedNotice[] {
    return [...this.sent];
  }
  clear(): void {
    this.sent.length = 0;
  }
}
