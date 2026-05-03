import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { Music2, Users } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { ICON_OPTIONS } from '../lib/iconOptions';

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

export default function BandsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { bands, loading, cloudRequired, createBand, deleteBand } = useBands();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🎵');
  const [creating, setCreating] = useState(false);
  const [busyBandId, setBusyBandId] = useState<string | null>(null);

  const handleCreateBand = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);

    const result = await createBand(name, description, normalizeEmojiIcon(icon));
    setCreating(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setName('');
    setDescription('');
    setIcon('🎵');
    toast.success('Band created.');

    if (result.bandId) {
      navigate(`/bands/${result.bandId}/library`);
    }
  };

  const handleDeleteBand = async (bandId: string) => {
    setBusyBandId(bandId);
    const error = await deleteBand(bandId);
    setBusyBandId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Band deleted.');
  };

  return (
    <section className="bands-page">
      <header className="bands-header">
        <div>
          <h1>Bands</h1>
          <p>Create bands, invite members, and maintain a shared band library.</p>
        </div>
      </header>

      {cloudRequired ? (
        <p className="bands-status">Bands require Firebase auth and Firestore to be configured.</p>
      ) : null}

      <form className="bands-create-card" onSubmit={handleCreateBand}>
        <div className="bands-create-grid">
          <label className="share-menu-field">
            <span>Band name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Youth Team"
            />
          </label>
          <label className="share-menu-field">
            <span>Description</span>
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="share-menu-field">
            <span>Icon</span>
            <select value={icon} onChange={(event) => setIcon(event.target.value)}>
              {ICON_OPTIONS.map((emoji) => (
                <option key={emoji} value={emoji}>{emoji}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="bands-create-actions">
          <button type="submit" className="setlist-action-btn" disabled={creating || cloudRequired}>
            {creating ? 'Creating…' : 'Create band'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="bands-status">Loading bands…</p>
      ) : bands.length === 0 ? (
        <p className="bands-status">No bands yet.</p>
      ) : (
        <ul className="bands-list">
          {bands.map((band) => {
            const isOwner = band.ownerId === user?.id;
            const role = isOwner ? 'owner' : band.memberRoles[user?.id ?? ''] ?? 'viewer';

            return (
              <li key={band.id} className="bands-card">
                <Link to={`/bands/${band.id}/library`} className="bands-card-main">
                  <div className="bands-card-icon" aria-hidden="true">
                    {band.icon ? <span>{band.icon}</span> : <Music2 size={18} />}
                  </div>
                  <div className="bands-card-copy">
                    <strong>{band.name}</strong>
                    <span>{band.description || `${band.memberIds.length} members`}</span>
                  </div>
                </Link>
                <div className="bands-card-meta">
                  <span className="bands-role-badge">{role}</span>
                  <span className="bands-members-pill"><Users size={14} /> {band.memberIds.length}</span>
                  {isOwner ? (
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--secondary"
                      disabled={busyBandId === band.id}
                      onClick={() => void handleDeleteBand(band.id)}
                    >
                      {busyBandId === band.id ? 'Deleting…' : 'Delete'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}