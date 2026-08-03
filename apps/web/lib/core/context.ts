/**
 * 新核心在 Web 层的入口
 *
 * 这里做三件事，且只做这三件：
 *   1. 维护一个连接池
 *   2. 把 Better Auth 的 session 翻译成领域层的 Actor
 *   3. 把两者组装成 UnitOfWork 交给用例
 *
 * **没有任何业务逻辑。** 页面调用 @tc/application 的用例，用例调 Repository。
 * 这一层薄到可以一眼看完，是刻意的 —— 旧系统的教训是业务逻辑一旦渗进
 * 路由文件，就再也不可能整体迁移或整体测试。
 */

import { redirect } from 'next/navigation';
import { Pool } from 'pg';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import { systemClock, type AccountDeps, type FinalizeDeps } from '@tc/application';
import {
  ANONYMOUS,
  accountStatusExplanation,
  canAuthenticate,
  userActor,
  type Actor,
  type PersistedAccountStatus,
} from '@tc/domain';
import { AuthRequiredError, getServerSession } from '@/lib/auth/helpers';
import { AccountNotActiveError } from '@/lib/core/errors';
import { getObjectStorage } from '@/lib/core/storage';
import { tokenIssuer } from '@/lib/core/tokens';

/**
 * 连接池挂在 globalThis 上。
 *
 * Next 的开发模式每次改文件都会重新求值模块，不缓存的话会持续泄漏连接池，
 * 改十几次就把 Postgres 的 max_connections 打爆 —— 症状是「开发一会儿之后
 * 所有页面都连不上数据库」，很难联想到是热重载造成的。
 */
const globalForPool = globalThis as unknown as { __tcCorePool?: Pool };

function getPool(): Pool {
  if (!globalForPool.__tcCorePool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL 未配置 —— 新核心需要一个标准 PostgreSQL（ADR-000）');
    }
    globalForPool.__tcCorePool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForPool.__tcCorePool;
}

/** 每次调用都新建一个 UnitOfWork —— 它本身无状态，共享的是底下的池 */
export function getCore(): PostgresUnitOfWork {
  return new PostgresUnitOfWork(getPool());
}

/**
 * session → Actor，**并且复查账号状态**。
 *
 * ## 为什么这里必须查一次库
 *
 * 停用账号时会把 session 行全部删掉，但那挡不住已经签发的 cookie：
 * Better Auth 的 cookieCache 在最长 5 分钟内直接信任签名 cookie，根本不查库。
 * 也就是说，只删 session 行的话，一个刚被停用的账号还能继续操作 5 分钟。
 *
 * 五分钟足够删掉一整个 Journey。所以每次解析身份都复查一次状态 ——
 * 代价是一次主键查询，换来的是「停用」在下一次请求就生效。
 *
 * 建立 session 那一侧也有一道（lib/auth.ts 的 databaseHooks），
 * 两道都要有：那一道防止重新登录，这一道处理已经在手上的凭据。
 */
async function resolveSession(): Promise<
  { kind: 'anonymous' } | { kind: 'blocked'; status: PersistedAccountStatus } | {
    kind: 'user';
    actor: Actor;
  }
> {
  const session = await getServerSession();
  if (!session?.user?.id) return { kind: 'anonymous' };

  const status = await getCore().accounts.findStatus(ANONYMOUS, session.user.id);
  // status 为 null 表示 user 行已经不存在了 —— 账号已被永久删除，
  // 而这个 cookie 还没过期。当成停用处理，不能放行。
  if (!status) return { kind: 'blocked', status: 'disabled' };
  if (!canAuthenticate(status)) return { kind: 'blocked', status };

  return {
    kind: 'user',
    actor: userActor(session.user.id, session.session?.id ?? 'unknown'),
  };
}

/**
 * 当前调用者。
 *
 * 没登录返回 anonymous 而不是抛错 —— 发布页要能被匿名访问，
 * 「未登录」在这个系统里是一种合法身份，不是错误状态（ADR-001）。
 *
 * 账号被停用时同样返回 anonymous：对**公开路径**而言，一个不能认证的身份
 * 就是访客。这一点很重要 —— 否则被停用的作者还能看到自己的 private 发布页，
 * 「下架」就有了一个例外。
 */
export async function getActor(): Promise<Actor> {
  const resolved = await resolveSession();
  return resolved.kind === 'user' ? resolved.actor : ANONYMOUS;
}

/**
 * 需要登录的页面用这个。
 *
 * 停用状态抛 AccountNotActiveError 而不是 AuthRequiredError ——
 * 这里是 /studio，用户有权知道自己的账号发生了什么。
 */
export async function requireActor(): Promise<Actor> {
  const resolved = await resolveSession();
  if (resolved.kind === 'blocked') throw new AccountNotActiveError(resolved.status);
  if (resolved.kind === 'anonymous') throw new AuthRequiredError();
  return resolved.actor;
}

/**
 * 页面用的版本：认证失败时**跳转**而不是抛错。
 *
 * 为什么不让 requireActor 直接跳：Server Action 里那层 `run()` 包着
 * try/catch，而 Next 的 redirect() 是靠抛异常实现的 —— 跳转会被自己的
 * catch 吞掉，变成一条「操作没有成功」的错误提示。
 *
 * 所以分成两个：页面跳转，动作抛错（由 toUserMessage 翻译成人话）。
 */
export async function requirePageActor(): Promise<Actor> {
  const resolved = await resolveSession();
  if (resolved.kind === 'user') return resolved.actor;

  const notice =
    resolved.kind === 'blocked'
      ? accountStatusExplanation(resolved.status)
      : '请先登录。';
  redirect(`/login?notice=${encodeURIComponent(notice)}`);
}

// ── 账号生命周期的依赖装配 ───────────────────────────────────────────────────

/** 申请 / 撤销删除用。不含 storage —— 那两步不碰对象存储。 */
export function getAccountDeps(): AccountDeps {
  return { core: getCore(), clock: systemClock, tokens: tokenIssuer };
}

/**
 * 永久删除用。storage 是必填的 —— 少了它，行删了字节还在。
 * 运维脚本走的是同一个装配函数，不存在「脚本用了另一套依赖」。
 */
export function getFinalizeDeps(): FinalizeDeps {
  return { ...getAccountDeps(), storage: getObjectStorage() };
}
