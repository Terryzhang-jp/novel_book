/**
 * @tc/legacy-adapters —— 遗留能力的适配层
 *
 * 定位（ADR-000 适用范围）：把旧系统里**已经验证过的能力**接到新架构的
 * 接口上，不让旧的产品结构反向决定新核心的设计。
 *
 * 这里的类型（Photo 等）**不会**进入 @tc/domain —— 它们随遗留系统淘汰。
 */
export * from './photo/types';
export * from './photo/repository';
export * from './photo/postgres-photo-repository';
