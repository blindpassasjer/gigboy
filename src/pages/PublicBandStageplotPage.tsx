import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import { doc, getDoc } from 'firebase/firestore';
import type { SongHandNoteDocument, StageplotItem } from '../types';
import { db } from '../lib/firebase';
import SongHandNotesOverlay from '../components/SongHandNotesOverlay';
import { stageplotIconForKind } from '../lib/stageplotIcons';

interface PublicStageplot {
  name: string;
  icon?: string;
  bandName?: string;
  items: StageplotItem[];
  drawingLayers: SongHandNoteDocument[];
}

type Status = 'loading' | 'not-found' | 'private' | 'error' | 'ready';

function normalizeItem(raw: unknown): StageplotItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'string') return null;

  return {
    id: data.id,
    kind: typeof data.kind === 'string' ? data.kind : 'custom',
    label: typeof data.label === 'string' ? data.label : 'Item',
    x: typeof data.x === 'number' ? data.x : 0.5,
    y: typeof data.y === 'number' ? data.y : 0.5,
    rotation: typeof data.rotation === 'number' && Number.isFinite(data.rotation)
      ? ((data.rotation % 360) + 360) % 360
      : 0,
    color: typeof data.color === 'string' ? data.color : undefined,
    icon: typeof data.icon === 'string' ? data.icon : undefined,
  };
}

function normalizeLayer(raw: unknown): SongHandNoteDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.authorUid !== 'string') return null;

  const viewportRaw = data.viewport && typeof data.viewport === 'object'
    ? (data.viewport as Record<string, unknown>)
    : {};

  return {
    authorUid: data.authorUid,
    authorName: typeof data.authorName === 'string' ? data.authorName : null,
    authorAvatar: typeof data.authorAvatar === 'string' ? data.authorAvatar : null,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    viewport: {
      width: typeof viewportRaw.width === 'number' ? viewportRaw.width : 1,
      height: typeof viewportRaw.height === 'number' ? viewportRaw.height : 1,
    },
    strokes: Array.isArray(data.strokes) ? (data.strokes as SongHandNoteDocument['strokes']) : [],
  };
}

export default function PublicBandStageplotPage() {
  const { bandId, riderId } = useParams<{ bandId: string; riderId: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [stageplot, setStageplot] = useState<PublicStageplot | null>(null);
  const [bandLogo, setBandLogo] = useState<string | undefined>();

  useEffect(() => {
    if (!bandId || !riderId || !db) {
      setStatus('error');
      return;
    }

    const firestore = db;
    let cancelled = false;

    const load = async () => {
      try {
        const snap = await getDoc(doc(firestore, 'bands', bandId, 'technicalRiders', riderId));
        if (cancelled) return;

        if (!snap.exists()) {
          setStatus('not-found');
          return;
        }

        const data = snap.data() as Record<string, unknown>;
        if (data.publicShareEnabled !== true) {
          setStatus('private');
          return;
        }

        try {
          const bandSnap = await getDoc(doc(firestore, 'bands', bandId));
          if (bandSnap.exists()) {
            const bandData = bandSnap.data() as Record<string, unknown>;
            setBandLogo(typeof bandData.logo === 'string' ? bandData.logo : undefined);
          } else {
            setBandLogo(undefined);
          }
        } catch {
          setBandLogo(undefined);
        }

        const items = Array.isArray(data.items)
          ? data.items.map(normalizeItem).filter((entry): entry is StageplotItem => Boolean(entry))
          : [];
        const drawingLayers = Array.isArray(data.drawingLayers)
          ? data.drawingLayers.map(normalizeLayer).filter((entry): entry is SongHandNoteDocument => Boolean(entry))
          : [];

        setStageplot({
          name: typeof data.name === 'string' ? data.name : 'Stageplot',
          icon: typeof data.icon === 'string' ? data.icon : undefined,
          bandName: typeof data.bandName === 'string' ? data.bandName : undefined,
          items,
          drawingLayers,
        });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [bandId, riderId]);

  if (status === 'loading') {
    return <div className="public-setlist-page"><p className="public-setlist-status">Loading stageplot…</p></div>;
  }

  if (status === 'not-found') {
    return <div className="public-setlist-page"><p className="public-setlist-status">Stageplot not found.</p></div>;
  }

  if (status === 'private') {
    return <div className="public-setlist-page"><p className="public-setlist-status">This stageplot is not publicly shared.</p></div>;
  }

  if (status === 'error' || !stageplot) {
    return <div className="public-setlist-page"><p className="public-setlist-status">Failed to load stageplot.</p></div>;
  }

  return (
    <div className="public-setlist-page">
      <header className="public-setlist-header">
        <Link to="/" className="public-page-nav-brand public-page-nav-brand--large"><BrandMark size={22} /></Link>
        <div className="public-share-branding-row public-share-branding-row--header">
          {(stageplot.bandName || bandLogo) ? (
            <div className="public-share-band-stack public-share-band-stack--header">
              {bandLogo ? <img src={bandLogo} alt={`${stageplot.bandName ?? 'Band'} logo`} className="public-setlist-band-logo public-setlist-band-logo--large" loading="lazy" /> : null}
              {stageplot.bandName ? <h1 className="public-setlist-band public-setlist-band--stack">{stageplot.bandName}</h1> : null}
            </div>
          ) : null}
        </div>
        <h2 className="public-setlist-title">
          {stageplot.icon ? <span aria-hidden="true">{stageplot.icon} </span> : null}
          {stageplot.name}
        </h2>
        <p className="public-setlist-count">{stageplot.items.length} item{stageplot.items.length === 1 ? '' : 's'}</p>
      </header>

      <div className="stageplot-stage song-notes-stage stageplot-stage--public">
        <div className="stageplot-stage-grid" />
        <div className="stageplot-front-edge" aria-hidden="true" />
        <div className="stageplot-audience-marker" aria-label="Audience-facing side">
          Audience
        </div>
        {stageplot.items.map((item) => (
          <div
            key={item.id}
            className="stageplot-item stageplot-item--public"
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg)`,
              borderColor: item.color ?? 'var(--border)',
              color: item.color ?? 'var(--text)',
            }}
          >
            <img
              src={stageplotIconForKind(item.kind)}
              alt=""
              aria-hidden="true"
              className="stageplot-instrument-icon"
            />
            <span>{item.label}</span>
          </div>
        ))}

        <SongHandNotesOverlay
          visible
          drawEnabled={false}
          notes={stageplot.drawingLayers}
          myStrokes={[]}
          onMyStrokesChange={() => {}}
        />
      </div>

      <footer className="footer">From Norway <3 with chords</footer>
    </div>
  );
}
