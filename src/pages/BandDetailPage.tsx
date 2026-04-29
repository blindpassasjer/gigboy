import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LibraryBig, UserPlus, Users } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { useSongs } from '../context/SongsContext';
import type { CollaborationPermission } from '../types';

type BandTab = 'members' | 'library';

export default function BandDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { songs } = useSongs();
  const {
    bands,
    bandSongsByBandId,
    loading,
    refreshBandSongs,
    inviteMember,
    removeMember,
    leaveBand,
    addSongToBandLibrary,
    removeSongFromBandLibrary,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;
  const bandSongs = id ? (bandSongsByBandId[id] ?? []) : [];
  const [activeTab, setActiveTab] = useState<BandTab>('members');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaborationPermission>('viewer');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [busySongId, setBusySongId] = useState<string | null>(null);
  const [addingSong, setAddingSong] = useState(false);

  const ownedSongs = useMemo(() => {
    if (!user?.id) return [];
    return songs.filter((song) => song.ownerId === user.id);
  }, [songs, user?.id]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandSongs(id).catch((error) => {
      console.error('Failed to load band songs.', error);
      toast.error('Failed to load band library.');
    });
  }, [band, id, refreshBandSongs]);

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

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyInvite(true);
    const error = await inviteMember(band.id, inviteEmail, inviteRole);
    setBusyInvite(false);

    if (error) {
      toast.error(error);
      return;
    }

    setInviteEmail('');
    toast.success('Band invite sent.');
  };

  const handleRemoveMember = async (memberId: string) => {
    setBusyMemberId(memberId);
    const error = await removeMember(band.id, memberId);
    setBusyMemberId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Member removed.');
  };

  const handleLeaveBand = async () => {
    setBusyMemberId(user?.id ?? 'self');
    const error = await leaveBand(band.id);
    setBusyMemberId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('You left the band.');
    navigate('/bands');
  };

  const handleAddSong = async () => {
    const selectedSong = ownedSongs.find((song) => song.id === selectedSongId);
    if (!selectedSong) {
      toast.error('Select a song to add.');
      return;
    }

    setAddingSong(true);
    const error = await addSongToBandLibrary(band.id, selectedSong);
    setAddingSong(false);

    if (error) {
      toast.error(error);
      return;
    }

    setSelectedSongId('');
    toast.success('Song added to band library.');
  };

  const handleRemoveSong = async (songId: string) => {
    setBusySongId(songId);
    const error = await removeSongFromBandLibrary(band.id, songId);
    setBusySongId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Song removed from band library.');
  };

  return (
    <section className="bands-page">
      <header className="bands-header bands-header--detail">
        <div>
          <h1>{band.name}</h1>
          <p>{band.description || `${band.memberIds.length} members in this band.`}</p>
        </div>
        <Link to="/bands" className="setlist-action-btn setlist-action-btn--secondary">All bands</Link>
      </header>

      <div className="bands-tabs" role="tablist" aria-label="Band tabs">
        <button
          type="button"
          className={`bands-tab${activeTab === 'members' ? ' active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          <Users size={15} /> Members
        </button>
        <button
          type="button"
          className={`bands-tab${activeTab === 'library' ? ' active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          <LibraryBig size={15} /> Library
        </button>
      </div>

      {activeTab === 'members' ? (
        <div className="bands-detail-grid">
          <section className="bands-panel">
            <h2>Members</h2>
            <ul className="bands-members-list">
              {band.memberIds.map((memberId) => {
                const role = band.ownerId === memberId ? 'owner' : band.memberRoles[memberId] ?? 'viewer';
                const email = band.memberEmails[memberId] ?? 'No email saved';
                const canRemove = isOwner && memberId !== band.ownerId;
                const isCurrentUser = memberId === user?.id;

                return (
                  <li key={memberId} className="bands-member-card">
                    <div className="bands-member-copy">
                      <strong>{email}</strong>
                      <span>{role}</span>
                    </div>
                    <div className="bands-member-actions">
                      {canRemove ? (
                        <button
                          type="button"
                          className="setlist-action-btn setlist-action-btn--secondary"
                          disabled={busyMemberId === memberId}
                          onClick={() => void handleRemoveMember(memberId)}
                        >
                          {busyMemberId === memberId ? 'Working…' : 'Remove'}
                        </button>
                      ) : null}
                      {!isOwner && isCurrentUser ? (
                        <button
                          type="button"
                          className="setlist-action-btn setlist-action-btn--secondary"
                          disabled={busyMemberId === memberId}
                          onClick={() => void handleLeaveBand()}
                        >
                          {busyMemberId === memberId ? 'Working…' : 'Leave band'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="bands-panel">
            <h2>Invite member</h2>
            <form className="bands-invite-form" onSubmit={handleInvite}>
              <label className="share-menu-field">
                <span>Email</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@example.com"
                  disabled={!canEditBand}
                />
              </label>
              <label className="share-menu-field">
                <span>Role</span>
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as CollaborationPermission)}
                  disabled={!canEditBand}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </label>
              <button type="submit" className="setlist-action-btn" disabled={!canEditBand || busyInvite}>
                <UserPlus size={15} /> {busyInvite ? 'Sending…' : 'Send invite'}
              </button>
            </form>
          </section>
        </div>
      ) : (
        <div className="bands-detail-grid">
          <section className="bands-panel">
            <h2>Band library</h2>
            {bandSongs.length === 0 ? (
              <p className="bands-status">No songs in this band library yet.</p>
            ) : (
              <ul className="bands-library-list">
                {bandSongs.map((song) => (
                  <li key={song.id} className="bands-library-card">
                    <div className="bands-library-copy">
                      <strong>{song.title}</strong>
                      <span>{song.artist || 'Unknown artist'}</span>
                    </div>
                    {canEditBand ? (
                      <button
                        type="button"
                        className="setlist-action-btn setlist-action-btn--secondary"
                        disabled={busySongId === song.id}
                        onClick={() => void handleRemoveSong(song.id)}
                      >
                        {busySongId === song.id ? 'Working…' : 'Remove'}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bands-panel">
            <h2>Add from my library</h2>
            <label className="share-menu-field">
              <span>Song</span>
              <select value={selectedSongId} onChange={(event) => setSelectedSongId(event.target.value)} disabled={!canEditBand}>
                <option value="">Select a song…</option>
                {ownedSongs.map((song) => (
                  <option key={song.id} value={song.id}>{song.title}{song.artist ? ` - ${song.artist}` : ''}</option>
                ))}
              </select>
            </label>
            <button type="button" className="setlist-action-btn" disabled={!canEditBand || addingSong} onClick={() => void handleAddSong()}>
              {addingSong ? 'Adding…' : 'Add to band library'}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}