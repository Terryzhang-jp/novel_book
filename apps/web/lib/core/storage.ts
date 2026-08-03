/**
 * 新核心的对象存储接线
 *
 * ADR-002：默认 LocalFileObjectStorage —— 文件相关的功能在
 * 「本地 Postgres + 无 Docker + 无云账号」的环境里就能完整开发和测试。
 * 换 S3 / R2 / Supabase 只需要在这里换一个实现。
 *
 * ## 存储根目录的硬性约束
 *
 * 必须在 `public/` 之外。挂进静态目录的话，任何人都能
 * `GET /uploads/users/{别人的id}/sha256/...` 绕过整个 Repository 层 ——
 * 数据库权限做得再对也没用。
 *
 * `LocalFileObjectStorage` 的构造函数会拒绝含 `public` / `static` 段的路径，
 * 所以这个约束是**跑不掉的**，不是一句注释。
 */

import { join } from 'node:path';
import {
  buildObjectKey,
  LocalFileObjectStorage,
} from '@tc/infrastructure-storage';
import type { StorageKit } from '@tc/application';
import { FfmpegAudioDeriver } from './audio-deriver';
import { SharpImageDeriver, SharpMediaProbe } from './media-probe';

const globalForStorage = globalThis as unknown as {
  __tcStorage?: LocalFileObjectStorage;
  __tcProbe?: SharpMediaProbe;
  __tcDeriver?: SharpImageDeriver;
  __tcAudioDeriver?: FfmpegAudioDeriver;
};

/** 默认落在 apps/web/.storage（已 gitignore）。生产用 TC_STORAGE_ROOT 指到别处。 */
function storageRoot(): string {
  return process.env.TC_STORAGE_ROOT ?? join(process.cwd(), '.storage');
}

export function getObjectStorage(): LocalFileObjectStorage {
  if (!globalForStorage.__tcStorage) {
    globalForStorage.__tcStorage = new LocalFileObjectStorage({
      root: storageRoot(),
      // 不给密钥则每次进程启动随机生成 —— 开发够用，但那样重启后旧签名
      // 全部失效。生产必须显式配置。
      ...(process.env.TC_STORAGE_URL_SECRET
        ? { urlSigningSecret: process.env.TC_STORAGE_URL_SECRET }
        : {}),
      urlBasePath: '/api/objects',
    });
  }
  return globalForStorage.__tcStorage;
}

export function getStorageKit(): StorageKit {
  return { storage: getObjectStorage(), buildObjectKey };
}

export function getMediaProbe(): SharpMediaProbe {
  globalForStorage.__tcProbe ??= new SharpMediaProbe();
  return globalForStorage.__tcProbe;
}

export function getImageDeriver(): SharpImageDeriver {
  globalForStorage.__tcDeriver ??= new SharpImageDeriver();
  return globalForStorage.__tcDeriver;
}

export function getAudioDeriver(): FfmpegAudioDeriver {
  globalForStorage.__tcAudioDeriver ??= new FfmpegAudioDeriver();
  return globalForStorage.__tcAudioDeriver;
}
