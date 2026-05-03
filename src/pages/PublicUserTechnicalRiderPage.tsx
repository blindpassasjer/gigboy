import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeTechnicalRider } from '../lib/technicalRiders';
import type { TechnicalRider } from '../types';

type Status = 'loading' | 'not-found' | 'private' | 'error' | 'ready';

export default function PublicUserTechnicalRiderPage() {
  const { userId, riderId } = useParams<{ userId: string; riderId: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [rider, setRider] = useState<TechnicalRider | null>(null);

  useEffect(() => {
    if (!userId || !riderId || !db) {
      setStatus('error');
      return;
    }

    const firestore = db;

    let cancelled = false;

    const load = async () => {
      try {
        const snapshot = await getDoc(doc(firestore, 'users', userId, 'technicalRiders', riderId));
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

        setRider(normalizeTechnicalRider(snapshot.id, data));
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [riderId, userId]);

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
    <div className="public-setlist-page technical-rider-public-page">
      <header className="public-setlist-header">
        <h1 className="public-setlist-title">{rider.name}</h1>
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
        <Link to="/" className="public-setlist-footer-link">Folio</Link>
      </footer>
    </div>
  );
}
