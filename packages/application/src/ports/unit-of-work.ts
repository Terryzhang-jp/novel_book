/**
 * 事务边界
 *
 * ## 为什么需要一个显式的端口
 *
 * Phase 2A 里有三处操作**必须整体成功或整体失败**：
 *
 *   1. 追加一版理解 —— 旧版标记 superseded + 新版插入为 current
 *   2. 发布       —— 建 WorkVersion + 建/重指 Publication
 *   3. 删除 Moment —— 给引用它的 block 写墓碑 + 删除 Moment
 *
 * 第 1 条断在中间会留下**零个 current**：数据库的唯一索引挡得住「两个
 * current」，挡不住「一个都没有」。那是静默的数据损坏 —— 用户打开页面
 * 只会看到理解凭空消失。
 *
 * 把事务做成端口而不是直接在用例里写 `BEGIN`，是为了让用例保持零 SQL：
 * 用例只声明「这几步是一个原子操作」，怎么实现是 infrastructure 的事。
 */

import type {
  InterpretationRepository,
  JourneyRepository,
  MomentRepository,
  ObservationRepository,
  PublicationRepository,
  WorkRepository,
} from './repositories';

export interface CoreRepositories {
  readonly journeys: JourneyRepository;
  readonly moments: MomentRepository;
  readonly observations: ObservationRepository;
  readonly interpretations: InterpretationRepository;
  readonly works: WorkRepository;
  readonly publications: PublicationRepository;
}

export interface UnitOfWork extends CoreRepositories {
  /**
   * 在一个事务里执行 fn。
   *
   * fn 收到的是**绑定到该事务连接**的一套 repository —— 用外面那套（走连接池
   * 的）会跑在事务之外，这是这类代码最常见的 bug，所以签名上不给这个机会。
   */
  transaction<T>(fn: (repos: CoreRepositories) => Promise<T>): Promise<T>;
}
