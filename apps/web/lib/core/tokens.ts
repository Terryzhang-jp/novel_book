/**
 * 一次性令牌的签发 —— TokenIssuer 端口的实现
 *
 * 只有一个消费者（撤销删除），所以和 media-probe 一样放在 apps/web，
 * 不为它单开一个包。
 *
 * ## 三个不能省的细节
 *
 * 1. **randomBytes，不是 Math.random。**
 *    这个令牌是一个没有 session 的人证明「我就是申请删除的那个人」的唯一凭据。
 *    可预测的随机数意味着任何人都能撤销别人的删除申请。
 *
 * 2. **落库的是 sha256，明文不落库。**
 *    拿到数据库备份的人不该因此获得撤销任意账号删除的能力。
 *
 * 3. **base64url，不是 hex。**
 *    这串东西要出现在 URL 里，也要能被用户从聊天记录里复制粘贴。
 *    base64url 没有需要转义的字符，同样的熵下比 hex 短三分之一。
 */

import { createHash, randomBytes } from 'node:crypto';
import type { IssuedToken, TokenIssuer } from '@tc/application';

/** 32 字节 = 256 位。够到「不可能猜中」，短到能放进一行 URL。 */
const TOKEN_BYTES = 32;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export class CryptoTokenIssuer implements TokenIssuer {
  issue(): IssuedToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return { token, hash: sha256Hex(token) };
  }

  hash(token: string): string {
    return sha256Hex(token);
  }
}

export const tokenIssuer = new CryptoTokenIssuer();
