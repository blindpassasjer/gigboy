import type { Song } from '../types';

function parseFrontmatter(fm: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of fm.trim().split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      result[key] = raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (raw !== '' && !isNaN(Number(raw))) {
      result[key] = Number(raw);
    } else {
      result[key] = raw;
    }
  }
  return result;
}

export function parseSongFile(raw: string, id: string): Song {
  const parts = raw.split(/^---\s*$/m);
  // Expect: ['', frontmatter, body] when file starts with ---
  const fm = parts.length >= 3 ? parseFrontmatter(parts[1]) : {};
  const chordpro = parts.length >= 3 ? parts.slice(2).join('---').trim() : raw.trim();

  return {
    id,
    title: String(fm.title ?? id),
    artist: fm.artist ? String(fm.artist) : undefined,
    language: String(fm.language ?? 'en'),
    secondaryLanguages: Array.isArray(fm.secondaryLanguages)
      ? (fm.secondaryLanguages as string[])
      : undefined,
    tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : undefined,
    key: fm.key ? String(fm.key) : undefined,
    capo: typeof fm.capo === 'number' ? fm.capo : undefined,
    tempo: typeof fm.tempo === 'number' ? fm.tempo : undefined,
    timeSignature: fm.timeSignature ? String(fm.timeSignature) : undefined,
    chordpro,
  };
}
