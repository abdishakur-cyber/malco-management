import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 2 ** 17, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();
export const validEmail = (value) => value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, options);
  return salt + ':' + hash.toString('hex');
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(await derive(password, salt, 64, options), Buffer.from(hash, 'hex'));
}
