import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

// String order: high e at top → low E at bottom (standard tab notation)
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const NUM_STRINGS = 6;
const STEPS_PER_BAR = 4;
const MAX_FRET = 24;
const MIN_BARS = 1;
const MAX_BARS = 16;

type CellValue = number | 'x' | null;
type Grid = CellValue[][];  // grid[stringIdx][stepIdx]

function makeEmptyGrid(numSteps: number): Grid {
  return Array.from({ length: NUM_STRINGS }, () => Array(numSteps).fill(null));
}

/**
 * Convert the sequencer grid to ChordPro tab lines.
 * Output example:
 *   e|0-2-3-----|
 *   B|1-3-5-----|
 *   G|----------|
 *   D|----------|
 *   A|----------|
 *   E|----------|
 */
function gridToTabLines(grid: Grid): string[] {
  const numSteps = grid[0]?.length ?? 0;
  // Determine per-column width: 2 if any string at that step has fret >= 10, else 1
  const colWidths = Array.from({ length: numSteps }, (_, c) =>
    grid.some(row => {
      const v = row[c];
      return typeof v === 'number' && v >= 10;
    }) ? 2 : 1,
  );

  return grid.map((row, si) => {
    let line = STRING_LABELS[si] + '|';
    for (let c = 0; c < numSteps; c++) {
      const fret = row[c];
      const w = colWidths[c];
      if (fret === null) {
        line += '-'.repeat(w);
      } else if (fret === 'x') {
        line += 'x'.padEnd(w, '-');
      } else {
        line += String(fret).padEnd(w, '-');
      }
    }
    line += '|';
    return line;
  });
}

interface Props {
  onInsert: (tabLines: string[]) => void;
  onClose: () => void;
}

