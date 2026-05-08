/// <reference types="@cloudflare/workers-types" />

/**
 * Firebase Admin SDK initialization from environment variables.
 * 
 * Credentials should be provided via environment variables (never committed to git):
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_PRIVATE_KEY
 * - FIREBASE_CLIENT_EMAIL
 * 
 * Do NOT use the JSON service account file from config/firebase/ in production.
 */

interface FirebaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
}

interface FirebaseTokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: FirebaseTokenCache | null = null;
const FIREBASE_ACCESS_SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/devstorage.full_control',
].join(' ');

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const firstChar = trimmed[0];
    const lastChar = trimmed[trimmed.length - 1];
    if ((firstChar === '"' && lastChar === '"') || (firstChar === '\'' && lastChar === '\'')) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function normalizeLineBreakEscapes(value: string) {
  return value
    .replace(/\\\\r\\\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\\\\r/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

function extractPkcs8PemBlock(value: string): string | null {
  const match = value.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/);
  if (!match) return null;
  return match[0].trim();
}

function tryParseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Non-JSON input is expected for most deployments.
  }
  return null;
}

function tryDecodeBase64Utf8(value: string): string | null {
  if (!/^[A-Za-z0-9+/_=\-\s]+$/.test(value)) {
    return null;
  }

  try {
    let normalized = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const remainder = normalized.length % 4;
    if (remainder > 0) {
      normalized += '='.repeat(4 - remainder);
    }
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes).trim();
  } catch {
    return null;
  }
}

function extractPrivateKeyFromJsonCandidate(value: string): string | null {
  const parsedJson = tryParseJsonObject(value);
  if (!parsedJson || typeof parsedJson.private_key !== 'string') {
    return null;
  }

  const normalized = normalizeLineBreakEscapes(stripWrappingQuotes(parsedJson.private_key)).trim();
  const pemFromPayload = extractPkcs8PemBlock(normalized);
  return pemFromPayload ?? normalized;
}

function normalizePrivateKey(privateKey: string) {
  let normalized = normalizeLineBreakEscapes(stripWrappingQuotes(privateKey)).trim();

  if (normalized.startsWith('FIREBASE_PRIVATE_KEY=')) {
    normalized = normalized.slice('FIREBASE_PRIVATE_KEY='.length).trim();
    normalized = normalizeLineBreakEscapes(stripWrappingQuotes(normalized)).trim();
  }

  // Accept passing the full service account JSON in FIREBASE_PRIVATE_KEY.
  const privateKeyFromJson = extractPrivateKeyFromJsonCandidate(normalized);
  if (privateKeyFromJson) {
    normalized = privateKeyFromJson;
  }

  const embeddedPem = extractPkcs8PemBlock(normalized);
  if (embeddedPem) {
    return embeddedPem;
  }

  if (
    normalized.startsWith('-----BEGIN PRIVATE KEY-----')
    && normalized.endsWith('-----END PRIVATE KEY-----')
  ) {
    return normalized;
  }

  // Accept base64-encoded full PEM blocks.
  const decodedPem = tryDecodeBase64Utf8(normalized);
  if (decodedPem) {
    const decodedPrivateKeyFromJson = extractPrivateKeyFromJsonCandidate(decodedPem);
    if (decodedPrivateKeyFromJson) {
      return decodedPrivateKeyFromJson;
    }

    const embeddedDecodedPem = extractPkcs8PemBlock(decodedPem);
    if (embeddedDecodedPem) {
      return embeddedDecodedPem;
    }

    if (
      decodedPem.startsWith('-----BEGIN PRIVATE KEY-----')
      && decodedPem.endsWith('-----END PRIVATE KEY-----')
    ) {
      return decodedPem;
    }
  }

  const base64Body = normalized.replace(/\s+/g, '');
  const isLikelyBase64Body = /^[A-Za-z0-9+/_=-]+$/.test(base64Body) && base64Body.length > 0;
  if (isLikelyBase64Body) {
    const normalizedBase64Body = base64Body.replace(/-/g, '+').replace(/_/g, '/');
    return `-----BEGIN PRIVATE KEY-----\n${normalizedBase64Body}\n-----END PRIVATE KEY-----`;
  }

  throw new Error(
    'Invalid Firebase private key format. Use the service account private_key value, including the BEGIN/END PRIVATE KEY markers.'
  );
}

