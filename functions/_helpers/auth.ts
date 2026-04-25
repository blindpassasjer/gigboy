/// <reference types="@cloudflare/workers-types" />

const ITERATIONS = 100_000;
const KEY_BYTES = 32;

function toHex(buf: Uint8Array): string {
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key, KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  const salt = fromHex(saltHex);
  const expected = fromHex(hashHex);
  const actual = await pbkdf2(password, salt);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function getSession(
  db: D1Database, token: string,
): Promise<{ user_id: string } | null> {
  return db
    .prepare("SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first<{ user_id: string }>();
}

export function getToken(req: Request): string | null {
  const match = (req.headers.get('Cookie') ?? '').match(/session=([^;]+)/);
  return match?.[1] ?? null;
}

export function setCookie(token: string, expires: Date): string {
  return `session=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}`;
}

export function clearCookie(): string {
  return 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}
