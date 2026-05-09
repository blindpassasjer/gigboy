import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeInputList } from '../lib/inputLists';
import type { InputList } from '../types';

type Status = 'loading' | 'not-found' | 'private' | 'error' | 'ready';

export default function PublicBandInputListPage() {
  const { bandId, riderId } = useParams<{ bandId: string; riderId: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [rider, setRider] = useState<InputList | null>(null);
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
    return <div className="public-setlist-page"><p className="public-setlist-status">Loading input list...</p></div>;
  }

  if (status === 'not-found') {
    return <div className="public-setlist-page"><p className="public-setlist-status">Input list not found.</p></div>;
  }

  if (status === 'private') {
    return <div className="public-setlist-page"><p className="public-setlist-status">This input list is not publicly shared.</p></div>;
  }

  if (status === 'error' || !rider) {
    return <div className="public-setlist-page"><p className="public-setlist-status">Failed to load input list.</p></div>;
  }

  return (
    <div className="public-setlist-page technical-rider-public-page">
      <header className="public-setlist-header">
        <Link to="/" className="public-page-nav-brand public-page-nav-brand--large"><BrandMark size={22} /></Link>
        <div className="public-share-branding-row public-share-branding-row--header">
          {(rider.bandName || bandLogo) ? (
            <div className="public-share-band-stack public-share-band-stack--header">
              {bandLogo ? <img src={bandLogo} alt={`${rider.bandName ?? 'Band'} logo`} className="public-setlist-band-logo public-setlist-band-logo--large" loading="lazy" /> : null}
              {rider.bandName ? <h1 className="public-setlist-band public-setlist-band--stack">{rider.bandName}</h1> : null}
            </div>
          ) : null}
        </div>
        <h2 className="public-setlist-title">{rider.name}</h2>
      </header>

      <section className="technical-rider-section technical-rider-public-section">
        <h2>Technical Lines</h2>
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
              {rider.lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td>{line.name}</td>
                  <td>{line.description || '-'}</td>
                </tr>
              ))}
              {rider.lines.length === 0 ? (
                <tr>
                  <td colSpan={3} className="technical-rider-empty-cell">No line items listed.</td>
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

      <footer className="public-setlist-footer">
        <div className="public-share-branding-row public-share-branding-row--footer">
          <Link to="/" className="public-setlist-footer-link public-page-nav-brand--large"><BrandMark size={18} /></Link>
        </div>
        <p className="public-setlist-signoff">From Norway - with chords</p>
      </footer>
    </div>
  );
}
