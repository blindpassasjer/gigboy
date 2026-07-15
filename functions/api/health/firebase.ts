/// <reference types="@cloudflare/workers-types" />
import { initializeFirebaseAdmin, listFirestoreDocuments } from '../../_helpers/firebase-admin';

type HealthPayload = {
  ok: boolean;
  configured: boolean;
  projectId?: string;
  checkedAt: string;
  latencyMs?: number;
  error?: string;
};

export const onRequestGet: PagesFunction<Record<string, string | undefined>> = async (ctx) => {
  const checkedAt = new Date().toISOString();
  const admin = initializeFirebaseAdmin(ctx.env);

  if (!admin.isConfigured) {
    const payload: HealthPayload = {
      ok: false,
      configured: false,
      checkedAt,
      error: admin.error,
    };
    return Response.json(payload, { status: 500 });
  }

  const start = Date.now();
  try {
    // Listing a collection verifies auth token retrieval and Firestore API access.
    await listFirestoreDocuments(ctx.env, ['bands']);
    const payload: HealthPayload = {
      ok: true,
      configured: true,
      projectId: admin.config.projectId,
      checkedAt,
      latencyMs: Date.now() - start,
    };
    return Response.json(payload);
  } catch (error) {
    const payload: HealthPayload = {
      ok: false,
      configured: true,
      projectId: admin.config.projectId,
      checkedAt,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Firebase health check failed.',
    };
    return Response.json(payload, { status: 500 });
  }
};
