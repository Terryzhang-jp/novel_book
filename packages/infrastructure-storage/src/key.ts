/**
 * 对象 key 的构造 —— 需要 sha256，所以放在 infrastructure 而不是 domain
 * （domain-pure 规则禁止 node:crypto）。
 */

import { createHash } from 'node:crypto';
import {
  InvalidObjectKeyError,
  type ObjectKey,
} from '@tc/domain';

/** MIME → 扩展名。只列我们真正支持的类型，未知类型直接拒绝。 */
const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  // 发布派生用的统一音频格式（15C）。Ogg 容器 + Opus 编码，
  // 扩展名用 opus 而不是 ogg —— 后者不区分里面是 Vorbis 还是 Opus。
  'audio/ogg': 'opus',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

export function extForContentType(contentType: string): string {
  const normalized = contentType.split(';')[0]!.trim().toLowerCase();
  const ext = MIME_TO_EXT[normalized];
  if (!ext) {
    throw new InvalidObjectKeyError(contentType, `不支持的 contentType`);
  }
  return ext;
}

export function sha256Hex(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

const USER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * 由内容和用户构造 key。
 *
 * 同一用户 + 同一字节 → 同一 key（幂等去重）
 * 不同用户 + 同一字节 → 不同 key（命名空间隔离，见 ADR-002）
 */
export function buildObjectKey(
  userId: string,
  body: Uint8Array,
  contentType: string
): ObjectKey {
  if (!USER_ID_RE.test(userId)) {
    throw new InvalidObjectKeyError(userId, 'userId 非法');
  }
  const hash = sha256Hex(body);
  const ext = extForContentType(contentType);
  return `users/${userId}/sha256/${hash.slice(0, 2)}/${hash}.${ext}`;
}
