export interface SongListCategory {
  id: string;
  name: string;
  sortOrder?: number;
}

export interface SongList {
  id: string;
  name: string;
  songIds: string[];
  folderId?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}

export interface Setlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt?: string;
  updatedAt?: string;
  sortOrder?: number;
  shareToken?: string;
}

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

export interface Song {
  id: string;
  title: string;
  artist?: string;
  color?: string;
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
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParsedLine {
  type: 'chord-lyric' | 'directive' | 'comment' | 'empty' | 'tab';
  segments?: ChordSegment[];
  /** Directive name (e.g. "title", "chorus") */
  directive?: string;
  directiveValue?: string;
  raw: string;
  /** Lines inside a {start_of_tab}...{end_of_tab} block (only present when type === 'tab') */
  tabLines?: string[];
}

export interface ChordSegment {
  chord: string;
  lyric: string;
}
