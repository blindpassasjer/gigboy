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
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
