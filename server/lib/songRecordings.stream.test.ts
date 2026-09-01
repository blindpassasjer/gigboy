import { Readable, Writable } from 'node:stream';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { streamSongRecording } from './songRecordings.js';

const CONTENT = Buffer.from('0123456789abcdefghijABCDEFGHIJ'); // 30 bytes

const adapter = {
  async save() {},
  async delete() {},
  async read(_key: string, range?: { start: number; end: number }) {
    const slice = range ? CONTENT.subarray(range.start, range.end + 1) : CONTENT;
    return {
      stream: Readable.from([slice]) as unknown as NodeJS.ReadableStream,
      contentType: 'audio/webm',
      sizeBytes: CONTENT.length,
    };
  },
};

const row = { storageKey: 'k', mimeType: 'audio/webm' } as never;

/** A minimal Express-ish Response backed by a real Writable so `stream.pipe(res)` works. */
function makeRes() {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  let statusCode = 200;
  const res = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  }) as Writable & Partial<Response>;
  res.setHeader = ((k: string, v: string | number) => { headers[k.toLowerCase()] = String(v); return res; }) as never;
  res.status = ((code: number) => { statusCode = code; return res; }) as never;
  res.json = ((body: unknown) => { chunks.push(Buffer.from(JSON.stringify(body))); res.end(); return res; }) as never;
  return {
    res: res as unknown as Response,
    headers,
    get status() { return statusCode; },
    done: () => once(res, 'finish'),
    body: () => Buffer.concat(chunks).toString(),
  };
}

function makeReq(range?: string): Request {
  return { headers: range ? { range } : {} } as unknown as Request;
}

describe('streamSongRecording range support', () => {
  it('serves the full body and advertises Accept-Ranges when there is no Range header', async () => {
    const r = makeRes();
    await streamSongRecording(makeReq(), r.res, adapter as never, row);
    await r.done();
    expect(r.status).toBe(200);
    expect(r.headers['accept-ranges']).toBe('bytes');
    expect(r.headers['content-length']).toBe('30');
    expect(r.body()).toBe(CONTENT.toString());
  });

  it('answers a Range request with 206 and just the requested slice', async () => {
    const r = makeRes();
    await streamSongRecording(makeReq('bytes=5-9'), r.res, adapter as never, row);
    await r.done();
    expect(r.status).toBe(206);
    expect(r.headers['content-range']).toBe('bytes 5-9/30');
    expect(r.headers['content-length']).toBe('5');
    expect(r.body()).toBe('56789');
  });

  it('supports an open-ended range (seek to offset, play to end)', async () => {
    const r = makeRes();
    await streamSongRecording(makeReq('bytes=25-'), r.res, adapter as never, row);
    await r.done();
    expect(r.status).toBe(206);
    expect(r.headers['content-range']).toBe('bytes 25-29/30');
    expect(r.body()).toBe('FGHIJ');
  });

  it('answers an unsatisfiable range with 416', async () => {
    const r = makeRes();
    await streamSongRecording(makeReq('bytes=999-1099'), r.res, adapter as never, row);
    expect(r.status).toBe(416);
    expect(r.headers['content-range']).toBe('bytes */30');
  });
});
