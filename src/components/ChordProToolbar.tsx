import { useRef, useState, type RefObject } from 'react';
import { Music2, Repeat2, GitBranch, ArrowRight, Guitar } from 'lucide-react';
import TabSequencerModal from './TabSequencerModal';

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  tempo?: number;
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

export default function ChordProToolbar({ textareaRef, value, onChange, tempo }: Props) {
  const [chordInput, setChordInput] = useState('');
  const [showTabSequencer, setShowTabSequencer] = useState(false);

  // Capture the cursor position when the modal opens so we insert at the right spot
  const pendingCursorRef = useRef(0);

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

  function handleChordInsert() {
    const chord = chordInput.trim();
    if (!chord || !textareaRef.current) return;
    insertAtCursor(textareaRef.current, `[${chord}]`, value, onChange);
    setChordInput('');
  }

  function handleChordKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleChordInsert();
    }
  }

  return (
    <>
    {showTabSequencer && (
      <TabSequencerModal
        onInsert={handleTabSequencerInsert}
        onClose={() => setShowTabSequencer(false)}
        tempo={tempo}
      />
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
        <div className="toolbar-chord-input-wrap">
          <span className="toolbar-chord-bracket">[</span>
          <input
            className="toolbar-chord-input"
            value={chordInput}
            onChange={(e) => setChordInput(e.target.value)}
            onKeyDown={handleChordKeyDown}
            placeholder="Am"
            maxLength={6}
            aria-label="Chord name"
          />
          <span className="toolbar-chord-bracket">]</span>
        </div>
        <button
          type="button"
          className="toolbar-btn toolbar-btn--chord"
          onClick={handleChordInsert}
          disabled={!chordInput.trim()}
          title="Insert chord at cursor"
        >
          Insert
        </button>
      </div>
    </div>
    </>
  );
}
