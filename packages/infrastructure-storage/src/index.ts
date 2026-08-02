/**
 * @tc/infrastructure-storage —— ObjectStorage 的实现
 *
 * 接口在 @tc/domain（纯类型，零依赖）。这里放需要 IO 和 crypto 的实现。
 * ADR-000：禁止依赖任何 Supabase SDK。
 */
export * from './key';
export * from './in-memory';
export * from './local-file';
