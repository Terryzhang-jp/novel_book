/**
 * @tc/domain —— 领域层
 *
 * 硬约束（scripts/check-architecture.mjs 强制）：
 *   · 零运行时依赖
 *   · 不 import react / next / node IO / pg / @supabase/*
 *   · 纯类型与纯函数
 *
 * Phase 2 会在这里加 Journey / Moment / Work / Publication。
 * 现在只有 Actor —— 它是 ADR-001 的直接产物，也是 Repository 契约的前提。
 */
export * from './actor';
export * from './storage';
