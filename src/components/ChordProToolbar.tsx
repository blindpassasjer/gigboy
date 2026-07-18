import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Music2, Repeat2, GitBranch, ArrowRight, Guitar, Search } from 'lucide-react';
import TabSequencerModal from './TabSequencerModal';
import ChordFinderModal from './ChordFinderModal';
import { suggestChordNames } from '../utils/chordNames';
import { diatonicChords } from '../utils/musicTheory';

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  tempo?: number;
  /** Song key, e.g. "G" or "Am" — used to surface likely diatonic chords. */
  songKey?: string;
}

const CHORD_TOKEN_RE = /\[([^\]\s]+)\]/g;

/** Chords already used in this song, most-frequent first, for one-tap re-entry. */
function extractRecentChords(value: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const match of value.matchAll(CHORD_TOKEN_RE)) {
    const chord = match[1];
    counts.set(chord, (counts.get(chord) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([chord]) => chord)
    .slice(0, limit);
}

type Section = { label: string; name: string; icon: React.ReactNode; color: string };

const SECTIONS: Section[] = [
  { label: 'Intro',      name: 'intro',      icon: <Music2 size={13} />,   color: 'section-intro' },
  { label: 'Verse',      name: 'verse',      icon: <Music2 size={13} />,   color: 'section-verse' },
  { label: 'Chorus',     name: 'chorus',     icon: <Repeat2 size={13} />,  color: 'section-chorus' },
  { label: 'Bridge',     name: 'bridge',     icon: <GitBranch size={13} />,color: 'section-bridge' },
  { label: 'Pre-chorus', name: 'pre_chorus', icon: <ArrowRight size={13} />,color: 'section-prechorus' },
  { label: 'Interlude',  name: 'interlude',  icon: <Music2 size={13} />,   color: 'section-interlude' },
  { label: 'Solo',       name: 'solo',       icon: <Guitar size={13} />,   color: 'section-solo' },
  { label: 'Outro',      name: 'outro',      icon: <Repeat2 size={13} />,  color: 'section-outro' },
];

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  text: string,
  value: string,
  onChange: (v: string) => void,
  newCursorOffset?: number,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = value.slice(0, start);
  const after = value.slice(end);
  onChange(before + text + after);
  const pos = newCursorOffset !== undefined ? start + newCursorOffset : start + text.length;
  requestAnimationFrame(() => {
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(pos, pos);
  });
}

function insertSection(
  sectionName: string,
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = value.slice(start, end);

  if (selectedText) {
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const body = selectedText.endsWith('\n') ? selectedText : `${selectedText}\n`;
    const block = `${prefix}{start_of_${sectionName}}\n${body}{end_of_${sectionName}}\n`;
    onChange(before + block + after);
    const newPos = start + block.length;
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(newPos, newPos);
    });
  } else {
    const before = value.slice(0, start);
    const needsNewline = before.length > 0 && !before.endsWith('\n');
    const prefix = needsNewline ? '\n' : '';
    const block = `${prefix}{start_of_${sectionName}}\n\n{end_of_${sectionName}}\n`;
    // Place cursor on the blank line between start and end
    const cursorOffset = prefix.length + `{start_of_${sectionName}}\n`.length;
    insertAtCursor(textarea, block, value, onChange, cursorOffset);
  }
}

