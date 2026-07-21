import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Plus } from 'lucide-react';
import ChordFinderModal from './ChordFinderModal';
import ChordSearchPanel from './ChordSearchPanel';
import { extractRecentChords } from '../utils/chordNames';
import { diatonicChords } from '../utils/musicTheory';
import { getCaretCoordinates } from '../utils/caretPosition';
import { insertChordAtSelection } from '../utils/chordInsertion';

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  songKey?: string;
  children: ReactNode;
}

type Phase = 'hidden' | 'button' | 'popover';

const POPOVER_HEIGHT_ESTIMATE = 280;
const POPOVER_WIDTH = 240;
// Must match .chord-caret-button's width/height in index.css.
const CARET_BUTTON_SIZE = 22;
// While actively typing, the caret fires 'keyup'/'select' on every keystroke —
// repositioning on each one makes the button jitter and dodge the pointer
// right as you try to click it. Debounce those so it only settles once
// typing pauses; 'click' and 'focus' are discrete, deliberate actions and
// stay immediate.
const TYPING_REPOSITION_DEBOUNCE_MS = 200;

/**
 * Wraps the ChordPro lyrics textarea and overlays a floating "+" button that
 * tracks the caret. Clicking it opens a search + quick-pick popover anchored
 * at that exact position, so inserting a chord doesn't require looking away
 * to a separate toolbar.
 */
export default function ChordCaretPicker({ textareaRef, value, onChange, songKey, children }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>('hidden');
  const phaseRef = useRef<Phase>('hidden');
  const [anchor, setAnchor] = useState({ top: 0, left: 0, height: 0 });
  const [showFinder, setShowFinder] = useState(false);
  const [flipUp, setFlipUp] = useState(false);

  const showFinderRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    showFinderRef.current = showFinder;
  }, [showFinder]);

  const recentChords = useMemo(() => extractRecentChords(value), [value]);
  const keyChords = useMemo(() => (songKey ? diatonicChords(songKey) : []), [songKey]);

  function reposition(nextPhase?: Phase) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const caret = getCaretCoordinates(textarea, textarea.selectionEnd);
    const textareaRect = textarea.getBoundingClientRect();
    const computed = window.getComputedStyle(textarea);
    // getCaretCoordinates measures from the textarea's padding edge (inside
    // its border); getBoundingClientRect gives the outer border edge — add
    // the border back so the two line up. These are viewport coordinates —
    // the overlay is position:fixed (see index.css) specifically so it isn't
    // clipped by .main-content's overflow-y:auto scroll container, which an
    // absolutely-positioned overlay nested this deep would otherwise be.
    const borderTop = parseFloat(computed.borderTopWidth) || 0;
    const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
    const top = textareaRect.top + borderTop + caret.top;
    const left = textareaRect.left + borderLeft + caret.left;
    setAnchor({ top, left, height: caret.height });
    setFlipUp(window.innerHeight - top < POPOVER_HEIGHT_ESTIMATE);
    if (nextPhase) setPhase(nextPhase);
  }

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    function clearTypingTimeout() {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }

    function handleImmediateActivity() {
      clearTypingTimeout();
      if (document.activeElement !== textarea) return;
      if (phaseRef.current === 'popover') return;
      reposition('button');
    }

    function handleTypingActivity() {
      clearTypingTimeout();
      typingTimeoutRef.current = setTimeout(() => {
        if (document.activeElement !== textarea) return;
        if (phaseRef.current === 'popover') return;
        reposition('button');
      }, TYPING_REPOSITION_DEBOUNCE_MS);
    }

    function handleBlur() {
      clearTypingTimeout();
      blurTimeoutRef.current = setTimeout(() => {
        if (overlayRef.current?.contains(document.activeElement)) return;
        setPhase('hidden');
      }, 120);
    }

    function handleFocus() {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      handleImmediateActivity();
    }

    function handleScroll() {
      clearTypingTimeout();
      if (phaseRef.current !== 'hidden') reposition();
    }

    textarea.addEventListener('click', handleImmediateActivity);
    textarea.addEventListener('keyup', handleTypingActivity);
    textarea.addEventListener('select', handleTypingActivity);
    textarea.addEventListener('focus', handleFocus);
    textarea.addEventListener('blur', handleBlur);
    // Internal scrolling of the textarea itself.
    textarea.addEventListener('scroll', handleScroll);
    // The overlay is position:fixed and computed from viewport coordinates,
    // so scrolling the page (e.g. .main-content, which doesn't bubble a
    // 'scroll' event — capture phase is what catches it here) must also
    // trigger a reposition, or the button/popover would visually detach
    // from the caret as the page scrolls underneath it.
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      textarea.removeEventListener('click', handleImmediateActivity);
      textarea.removeEventListener('keyup', handleTypingActivity);
      textarea.removeEventListener('select', handleTypingActivity);
      textarea.removeEventListener('focus', handleFocus);
      textarea.removeEventListener('blur', handleBlur);
      textarea.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      clearTypingTimeout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textareaRef]);

  useEffect(() => {
    if (phase !== 'popover') return;
    function handleOutside(e: MouseEvent) {
      // The chord-finder modal renders outside overlayRef (it's a fixed, full-screen
      // overlay) and handles its own dismissal — don't let clicks inside it bubble
      // into closing the popover underneath.
      if (showFinderRef.current) return;
      if (overlayRef.current?.contains(e.target as Node)) return;
      closeAll();
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function closeAll() {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setPhase('hidden');
    setShowFinder(false);
  }

  function handleButtonMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    // Opening the popover here is synchronous, which unmounts this very
    // button (and its child <svg> icon — the event's target) immediately.
    // The same native mousedown event then keeps bubbling to document's
    // native outside-click listener, whose containment check reports the
    // (now-detached) target as "outside" and closes the popover it just
    // opened. React's synthetic stopPropagation() only stops other React
    // handlers, not that native document listener — use the native event's
    // stopPropagation so this one gesture can't be seen by both.
    e.nativeEvent.stopPropagation();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    reposition('popover');
  }

  function commitChord(chordName: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertChordAtSelection(textarea, chordName, value, onChange);
    closeAll();
  }

  return (
    <div className="chord-caret-picker-wrap">
      {children}
      {phase !== 'hidden' && (
        <div
          className="chord-caret-overlay"
          ref={overlayRef}
          style={{ top: anchor.top, left: anchor.left }}
        >
          {phase === 'button' && (
            <button
              type="button"
              className="chord-caret-button"
              onMouseDown={handleButtonMouseDown}
              title="Insert a chord here"
              aria-label="Insert a chord here"
              style={{ top: anchor.height / 2 - CARET_BUTTON_SIZE / 2 }}
            >
              <Plus size={13} />
            </button>
          )}
          {phase === 'popover' && (
            <div
              className={`chord-caret-popover-anchor${flipUp ? ' chord-caret-popover-anchor--up' : ''}`}
              style={{ width: POPOVER_WIDTH }}
            >
              <ChordSearchPanel
                keyChords={keyChords}
                keyLabel={songKey ? `Key of ${songKey}` : 'Key'}
                recentChords={recentChords}
                onSelect={commitChord}
                onRequestFinder={() => setShowFinder(true)}
                onEscape={() => {
                  closeAll();
                  textareaRef.current?.focus({ preventScroll: true });
                }}
              />
            </div>
          )}
        </div>
      )}
      {showFinder && (
        <ChordFinderModal
          onSelect={(name) => commitChord(name)}
          onClose={() => setShowFinder(false)}
        />
      )}
    </div>
  );
}