function getFirebaseConfig(env: Record<string, string | undefined>): FirebaseConfig | null {
  const { FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL } = env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) {
    console.warn(
      'Firebase credentials not fully configured. Set FIREBASE_PROJECT_ID, '
      + 'FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.'
    );
    return null;
  }

  return {
    projectId: FIREBASE_PROJECT_ID,
    privateKey: normalizePrivateKey(FIREBASE_PRIVATE_KEY),
    clientEmail: FIREBASE_CLIENT_EMAIL,
  };
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const stripped = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');

  if (!stripped || !/^[A-Za-z0-9+/=]+$/.test(stripped)) {
    throw new Error(
      'Invalid Firebase private key format. The decoded PEM body contains characters that are not valid base64.'
    );
  }

  const bytes = decodeBase64ToBytes(stripped);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeJson(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return base64UrlEncodeBytes(bytes);
}

async function signJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerPart = base64UrlEncodeJson(header);
  const payloadPart = base64UrlEncodeJson(payload);
  const unsignedToken = `${headerPart}.${payloadPart}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signaturePart = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${unsignedToken}.${signaturePart}`;
}

async function fetchAccessToken(config: FirebaseConfig) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      iss: config.clientEmail,
      scope: FIREBASE_ACCESS_SCOPES,
      aud: 'https://oauth2.googleapis.com/token',
      exp: nowSeconds + 3600,
      iat: nowSeconds,
    },
    config.privateKey
  );

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const details = await tokenResponse.text();
    throw new Error(`Failed to fetch Firebase access token: ${details}`);
  }

  const tokenPayload = await tokenResponse.json() as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    token: tokenPayload.access_token,
    expiresAt: Date.now() + (tokenPayload.expires_in - 60) * 1000,
  };

  return tokenCache.token;
}

async function getAccessToken(env: Record<string, string | undefined>) {
  const config = getFirebaseConfig(env);
  if (!config) {
    throw new Error('Firebase credentials not configured');
  }

  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  return fetchAccessToken(config);
}

function documentPath(segments: string[]) {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function resolveStorageBucketCandidates(
  env: Record<string, string | undefined>,
  projectId: string,
  preferredBucket?: string,
): string[] {
  const candidates = [
    preferredBucket,
    env.FIREBASE_STORAGE_BUCKET,
    env.VITE_FIREBASE_STORAGE_BUCKET,
    `${projectId}.firebasestorage.app`,
    `${projectId}.appspot.com`,
  ]
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(candidates));
}

async function listStorageObjectsPage(
  env: Record<string, string | undefined>,
  bucketName: string,
  prefix: string,
  pageToken?: string,
): Promise<{ objectNames: string[]; nextPageToken: string | null } | null> {
  const config = getFirebaseConfig(env);
  if (!config) {
    throw new Error('Firebase credentials not configured');
  }

  const accessToken = await getAccessToken(env);
  const endpoint = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o`);
  if (prefix) endpoint.searchParams.set('prefix', prefix);
  if (pageToken) endpoint.searchParams.set('pageToken', pageToken);

  const response = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Storage list failed (${bucketName}/${prefix}): ${details}`);
  }

  const payload = await response.json() as {
    items?: Array<{ name?: unknown }>;
    nextPageToken?: unknown;
  };

  const objectNames = Array.isArray(payload.items)
    ? payload.items
      .map((entry) => (typeof entry.name === 'string' ? entry.name : ''))
      .filter((entry) => entry.length > 0)
    : [];

  const nextPageToken = typeof payload.nextPageToken === 'string' && payload.nextPageToken.length > 0
    ? payload.nextPageToken
    : null;

  return { objectNames, nextPageToken };
}

