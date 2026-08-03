/**
 * @tc/domain —— 领域层
 *
 * 硬约束（scripts/check-architecture.mjs 强制）：
 *   · 零运行时依赖
 *   · 不 import react / next / node IO / pg / @supabase/*
 *   · 纯类型与纯函数
 *
 * 这里的东西对所有调用方（HTTP、CLI、迁移脚本、测试）语义一致。
 * 需要 IO 的实现在 infrastructure-*，用例编排在 application。
 */
export * from './actor';
export * from './account';
export * from './errors';
export * from './storage';
export * from './journey';
export * from './moment';
export * from './asset';
export * from './presentation';
export * from './work';
