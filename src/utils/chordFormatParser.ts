/**
 * Utility functions for parsing and converting different chord formats
 * Supports ChordPro, plain text with chords, and other common formats
 */

export interface ParsedSong {
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  chordpro: string;
}

/**
 * Parse ChordPro format text
 * Handles directives like {title: ...}, {artist: ...}, {key: ...}, {capo: ...}
 */
export function parseChordPro(text: string): ParsedSong {
  const lines = text.split('\n');
  let title = '';
  let artist = '';
  let key = '';
  let capo = 0;
  let tempo = 0;
  const content: string[] = [];

  for (const line of lines) {
    // Check for directives
    const directiveMatch = line.match(/^\{\s*(\w+)\s*:\s*([^}]+)\s*\}$/);
    if (directiveMatch) {
      const [, directive, value] = directiveMatch;
      const val = value.trim();
      switch (directive.toLowerCase()) {
        case 'title':
          title = val;
          break;
        case 'artist':
          artist = val;
          break;
        case 'key':
          key = val;
          break;
        case 'capo':
          capo = parseInt(val) || 0;
          break;
        case 'tempo':
          tempo = parseInt(val) || 0;
          break;
      }
    }
    content.push(line);
  }

  return {
    title: title || undefined,
    artist: artist || undefined,
    key: key || undefined,
    capo: capo || undefined,
    tempo: tempo || undefined,
    chordpro: content.join('\n').trim(),
  };
}

/**
 * Convert plain text lyrics with chords to ChordPro format
 * Handles formats like: [G]Lyrics [C]more [D]lyrics
 * Or: G    C    D
 *     Lyrics here
 */
export function plainTxtToChordPro(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  // If text already has ChordPro markers, return as-is
  if (text.includes('{') || text.includes('[')) {
    return text;
  }

  // Try to detect chord lines (lines with mainly uppercase, numbers, and chord separators)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

    // Pattern for chord lines: mostly uppercase letters, numbers, slashes, spaces
    const chordPattern = /^[A-G#b♯♭m7add9sus\/\s\-]+$/;
    
    if (chordPattern.test(line) && nextLine.trim()) {
      // This might be a chord line, try to merge with next line
      const merged = mergeChordLine(line, nextLine);
      if (merged) {
        result.push(merged);
        i++; // Skip next line as we've merged it
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Merge a chord line with lyrics line
 * "G     Am    D" 
 * "Wake me up"
 * becomes [G]Wake [Am]me [D]up
 */
function mergeChordLine(chordLine: string, lyricLine: string): string | null {
  try {
    // Split by multiple spaces
    const chords = chordLine.split(/\s{2,}/).filter(Boolean);
    const lyrics = lyricLine.split(/\s{2,}/).filter(Boolean);

    if (chords.length === 0 || lyrics.length === 0) return null;
    if (chords.length !== lyrics.length) return null;

    // Check if chords are valid (start with A-G)
    const validChords = chords.every((c) => /^[A-G]/.test(c.trim()));
    if (!validChords) return null;

    const merged = chords.map((chord, idx) => `[${chord.trim()}]${lyrics[idx] || ''}`).join(' ');
    return merged;
  } catch {
    return null;
  }
}

/**
 * Convert HTML chord display format to ChordPro
 * Handles common patterns from websites like Ultimate Guitar
 */
export function htmlToChordPro(html: string): string {
  let text = html;

  // Remove common HTML tags but preserve structure
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<span[^>]*class="chord"[^>]*>([^<]+)<\/span>/gi, '[$1]');
  text = text.replace(/<[^>]+>/g, '');

  // Clean up multiple newlines
  text = text.replace(/\n\s*\n/g, '\n\n');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  return text.trim();
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const map: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&sharp;': '#',
    '&flat;': 'b',
  };

  return text.replace(/&[^;]+;/g, (entity) => map[entity] || entity);
}

/**
 * Extract metadata from song text (title, artist, key, etc.)
 * Handles ChordPro directives and common text patterns
 */
export function extractMetadata(text: string): Partial<ParsedSong> {
  const parsed = parseChordPro(text);
  return {
    title: parsed.title,
    artist: parsed.artist,
    key: parsed.key,
    capo: parsed.capo,
    tempo: parsed.tempo,
  };
}

/**
 * Normalize chord names to consistent format
 */
export function normalizeChord(chord: string): string {
  // Convert common variations
  const normalized = chord
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/flat/gi, 'b')
    .replace(/sharp/gi, '#')
    .toUpperCase();

  return normalized;
}

/**
 * Validate ChordPro format
 */
export function isValidChordPro(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  // Must have some content
  if (text.trim().length === 0) return false;
  
  // Should have chord markers or directives
  const hasChords = /\[[A-G]/.test(text);
  const hasDirectives = /\{[a-z_]+:/.test(text);
  const hasLyrics = /[a-z]/i.test(text);
  
  return hasLyrics && (hasChords || hasDirectives);
}
