import { randomBytes, randomUUID } from 'node:crypto';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const newTalkId = (): string => randomUUID();

/**
 * A share token: 22 characters of base62, ~131 bits.
 *
 * This is the whole of the protection on a share link, so it comes from the
 * CSPRNG, not Math.random. Rejection sampling rather than `% 62`, which would
 * make the first four characters of the alphabet very slightly likelier — no
 * practical risk at this length, but there is no reason to introduce a bias
 * when avoiding it costs a loop.
 */
export function newShareToken(length = 22): string {
  const out: string[] = [];
  const limit = 256 - (256 % BASE62.length);
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte < limit) {
        out.push(BASE62[byte % BASE62.length]);
        if (out.length === length) break;
      }
    }
  }
  return out.join('');
}
