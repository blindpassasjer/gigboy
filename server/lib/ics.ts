export interface IcsEvent {
  uid: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  description: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  /** Bumped on every edit so subscribers pick up changes (RFC 5545 SEQUENCE). */
  updatedAt: Date;
  url?: string;
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1: lines max 75 octets, continuation lines start with a single space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't split inside a multi-byte UTF-8 sequence.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//gigboy//gigs//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // Hint for clients that honour it; most poll on their own schedule regardless.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of events) {
    const end = e.endsAt ?? new Date(e.startsAt.getTime() + DEFAULT_DURATION_MS);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${utc(e.updatedAt)}`,
      `LAST-MODIFIED:${utc(e.updatedAt)}`,
      `SEQUENCE:${Math.floor(e.updatedAt.getTime() / 1000)}`,
      `DTSTART:${utc(e.startsAt)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      `STATUS:${e.status.toUpperCase()}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
