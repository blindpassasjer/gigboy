function toHex(buf: Uint8Array): string {
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function parseJwtParts(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signingInput: string; signature: Uint8Array } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))) as Record<string, unknown>;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as Record<string, unknown>;
    const signature = b64urlDecode(parts[2]);
    return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature };
  } catch {
    return null;
  }
}

/**
 * Verify a Firebase ID token (RS256 JWT) against Firebase's public JWKS.
 * Returns the user UID on success, or null on failure.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
): Promise<{ uid: string; email: string | null } | null> {
  const parsed = parseJwtParts(token);
  if (!parsed) return null;

  const { header, payload, signingInput, signature } = parsed;

  const kid = typeof header.kid === 'string' ? header.kid : null;
  const alg = typeof header.alg === 'string' ? header.alg : null;
  if (!kid || alg !== 'RS256') return null;

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  const iat = typeof payload.iat === 'number' ? payload.iat : 0;
  const iss = typeof payload.iss === 'string' ? payload.iss : '';
  const aud = payload.aud;
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;

  if (exp < now) return null;
  if (iat > now + 300) return null;
  if (iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (aud !== projectId && !(Array.isArray(aud) && aud.includes(projectId))) return null;
  if (!sub) return null;

  let jwks: { keys?: Array<Record<string, unknown>> };
  try {
    const resp = await fetch(FIREBASE_JWKS_URL);
    if (!resp.ok) return null;
    jwks = await resp.json() as typeof jwks;
  } catch {
    return null;
  }

  const jwk = jwks.keys?.find((k) => k.kid === kid);
  if (!jwk) return null;

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const data = new TextEncoder().encode(signingInput);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, data);
    if (!valid) return null;
    return { uid: sub, email };
  } catch {
    return null;
  }
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