async function deleteStorageObjectByName(
  env: Record<string, string | undefined>,
  bucketName: string,
  objectName: string,
) {
  const accessToken = await getAccessToken(env);
  const endpoint = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`;

  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Storage delete failed (${bucketName}/${objectName}): ${details}`);
  }
}

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => toFirestoreValue(entry)),
      },
    };
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(objectValue)
            .filter(([, entryValue]) => entryValue !== undefined)
            .map(([entryKey, entryValue]) => [entryKey, toFirestoreValue(entryValue)])
        ),
      },
    };
  }

  return { stringValue: String(value) };
}

function fromFirestoreValue(value: Record<string, unknown>): unknown {
  if ('stringValue' in value) return value.stringValue as string;
  if ('booleanValue' in value) return value.booleanValue as boolean;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue as number;
  if ('timestampValue' in value) return value.timestampValue as string;
  if ('nullValue' in value) return null;

  if ('arrayValue' in value) {
    const arrayValue = value.arrayValue as { values?: Array<Record<string, unknown>> };
    return (arrayValue.values ?? []).map((entry) => fromFirestoreValue(entry));
  }

  if ('mapValue' in value) {
    const mapValue = value.mapValue as { fields?: Record<string, Record<string, unknown>> };
    const fields = mapValue.fields ?? {};
    return Object.fromEntries(
      Object.entries(fields).map(([entryKey, entryValue]) => [entryKey, fromFirestoreValue(entryValue)])
    );
  }

  return undefined;
}

function fromFirestoreFields(fields: Record<string, Record<string, unknown>> | undefined) {
  if (!fields) return {} as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)])
  );
}

