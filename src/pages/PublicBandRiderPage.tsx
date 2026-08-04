import { Fragment, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeInputList } from '../lib/inputLists';
import type { InputList, SongHandNoteDocument, StageplotItem } from '../types';
import SongHandNotesOverlay from '../components/SongHandNotesOverlay';
import { stageplotIconForKind } from '../lib/stageplotIcons';

type Status = 'loading' | 'not-found' | 'private' | 'error' | 'ready';

interface StageplotData {
  items: StageplotItem[];
  drawingLayers: SongHandNoteDocument[];
}

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
    channel: typeof data.channel === 'string' ? data.channel : undefined,
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

export default function PublicBandRiderPage() {
  const { bandId, riderId } = useParams<{ bandId: string; riderId: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [rider, setRider] = useState<InputList | null>(null);
  const [stageplot, setStageplot] = useState<StageplotData | null>(null);
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
        const snapshot = await getDoc(doc(firestore, 'bands', bandId, 'technicalRiders', riderId));
        if (cancelled) return;

        if (!snapshot.exists()) {
          setStatus('not-found');
          return;
        }

        const data = snapshot.data() as Record<string, unknown>;
        if (data.publicShareEnabled !== true) {
          setStatus('private');
          return;
        }

        setRider(normalizeInputList(snapshot.id, data));

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

        if (items.length > 0 || drawingLayers.length > 0) {
          setStageplot({ items, drawingLayers });
        }

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
    return <div className="public-setlist-page"><p className="public-setlist-status">Loading technical rider...</p></div>;
  }

  if (status === 'not-found') {
    return <div className="public-setlist-page"><p className="public-setlist-status">Technical rider not found.</p></div>;
  }

  if (status === 'private') {
    return <div className="public-setlist-page"><p className="public-setlist-status">This technical rider is not publicly shared.</p></div>;
  }

  if (status === 'error' || !rider) {
    return <div className="public-setlist-page"><p className="public-setlist-status">Failed to load technical rider.</p></div>;
  }

  return (
    <main className="public-setlist-page technical-rider-public-page">
      <header className="public-setlist-header public-share-header">
        <Link to="/" className="public-page-nav-brand public-page-nav-brand--large"><BrandMark size={22} /></Link>
        <div className="public-share-branding-row public-share-branding-row--header">
          {(rider.bandName || bandLogo) ? (
            <div className="public-share-band-stack public-share-band-stack--header">
              {bandLogo ? (
                <img
                  src={bandLogo}
                  alt={`${rider.bandName ?? 'Band'} logo`}
                  className="public-setlist-band-logo public-setlist-band-logo--large"
                  loading="lazy"
                />
              ) : null}
              {rider.bandName ? <p className="public-share-band-name">{rider.bandName}</p> : null}
            </div>
          ) : null}
        </div>
        <h1 className="public-setlist-title">
          {rider.icon ? <span aria-hidden="true">{rider.icon} </span> : null}
          {rider.name}
        </h1>
      </header>

      <div className="public-presskit-body">
        <section className="technical-rider-section technical-rider-public-section">
          <h2>Technical Lines</h2>
          <div className="technical-rider-table-wrap">
            <table className="technical-rider-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Stand</th>
                </tr>
              </thead>
              <tbody>
                {rider.lines.map((line, index) => (
                  <tr key={line.id}>
                    <td>{index + 1}</td>
                    <td>{line.name}</td>
                    <td>{line.description || '-'}</td>
                    <td>{line.stand || '-'}</td>
                  </tr>
                ))}
                {rider.lines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="technical-rider-empty-cell">No line items listed.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="technical-rider-section technical-rider-public-section">
          <h2>Preferred Equipment</h2>
          <div className="technical-rider-table-wrap">
            <table className="technical-rider-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {rider.preferredEquipment.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.description || '-'}</td>
                  </tr>
                ))}
                {rider.preferredEquipment.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="technical-rider-empty-cell">No equipment listed.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="technical-rider-section technical-rider-public-section">
          <h2>We Bring (Inventory)</h2>
          <div className="technical-rider-table-wrap">
            <table className="technical-rider-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {rider.inventoryEquipment.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.description || '-'}</td>
                  </tr>
                ))}
                {rider.inventoryEquipment.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="technical-rider-empty-cell">No equipment listed.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {rider.monitorMixes && rider.monitorMixes.length > 0 ? (
          <section className="technical-rider-section technical-rider-public-section">
            <h2>Monitoring</h2>
            <div className="technical-rider-table-wrap">
              <table className="technical-rider-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Position</th>
                    <th>Priority Order</th>
                  </tr>
                </thead>
                <tbody>
                  {rider.monitorMixes.map((mix, index) => (
                    <tr key={mix.id}>
                      <td>{index + 1}</td>
                      <td>{mix.name}</td>
                      <td>{mix.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {rider.hospitalityNotes ? (
          <section className="technical-rider-section technical-rider-public-section">
            <h2>Hospitality & Logistics</h2>
            <p className="technical-rider-notes-view">{rider.hospitalityNotes}</p>
          </section>
        ) : null}

        {stageplot && (stageplot.items.length > 0 || stageplot.drawingLayers.length > 0) ? (
          <section className="technical-rider-section technical-rider-public-section">
            <h2>Stage Plot</h2>
            {(rider.stageShape || rider.stageSize) ? (
              <p className="technical-rider-notes-view technical-rider-stage-meta">
                {[
                  rider.stageShape ? `Shape: ${rider.stageShape}` : null,
                  rider.stageSize ? `Size: ${rider.stageSize}` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          <div className="stageplot-stage song-notes-stage stageplot-stage--public">
            <div className="stageplot-stage-grid" />
            <div className="stageplot-front-edge" aria-hidden="true" />
            <div className="stageplot-audience-marker" aria-label="Audience-facing side">
              Audience
            </div>
            {stageplot.items.map((item) => (
              <Fragment key={item.id}>
                <div
                  className="stageplot-item stageplot-item--public"
                  style={{
                    left: `${item.x * 100}%`,
                    top: `${item.y * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg)`,
                    color: item.color ?? 'var(--text)',
                  }}
                >
                  <img
                    src={stageplotIconForKind(item.kind)}
                    alt=""
                    aria-hidden="true"
                    className="stageplot-instrument-icon"
                  />
                </div>
                <div
                  className="stageplot-item-label"
                  style={{
                    left: `${item.x * 100}%`,
                    top: `${item.y * 100}%`,
                    color: item.color ?? 'var(--text)',
                  }}
                >
                  <span>{item.label}</span>
                  {item.channel ? <span className="stageplot-item-channel">Ch {item.channel}</span> : null}
                </div>
              </Fragment>
            ))}
            <SongHandNotesOverlay
              visible
              drawEnabled={false}
              notes={stageplot.drawingLayers}
              myStrokes={[]}
              onMyStrokesChange={() => {}}
            />
          </div>
        </section>
      ) : null}
      </div>

      <footer className="footer">From Norway {'<3'} with chords</footer>
    </main>
  );
}
