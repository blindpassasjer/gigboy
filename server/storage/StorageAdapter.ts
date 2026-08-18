/**
 * Backend-agnostic file storage interface for song attachments. `localStorageAdapter.ts`
 * is the only implementation for Phase 4 (a Docker named volume); a future S3-compatible
 * adapter can implement the same interface as a drop-in replacement.
 */
export interface StorageAdapter {
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string; sizeBytes: number } | null>;
  delete(key: string): Promise<void>;
}
