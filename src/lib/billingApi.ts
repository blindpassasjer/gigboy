import { type ApiHeaders, buildHeaders } from './apiClient';

async function postJson<T>(path: string, body: Record<string, unknown>, headers: ApiHeaders): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: await buildHeaders(headers),
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) {
      throw new Error('Billing is not available in this deployment yet.');
    }

    const errorMessage = typeof payload.error === 'string' ? payload.error : 'Billing request failed.';
    throw new Error(errorMessage);
  }

  return payload as T;
}

export async function createCheckoutSession(params: {
  userId: string;
  userEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  bandId?: string;
  newBandData?: { name?: string };
  extraMemberPriceId?: string;
  extraMemberCount?: number;
}) {
  return postJson<{ url: string } | { updated: true }>('/api/stripe/create-checkout', params, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}

export async function createPortalSession(params: {
  userId: string;
  userEmail: string;
  returnUrl: string;
}) {
  return postJson<{ url: string }>('/api/stripe/create-portal', params, {
    userId: params.userId,
    userEmail: params.userEmail,
  });
}