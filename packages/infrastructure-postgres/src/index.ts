/**
 * @tc/infrastructure-postgres —— 新核心的 PostgreSQL adapter
 *
 * 依赖方向：infrastructure → application → domain。反过来不成立。
 * 用例层看不见这个包的任何一个名字。
 *
 * 与 @tc/legacy-adapters 的区别：那个包服务旧的 Photo 模型，是迁移期的跳板；
 * 这个包是 Phase 2A 九张核心表的正式实现。
 */

export * from './queryable';
export * from './rows';
export * from './journey-repository';
export * from './moment-repository';
export * from './observation-repository';
export * from './interpretation-repository';
export * from './work-repository';
export * from './publication-repository';
export * from './asset-repository';
export * from './published-asset-repository';
export * from './unit-of-work';
