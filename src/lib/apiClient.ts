import { auth } from './firebase';

export interface ApiHeaders {
  userId: string;
  userEmail: string;
}

export async function buildHeaders(headers: ApiHeaders): Promise<Record<string, string>> {
  const token = await auth?.currentUser?.getIdToken();
  const normalizedEmail = headers.userEmail.trim().toLowerCase();
  return {
    'Content-Type': 'application/json',
    ...(normalizedEmail ? { 'x-gigboy-user-email': normalizedEmail } : {}),
    ...(headers.userId ? { 'x-gigboy-user-id': headers.userId } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