export default function ChordProToolbar({ textareaRef, value, onChange, tempo, songKey }: Props) {
  const [chordInput, setChordInput] = useState('');
  const [showTabSequencer, setShowTabSequencer] = useState(false);
  const [showChordFinder, setShowChordFinder] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  // Capture the cursor position when the modal opens so we insert at the right spot
  const pendingCursorRef = useRef(0);

  const suggestions = useMemo(() => suggestChordNames(chordInput), [chordInput]);
  const recentChords = useMemo(() => extractRecentChords(value), [value]);
  const keyChords = useMemo(() => (songKey ? diatonicChords(songKey) : []), [songKey]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    function updateSelection() {
      setHasSelection(!!textarea && textarea.selectionStart !== textarea.selectionEnd);
    }
    textarea.addEventListener('select', updateSelection);
    textarea.addEventListener('mouseup', updateSelection);
    textarea.addEventListener('keyup', updateSelection);
    return () => {
      textarea.removeEventListener('select', updateSelection);
      textarea.removeEventListener('mouseup', updateSelection);
      textarea.removeEventListener('keyup', updateSelection);
    };
  }, [textareaRef]);

  function handleWrapAsChord() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;
    const selected = value.slice(start, end);
    const wrapped = selected.split(' ').map((word) => word ? `[${word}]` : '').join(' ');
    const before = value.slice(0, start);
    const after = value.slice(end);
    onChange(before + wrapped + after);
    const newPos = start + wrapped.length;
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(newPos, newPos);
    });
    setHasSelection(false);
  }

  function handleSectionClick(name: string) {
    if (!textareaRef.current) return;
    insertSection(name, textareaRef.current, value, onChange);
  }

  function handleInsertTab() {
    if (!textareaRef.current) return;
    pendingCursorRef.current = textareaRef.current.selectionStart;
    setShowTabSequencer(true);
  }

  function handleTabSequencerInsert(tabLines: string[]) {
    setShowTabSequencer(false);
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = pendingCursorRef.current;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const needsNewline = before.length > 0 && !before.endsWith('\n');
    const prefix = needsNewline ? '\n' : '';
    const block = `${prefix}{start_of_tab}\n${tabLines.join('\n')}\n{end_of_tab}\n`;
    onChange(before + block + after);
    const newPos = start + block.length;
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  function handleChordInsert(chordOverride?: string) {
    const chord = (chordOverride ?? chordInput).trim();
    if (!chord || !textareaRef.current) return;
    insertAtCursor(textareaRef.current, `[${chord}]`, value, onChange);
    setChordInput('');
    setShowSuggestions(false);
  }

  function handleChordKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleChordInsert();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  function handleChordFinderSelect(chordName: string) {
    handleChordInsert(chordName);
    setShowChordFinder(false);
  }

  const quickChordRow = (label: string, chords: string[]) =>
    chords.length > 0 && (
      <div className="toolbar-group toolbar-group--quickchips">
        <span className="toolbar-label">{label}</span>
        {chords.map((chord) => (
          <button
            key={chord}
            type="button"
            className="toolbar-chip"
            onClick={() => handleChordInsert(chord)}
            title={`Insert [${chord}] at cursor`}
          >
            {chord}
          </button>
        ))}
      </div>
    );

  return (
    <>
    {showTabSequencer && (
      <TabSequencerModal
        onInsert={handleTabSequencerInsert}
        onClose={() => setShowTabSequencer(false)}
        tempo={tempo}
      />
    )}
    {showChordFinder && (
      <ChordFinderModal
        onSelect={handleChordFinderSelect}
        onClose={() => setShowChordFinder(false)}
      />
    )}
    {(keyChords.length > 0 || recentChords.length > 0) && (
      <div className="chordpro-quickchips-bar">
        {quickChordRow(songKey ? `Key of ${songKey}` : 'Key', keyChords)}
        {quickChordRow('Recent', recentChords)}
      </div>
    )}
    <div className="chordpro-toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">Section</span>
        {SECTIONS.map((s) => (
          <button
            key={s.name}
            type="button"
            className={`toolbar-btn toolbar-btn--section ${s.color}`}
            onClick={() => handleSectionClick(s.name)}
            title={`Insert ${s.label} block`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <span className="toolbar-label">Tab</span>
        <button
          type="button"
          className="toolbar-btn toolbar-btn--section section-tab"
          onClick={handleInsertTab}
          title="Insert guitar tab block"
        >
          <Guitar size={13} />
          Insert Tab
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group toolbar-group--chord">
        <span className="toolbar-label">Chord</span>
        <div className="toolbar-chord-input-outer">
          <div className="toolbar-chord-input-wrap">
            <span className="toolbar-chord-bracket">[</span>
            <input
              className="toolbar-chord-input"
              value={chordInput}
              onChange={(e) => { setChordInput(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              onKeyDown={handleChordKeyDown}
              placeholder="Am"
              maxLength={6}
              aria-label="Chord name"
              autoComplete="off"
            />
            <span className="toolbar-chord-bracket">]</span>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <ul className="toolbar-chord-suggestions" role="listbox">
              {suggestions.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleChordInsert(name)}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="toolbar-btn toolbar-btn--chord"
          onClick={() => handleChordInsert()}
          disabled={!chordInput.trim()}
          title="Insert chord at cursor"
        >
          Insert
        </button>
        <button
          type="button"
          className="toolbar-btn toolbar-btn--chord"
          onClick={handleWrapAsChord}
          disabled={!hasSelection}
          title="Wrap selected text as chord(s)"
        >
          Wrap selection
        </button>
        <button
          type="button"
          className="toolbar-btn toolbar-btn--chord toolbar-btn--icon"
          onClick={() => setShowChordFinder(true)}
          title="Find a chord by fretboard, ukulele, or piano"
          aria-label="Find a chord"
        >
          <Search size={13} />
        </button>
      </div>
    </div>
    </>
  );
}
