import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Plus } from 'lucide-react';
import toast from '../utils/anchoredToast';

export interface AddToSection {
  /** Heading shown above this group of lists, e.g. "Songlists". */
  title: string;
  /** Shown under the heading when there is nothing to pick from. */
  emptyText: string;
  lists: Array<{ id: string; name: string; songIds: string[] }>;
  /** Both resolve to an error message, or null on success (the BandsContext convention). */
  onAdd: (listId: string, songId: string) => Promise<string | null>;
  onRemove: (listId: string, songId: string) => Promise<string | null>;
}

interface Props {
  label: string;
  title: string;
  icon: ReactNode;
  songId: string;
  sections: AddToSection[];
}

/** One "Add to" button whose menu groups several kinds of list (songlists, setlists…), ticking those the song is in. */
export default function AddToMenu({ label, title, icon, songId, sections }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Where the menu opens: below the button by default, above it when that side has clearly more room, and always
  // capped to the space on its side so the last items are reachable (the menu scrolls inside that cap).
  const [placement, setPlacement] = useState<{ up: boolean; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const margin = 16;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const up = below < 260 && above > below;
    setPlacement({ up, maxHeight: Math.max(160, Math.floor(up ? above : below)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="add-to-list-wrap" ref={wrapRef}>
      <button
        className="rec-btn rec-btn--toggle"
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {icon}
        <span className="song-action-label">{label}</span>
      </button>
      {open && (
        <div
          className={`list-dropdown add-to-menu${placement?.up ? ' add-to-menu--up' : ''}`}
          role="menu"
          style={placement ? { maxHeight: placement.maxHeight } : undefined}
        >
          {sections.map((section) => (
            <div key={section.title} role="group" aria-label={section.title}>
              <p className="list-dropdown-heading">{section.title}</p>
              {section.lists.length === 0 ? (
                <p className="list-dropdown-empty">{section.emptyText}</p>
              ) : (
                section.lists.map((list) => {
                  const inList = list.songIds.includes(songId);
                  return (
                    <button
                      key={list.id}
                      role="menuitemcheckbox"
                      aria-checked={inList}
                      className={`list-dropdown-item${inList ? ' in-list' : ''}`}
                      onClick={() => {
                        void (inList ? section.onRemove(list.id, songId) : section.onAdd(list.id, songId)).then((error) => {
                          if (error) toast.error(error);
                        });
                      }}
                    >
                      {inList ? <Check size={13} /> : <Plus size={13} />}
                      {list.name}
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
