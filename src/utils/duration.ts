/**
 * Formats a duration in seconds as `m:ss` (e.g. 245 -> "4:05"), or `h:mm:ss` once it
 * reaches an hour — useful both for a single song and a setlist's summed total.
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parses a duration entered as `m:ss`, `mm:ss`, or a plain number of seconds.
 * Returns undefined for empty/unparseable input.
 */
export function parseDuration(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const colonMatch = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (colonMatch) {
    return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
  }

  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  return undefined;
}
