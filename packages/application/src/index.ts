/**
 * @tc/application —— 用例层
 *
 * 依赖方向：application → domain。**不依赖任何 infrastructure。**
 * 它只认端口（ports/），不认 pg、不认 Next、不认 Supabase。
 *
 * 这一层是「产品能做什么」的完整清单。想知道系统有哪些能力，
 * 读 use-cases/ 的导出即可，不用翻 API 路由。
 */

export * from './ports/repositories';
export * from './ports/media';
export * from './ports/clock';
export * from './ports/notifications';
export * from './ports/unit-of-work';
export * from './snapshot';
export * from './use-cases/account';
export * from './use-cases/guards';
export * from './use-cases/journey';
export * from './use-cases/moment';
export * from './use-cases/asset';
export * from './use-cases/work';
export * from './use-cases/publication';
