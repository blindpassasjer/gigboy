import { useEffect } from 'react';
import { X } from 'lucide-react';
import ChordFinder from './ChordFinder';

interface Props {
  onSelect: (chordName: string) => void;
  onClose: () => void;
}

export default function ChordFinderModal({ onSelect, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // Capture phase + stopPropagation so this fires before (and pre-empts)
      // AddSongForm's own window-level Escape handler, which navigates away
      // from the edit page — this Escape should just close the modal.
      e.stopPropagation();
      onClose();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div className="chord-finder-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="chord-finder-modal" role="dialog" aria-modal="true" aria-label="Find a Chord">
        <div className="chord-finder-modal-header">
          <span className="chord-finder-modal-title">Find a Chord</span>
          <button className="chord-finder-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="chord-finder-modal-body">
          <ChordFinder onSelectChord={onSelect} />
        </div>
      </div>
    </div>
  );
}
