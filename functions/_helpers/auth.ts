import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getAdminAuth() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (projectId && privateKey && clientEmail) {
      initializeApp({
        credential: cert({
          projectId,
          privateKey,
          clientEmail,
        }),
      });
    } else {
      initializeApp();
    }
  }

  return getAuth();
}

export async function getSession(token: string): Promise<{ user_id: string; email?: string } | null> {
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return {
      user_id: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
    };
  } catch {
    return null;
  }
}

export function getToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const match = (req.headers.get('Cookie') ?? '').match(/session=([^;]+)/);
  return match?.[1] ?? null;
}

export function setCookie(token: string, expires: Date): string {
  return `session=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}`;
}

export function clearCookie(): string {
  return 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}
