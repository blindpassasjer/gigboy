export type Language =
  | 'en'
  | 'es'
  | 'no'
  | 'pt'
  | 'fr'
  | 'de'
  | 'it'
  | 'la'
  | string;

export interface Recording {
  id: string;
  name: string;
  createdAt: string;
  /** base64-encoded audio data (audio/webm or audio/ogg) */
  data: string;
  mimeType: string;
  durationSeconds?: number;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  language: Language;
  /** Additional languages present in the song (e.g. bilingual) */
  secondaryLanguages?: Language[];
  tags?: string[];
  /** ChordPro-formatted lyrics. Chords wrapped in [brackets]. */
  chordpro: string;
  capo?: number;
  key?: string;
  tempo?: number;
  timeSignature?: string;
  recordings?: Recording[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ParsedLine {
  type: 'chord-lyric' | 'directive' | 'comment' | 'empty';
  segments?: ChordSegment[];
  /** Directive name (e.g. "title", "chorus") */
  directive?: string;
  directiveValue?: string;
  raw: string;
}

export interface ChordSegment {
  chord: string;
  lyric: string;
}
