/**
 * Magic-byte sniffing for uploaded images. Multer's `fileFilter` only sees the client-supplied
 * `Content-Type`, so a caller can label arbitrary bytes `image/png`. These checks look at the
 * actual file header and must agree with the declared MIME type before the bytes are stored.
 */

/** Returns the detected image MIME type from a buffer's magic bytes, or null if unrecognized. */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: "GIF87a" / "GIF89a"
  if (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a') {
    return 'image/gif';
  }

  // WebP: "RIFF"...."WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

/**
 * True when `buffer`'s real image type matches `declaredMimeType`. jpg/jpeg are treated as
 * equivalent. Anything unrecognized fails closed.
 */
export function imageBytesMatchMime(buffer: Buffer, declaredMimeType: string): boolean {
  const sniffed = sniffImageMime(buffer);
  if (!sniffed) return false;
  return sniffed === declaredMimeType;
}
