/**
 * 写入前的账号状态检查 —— ADR-007 的应用层一侧
 *
 * ## 为什么数据库触发器不够
 *
 * `require_active_owner`（migration 20260809000000）挡住了所有内容表的
 * INSERT，覆盖面比应用层大得多：用例、迁移脚本、运维 SQL、任何新增的
 * 后台任务，一个都跑不掉。
 *
 * 但它只能挡住**数据库写入**。一个典型的后台任务是这样的：
 *
 *   1. 转码 / 缩略图 / 外部 API 调用      ← 花了时间和钱
 *   2. 写 ObjectStorage 字节              ← 磁盘上多了一个对象
 *   3. INSERT assets                      ← 触发器在这里拒绝
 *
 * 结果：数据库是干净的，磁盘上留下一个**任何表都查不到**的孤儿对象。
 * 对一个刚刚申请删除账号的用户来说，这正好是最不该发生的事。
 *
 * 所以顺序必须反过来：先问状态，再产生任何外部副作用。
 *
 * ## 两层的分工
 *
 *   应用层（这里）   避免产生外部孤儿；给出人话错误
 *   数据库触发器     兜底，覆盖所有绕过应用层的路径
 *
 * 两层都要有。只有应用层，漏掉一个调用点就是一个洞；
 * 只有触发器，每个洞都会留下磁盘垃圾。
 */

import { ForbiddenError, canCreateContent, requireUser, type Actor } from '@tc/domain';
import type { CoreRepositories } from '../ports/unit-of-work';

/**
 * 确认调用者的账号可以新增内容，返回它的 userId。
 *
 * **在任何外部副作用（转码、写对象存储、调外部 API）之前调用。**
 * 放在用例最开头 —— 放在中间就意味着前面那几步已经花掉了。
 */
export async function requireActiveOwner(
  repos: CoreRepositories,
  actor: Actor
): Promise<string> {
  const { userId } = requireUser(actor);
  const status = await repos.accounts.findStatus(actor, userId);

  // status 为 null：user 行已经不存在（账号已被永久删除），而这个调用
  // 还在路上。和停用一样拒绝 —— 「查不到状态」绝不能等于「放行」。
  if (!status || !canCreateContent(status)) {
    throw new ForbiddenError(
      '这个账号已被停用或正在等待删除，系统不再为它写入新内容（ADR-007）'
    );
  }
  return userId;
}
