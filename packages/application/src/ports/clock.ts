/**
 * 时钟 —— 让「30 天之后」成为可测试的事
 *
 * ## 为什么不直接用 `new Date()`
 *
 * 账号删除的核心是一段 30 天的等待期。它有三条必须被验证的边界：
 *
 *   到期前一刻     不能执行永久删除
 *   到期后         可以执行
 *   到期后         不能再撤销
 *
 * 用 `new Date()` 的话，验证这三条要么等 30 天，要么改系统时间，
 * 要么在测试里把日期算错然后自己骗自己。三种都不行。
 *
 * 注入之后，测试推进时间只要换一个 Clock —— 而**生产代码走的是同一条路径**，
 * 不存在「测试专用分支」。
 *
 * ## 为什么不是每个用例都收一个 `now: Date` 参数
 *
 * Phase 2A 的用例确实是那样做的（`publishWork(..., { now })`），
 * 对单次操作足够了。但删除流程里同一次调用要多次读取当前时间
 * （判断到期、写状态变更时间、写审计时间），传参会让调用方有机会
 * 传三个不一样的值 —— 而那三个时间必须一致，否则审计日志会和状态自相矛盾。
 */

export interface Clock {
  now(): Date;
}

/** 生产用。唯一一处调用 `new Date()` 的地方。 */
export const systemClock: Clock = {
  now: () => new Date(),
};

/**
 * 固定在某一刻。
 *
 * 放在生产代码里而不是测试目录：运维脚本也需要它（`--now=2026-09-05T00:00:00Z`
 * 用来演练「到期那天会发生什么」），而演练必须走和生产完全相同的代码。
 */
export function fixedClock(at: Date): Clock {
  const frozen = new Date(at.getTime());
  return { now: () => new Date(frozen.getTime()) };
}

/**
 * 从固定时刻起可手动推进。测试用。
 *
 * 只有 advance，没有 rewind —— 时间不会倒流，能倒流的时钟会让测试写出
 * 现实中不可能发生的序列。
 */
export function advanceableClock(start: Date): Clock & { advance(ms: number): void } {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance(ms: number) {
      if (ms < 0) throw new Error('时间不会倒流');
      current += ms;
    },
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 一次性令牌的签发。
 *
 * 为什么是端口：生成随机数需要 `node:crypto`，而 domain 和 application
 * 都不许 import 它（check-architecture 的 domain-pure 规则）。
 *
 * 为什么同时返回明文和哈希：**明文只能出现这一次**。落库的是哈希，
 * 明文交给调用方展示给用户，之后任何人（包括拿到数据库的人）都无法还原它。
 */
export interface IssuedToken {
  /** 给用户看的明文。只在这一次出现。 */
  readonly token: string;
  /** 落库的 sha256(hex) */
  readonly hash: string;
}

export interface TokenIssuer {
  issue(): IssuedToken;
  /** 用户拿着明文回来时，算出用于查表的哈希 */
  hash(token: string): string;
}