export default function TabSequencerModal({ onInsert, onClose }: Props) {
  const [numBars, setNumBars] = useState(4);
  const numSteps = numBars * STEPS_PER_BAR;
  const [grid, setGrid] = useState<Grid>(() => makeEmptyGrid(4 * STEPS_PER_BAR));
  // selectedCell: [stringIdx, stepIdx] | null
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [pendingDigits, setPendingDigits] = useState('');
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Focus hidden input whenever selection changes
  useEffect(() => {
    if (selected) hiddenInputRef.current?.focus();
  }, [selected]);

  // Close on Escape when no cell is selected
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !selected) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, onClose]);

  function addBar() {
    if (numBars >= MAX_BARS) return;
    setNumBars(b => b + 1);
    setGrid(prev => prev.map(row => [...row, null, null, null, null]));
  }

  function removeBar() {
    if (numBars <= MIN_BARS) return;
    // Deselect if selected cell is in the bar being removed
    if (selected && selected[1] >= (numBars - 1) * STEPS_PER_BAR) {
      setSelected(null);
      setPendingDigits('');
    }
    setNumBars(b => b - 1);
    setGrid(prev => prev.map(row => row.slice(0, -STEPS_PER_BAR)));
  }

  function setFret(si: number, step: number, fret: CellValue) {
    setGrid(prev => prev.map((row, ri) =>
      ri === si ? row.map((f, ci) => ci === step ? fret : f) : row,
    ));
  }

  function selectCell(si: number, step: number) {
    setSelected([si, step]);
    setPendingDigits('');
  }

  function deselect() {
    setSelected(null);
    setPendingDigits('');
  }

  function moveTo(si: number, step: number) {
    const newSi = Math.max(0, Math.min(NUM_STRINGS - 1, si));
    const newStep = Math.max(0, Math.min(numSteps - 1, step));
    setSelected([newSi, newStep]);
    setPendingDigits('');
  }

  function handleCellClick(si: number, step: number) {
    if (selected?.[0] === si && selected?.[1] === step) {
      deselect();
    } else {
      selectCell(si, step);
    }
  }

  function handleCellRightClick(e: React.MouseEvent, si: number, step: number) {
    e.preventDefault();
    setFret(si, step, null);
    deselect();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const [si, step] = selected;

    if (e.key === 'Escape' || e.key === 'Enter') { deselect(); return; }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (pendingDigits.length > 0) {
        const trimmed = pendingDigits.slice(0, -1);
        setPendingDigits(trimmed);
        setFret(si, step, trimmed === '' ? null : parseInt(trimmed, 10));
      } else {
        setFret(si, step, null);
        deselect();
      }
      return;
    }

    if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault(); moveTo(si, step + 1); return;
    }
    if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault(); moveTo(si, step - 1); return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveTo(si + 1, step); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveTo(si - 1, step); return; }

    if (e.key.toLowerCase() === 'x') {
      e.preventDefault();
      setFret(si, step, 'x');
      setPendingDigits('');
      moveTo(si, step + 1);
      return;
    }

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const next = pendingDigits + e.key;
      const num = parseInt(next, 10);
      if (num <= MAX_FRET) {
        setPendingDigits(next);
        setFret(si, step, num);
      } else {
        // digit would exceed MAX_FRET — start fresh
        setPendingDigits(e.key);
        setFret(si, step, parseInt(e.key, 10));
      }
    }
  }

  function handleInsert() {
    const tabLines = gridToTabLines(grid);
    onInsert(tabLines);
  }

  function handleClear() {
    setGrid(makeEmptyGrid(numSteps));
    deselect();
  }

  // Display: which value to show inside the cell
  function cellLabel(si: number, step: number): string {
    if (selected?.[0] === si && selected?.[1] === step && pendingDigits !== '') {
      return pendingDigits;
    }
    const fret = grid[si][step];
    if (fret === null) return '–';
    if (fret === 'x') return 'x';
    return String(fret);
  }

  const isEmpty = grid.every(row => row.every(f => f === null));

  return (
    <div className="tab-seq-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tab-seq-modal" role="dialog" aria-modal="true" aria-label="Insert Guitar Tab">
        {/* Hidden input to capture keyboard while a cell is selected */}
        <input
          ref={hiddenInputRef}
          onKeyDown={handleKeyDown}
          onBlur={deselect}
          readOnly
          aria-hidden="true"
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          tabIndex={-1}
        />

        <div className="tab-seq-header">
          <span className="tab-seq-title">Insert Guitar Tab</span>
          <button className="tab-seq-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="tab-seq-body">
          {/* Bar number header row */}
          <div className="tab-seq-bar-row">
            <div className="tab-seq-string-label" />
            {Array.from({ length: numSteps }, (_, i) => (
              <div
                key={i}
                className={`tab-seq-bar-cell${i % 4 === 0 ? ' tab-seq-bar-cell--beat' : ''}`}
              >
                {i % 4 === 0 ? i / 4 + 1 : '·'}
              </div>
            ))}
          </div>

          {/* String rows */}
          {Array.from({ length: NUM_STRINGS }, (_, si) => (
            <div key={si} className="tab-seq-string-row">
              <div className="tab-seq-string-label">{STRING_LABELS[si]}</div>
              {Array.from({ length: numSteps }, (_, step) => {
                const fret = grid[si][step];
                const isActive = fret !== null;
                const isMuted = fret === 'x';
                const isSelected = selected?.[0] === si && selected?.[1] === step;
                const isBarStart = step % 4 === 0;

                return (
                  <button
                    key={step}
                    type="button"
                    className={[
                      'tab-seq-cell',
                      isActive && !isMuted ? 'tab-seq-cell--active' : '',
                      isMuted ? 'tab-seq-cell--muted' : '',
                      isSelected ? 'tab-seq-cell--selected' : '',
                      isBarStart && !isSelected && !isActive ? 'tab-seq-cell--barstart' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleCellClick(si, step)}
                    onContextMenu={(e) => handleCellRightClick(e, si, step)}
                    title={`${STRING_LABELS[si]} string · step ${step + 1}${isMuted ? ' · muted' : isActive ? ` · fret ${fret}` : ''}`}
                  >
                    {isActive || isSelected
                      ? cellLabel(si, step)
                      : <span className="tab-seq-cell-dash">–</span>
                    }
                  </button>
                );
              })}
            </div>
          ))}

          {/* Bar count controls */}
          <div className="tab-seq-bar-controls">
            <button
              type="button"
              className="tab-seq-bar-ctrl-btn"
              onClick={removeBar}
              disabled={numBars <= MIN_BARS}
              aria-label="Remove bar"
            >
              <Minus size={12} />
              Bar
            </button>
            <span className="tab-seq-bar-count">{numBars} bar{numBars !== 1 ? 's' : ''}</span>
            <button
              type="button"
              className="tab-seq-bar-ctrl-btn"
              onClick={addBar}
              disabled={numBars >= MAX_BARS}
              aria-label="Add bar"
            >
              <Plus size={12} />
              Bar
            </button>
          </div>
        </div>

        <div className="tab-seq-hint">
          Click to select · type fret (0–24) or <strong>x</strong> (mute) · Backspace to clear · Arrow keys / Tab to navigate · Right-click to clear
        </div>

        <div className="tab-seq-footer">
          <button type="button" className="tab-seq-btn tab-seq-btn--ghost" onClick={handleClear}>
            Clear
          </button>
          <div className="tab-seq-footer-actions">
            <button type="button" className="tab-seq-btn tab-seq-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="tab-seq-btn tab-seq-btn--primary"
              onClick={handleInsert}
              disabled={isEmpty}
            >
              Insert Tab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
