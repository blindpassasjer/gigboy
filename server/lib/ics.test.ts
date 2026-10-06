import { describe, expect, it } from 'vitest';
import { buildIcs } from './ics.js';

const base = {
  uid: 'g1@gigboy',
  title: 'Gig',
  startsAt: new Date('2026-11-01T18:00:00Z'),
  endsAt: null,
  location: null,
  description: null,
  status: 'confirmed' as const,
  updatedAt: new Date('2026-10-06T10:00:00Z'),
};

describe('buildIcs', () => {
  it('escapes backslash, semicolon, comma and newlines in text fields', () => {
    const BS = String.fromCharCode(92);
    const ics = buildIcs('a;b', [{ ...base, title: `x;y,z${BS}w`, description: 'one\ntwo' }]);
    expect(ics).toContain(`X-WR-CALNAME:a${BS};b`);
    expect(ics).toContain(`SUMMARY:x${BS};y${BS},z${BS}${BS}w`);
    expect(ics).toContain(`DESCRIPTION:one${BS}ntwo`);
  });

  it('defaults a missing end time to two hours after the start', () => {
    const ics = buildIcs('Band', [base]);
    expect(ics).toContain('DTSTART:20261101T180000Z');
    expect(ics).toContain('DTEND:20261101T200000Z');
  });

  it('folds long lines at 75 octets without splitting multi-byte characters', () => {
    const ics = buildIcs('Band', [{ ...base, title: 'æ'.repeat(80) }]);
    const lines = ics.split('\r\n');
    for (const line of lines) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${'æ'.repeat(80)}`);
  });

  it('uses CRLF line endings and marks cancelled events', () => {
    const ics = buildIcs('Band', [{ ...base, status: 'cancelled' }]);
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
