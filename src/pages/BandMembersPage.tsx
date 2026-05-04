import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import BandManagementPanel from '../components/BandManagementPanel';
import { showConfirmToast } from '../utils/toastDialogs';

export default function BandMembersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    bands,
    loading,
    leaveBand,
    deleteBand,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;
  const [busyDeleteBand, setBusyDeleteBand] = useState(false);

  if (loading && !band) {
    return <p className="bands-status">Loading band…</p>;
  }

  if (!band || !id) {
    return (
      <section className="bands-page">
        <p className="bands-status">Band not found.</p>
        <Link to="/bands" className="setlist-action-btn setlist-action-btn--secondary">Back to bands</Link>
      </section>
    );
  }

  const isOwner = band.ownerId === user?.id;
  const canEditBand = isOwner || band.memberRoles[user?.id ?? ''] === 'editor';

  const handleDeleteBand = async () => {
    const confirmed = await showConfirmToast(`Delete "${band.name}"? This cannot be undone.`, {
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setBusyDeleteBand(true);
    const error = await deleteBand(band.id);
    setBusyDeleteBand(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Band deleted.');
    navigate('/bands');
  };

  return (
    <section className="bands-page">
      <header className="bands-header">
        <div>
          <h1>{band.name}</h1>
          <p>Manage members and roles for this band.</p>
        </div>
      </header>

      <Link to={`/bands/${band.id}/library`} className="setlist-action-btn setlist-action-btn--secondary">
        Back to band library
      </Link>

      <div className="modal-content">
        <BandManagementPanel
          band={band}
          canEditBand={canEditBand}
          isOwner={isOwner}
          showLeaveCurrentUser
          onLeaveCurrentUser={() => leaveBand(band.id)}
          onLeaveSuccess={() => navigate('/bands')}
        />

        {isOwner && (
          <section className="bands-panel bands-panel--danger">
            <h3>Danger zone</h3>
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--danger"
              disabled={busyDeleteBand}
              onClick={() => void handleDeleteBand()}
            >
              {busyDeleteBand ? 'Deleting…' : 'Delete band'}
            </button>
          </section>
        )}
      </div>
    </section>
  );
}
