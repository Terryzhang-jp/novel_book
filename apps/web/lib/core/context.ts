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

import { Pool } from 'pg';
import { PostgresUnitOfWork } from '@tc/infrastructure-postgres';
import { ANONYMOUS, userActor, type Actor } from '@tc/domain';
import { AuthRequiredError, getServerSession } from '@/lib/auth/helpers';

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
 * 当前调用者。
 *
 * 没登录返回 anonymous 而不是抛错 —— 发布页要能被匿名访问，
 * 「未登录」在这个系统里是一种合法身份，不是错误状态（ADR-001）。
 */
export async function getActor(): Promise<Actor> {
  const session = await getServerSession();
  if (!session?.user?.id) return ANONYMOUS;
  return userActor(session.user.id, session.session?.id ?? 'unknown');
}

/** 需要登录的页面用这个 */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (actor.type !== 'user') throw new AuthRequiredError();
  return actor;
}