async function firestoreRequest(
  env: Record<string, string | undefined>,
  method: string,
  segments: string[],
  body?: Record<string, unknown>
) {
  const config = getFirebaseConfig(env);
  if (!config) {
    throw new Error('Firebase credentials not configured');
  }

  const accessToken = await getAccessToken(env);
  const endpoint = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/${documentPath(segments)}`;

  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Firestore request failed (${method} ${segments.join('/')}): ${details}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export function initializeFirebaseAdmin(env: Record<string, string | undefined>) {
  let config: FirebaseConfig | null;

  try {
    config = getFirebaseConfig(env);
  } catch (error) {
    return {
      isConfigured: false,
      error: error instanceof Error ? error.message : 'Invalid Firebase Admin configuration',
    };
  }

  if (!config) {
    return {
      isConfigured: false,
      error: 'Firebase credentials not configured',
    };
  }

  // Firebase Admin SDK initialization would go here
  // Example structure for actual implementation:
  // import * as admin from 'firebase-admin';
  // admin.initializeApp({
  //   credential: admin.credential.cert({
  //     projectId: config.projectId,
  //     privateKeyId: env.FIREBASE_PRIVATE_KEY_ID || '',
  //     privateKey: config.privateKey.replace(/\\n/g, '\n'),
  //     clientEmail: config.clientEmail,
  //     clientId: env.FIREBASE_CLIENT_ID || '',
  //     authUri: 'https://accounts.google.com/o/oauth2/auth',
  //     tokenUri: 'https://oauth2.googleapis.com/token',
  //   }),
  //   projectId: config.projectId,
  // });

  return {
    isConfigured: true,
    config,
  };
}

export function requireFirebaseAdmin(env: Record<string, string | undefined>) {
  const { isConfigured, error } = initializeFirebaseAdmin(env);
  if (!isConfigured) {
    throw new Error(error);
  }
}

export async function getFirestoreDocument(
  env: Record<string, string | undefined>,
  segments: string[]
): Promise<Record<string, unknown> | null> {
  const doc = await firestoreRequest(env, 'GET', segments);
  if (!doc) return null;
  const fields = doc.fields as Record<string, Record<string, unknown>> | undefined;
  return fromFirestoreFields(fields);
}

export async function setFirestoreDocument(
  env: Record<string, string | undefined>,
  segments: string[],
  payload: Record<string, unknown>
) {
  const fields = Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );

  await firestoreRequest(env, 'PATCH', segments, { fields });
}

export async function deleteFirestoreDocument(
  env: Record<string, string | undefined>,
  segments: string[]
) {
  await firestoreRequest(env, 'DELETE', segments);
}

export async function listFirestoreDocuments(
  env: Record<string, string | undefined>,
  segments: string[]
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const response = await firestoreRequest(env, 'GET', segments);
  if (!response) return [];

  const documents = Array.isArray(response.documents)
    ? response.documents as Array<Record<string, unknown>>
    : [];

  return documents
    .map((entry) => {
      const name = typeof entry.name === 'string' ? entry.name : '';
      const id = decodeURIComponent(name.split('/').pop() ?? '');
      const fields = entry.fields as Record<string, Record<string, unknown>> | undefined;
      if (!id) return null;
      return { id, data: fromFirestoreFields(fields) };
    })
    .filter((entry): entry is { id: string; data: Record<string, unknown> } => Boolean(entry));
}

export async function countFirestoreDocumentsByField(
  env: Record<string, string | undefined>,
  collectionId: string,
  fieldPath: string,
  fieldValue: string
): Promise<number> {
  const config = getFirebaseConfig(env);
  if (!config) throw new Error('Firebase credentials not configured');

  const accessToken = await getAccessToken(env);
  const endpoint = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents:runQuery`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: { stringValue: fieldValue },
          },
        },
        select: { fields: [{ fieldPath: '__name__' }] },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Firestore runQuery failed: ${details}`);
  }

  const results = await response.json() as Array<Record<string, unknown>>;
  // Each element either has a `document` (a match) or just `readTime` (end-of-results marker).
  return results.filter((entry) => Boolean(entry.document)).length;
}

export async function deleteFirebaseStorageObject(
  env: Record<string, string | undefined>,
  objectPath: string,
  preferredBucket?: string,
): Promise<{ deleted: boolean; bucketName: string }> {
  const config = getFirebaseConfig(env);
  if (!config) throw new Error('Firebase credentials not configured');

  const normalizedPath = objectPath.trim().replace(/^\/+/, '');
  if (!normalizedPath) {
    throw new Error('Storage object path is required');
  }

  const buckets = resolveStorageBucketCandidates(env, config.projectId, preferredBucket);
  let lastError: Error | null = null;

  for (const bucketName of buckets) {
    try {
      await deleteStorageObjectByName(env, bucketName, normalizedPath);
      return { deleted: true, bucketName };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('No valid Firebase Storage bucket found for object deletion.');
}

export async function deleteFirebaseStoragePrefix(
  env: Record<string, string | undefined>,
  prefix: string,
  preferredBucket?: string,
): Promise<{ deletedCount: number; bucketName: string }> {
  const config = getFirebaseConfig(env);
  if (!config) throw new Error('Firebase credentials not configured');

  const normalizedPrefix = prefix.trim().replace(/^\/+/, '');
  if (!normalizedPrefix) {
    throw new Error('Storage prefix is required');
  }

  const buckets = resolveStorageBucketCandidates(env, config.projectId, preferredBucket);
  let lastError: Error | null = null;

  for (const bucketName of buckets) {
    try {
      const toDelete: string[] = [];
      let pageToken: string | null = null;
      let sawValidBucket = false;

      do {
        const page = await listStorageObjectsPage(env, bucketName, normalizedPrefix, pageToken ?? undefined);
        if (!page) {
          sawValidBucket = false;
          break;
        }
        sawValidBucket = true;
        toDelete.push(...page.objectNames);
        pageToken = page.nextPageToken;
      } while (pageToken);

      if (!sawValidBucket) {
        continue;
      }

      await Promise.all(toDelete.map((objectName) => deleteStorageObjectByName(env, bucketName, objectName)));
      return { deletedCount: toDelete.length, bucketName };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('No valid Firebase Storage bucket found for prefix deletion.');
}
