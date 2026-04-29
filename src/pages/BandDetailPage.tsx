import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LibraryBig, Plus, Search, UserPlus, Users, X } from 'lucide-react';
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
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaborationPermission>('viewer');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);
  const [busySongId, setBusySongId] = useState<string | null>(null);
  const [addingSong, setAddingSong] = useState(false);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const ownedSongs = useMemo(() => {
    if (!user?.id) return [];
    return songs.filter((song) => song.ownerId === user.id);
  }, [songs, user?.id]);

  const availableSongs = useMemo(() => {
    const bandSongIds = new Set(bandSongs.map((song) => song.id));
    return ownedSongs
      .filter((song) => !bandSongIds.has(song.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [bandSongs, ownedSongs]);

  const filteredAvailableSongs = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return availableSongs;

    return availableSongs.filter((song) => {
      const inTitle = song.title.toLowerCase().includes(query);
      const inArtist = (song.artist ?? '').toLowerCase().includes(query);
      const inTags = (song.tags ?? []).some((tag) => tag.toLowerCase().includes(query));
      return inTitle || inArtist || inTags;
    });
  }, [availableSongs, pickerQuery]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandSongs(id).catch((error) => {
      console.error('Failed to load band songs.', error);
      toast.error('Failed to load band library.');
    });
  }, [band, id, refreshBandSongs]);

  useEffect(() => {
    if (!showSongPicker) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSongPicker(false);
        setPickerQuery('');
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showSongPicker]);

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
    const error = await inviteMember(band.id, inviteUsername, inviteRole);
    setBusyInvite(false);

    if (error) {
      toast.error(error);
      return;
    }

    setInviteUsername('');
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

  const openSongPicker = () => {
    setPickerQuery('');
    setShowSongPicker(true);
  };

  const closeSongPicker = () => {
    setShowSongPicker(false);
    setPickerQuery('');
  };

  const handleAddSong = async (songId: string) => {
    const selectedSong = ownedSongs.find((song) => song.id === songId);
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
                const username = band.memberUsernames[memberId] ?? null;
                const email = band.memberEmails[memberId] ?? 'No email saved';
                const canRemove = isOwner && memberId !== band.ownerId;
                const isCurrentUser = memberId === user?.id;

                return (
                  <li key={memberId} className="bands-member-card">
                    <div className="bands-member-copy">
                      <strong>{username ?? email}</strong>
                      <span>{username ? email : ''}</span>
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
                <span>Username</span>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(event) => setInviteUsername(event.target.value)}
                  placeholder="bandmate"
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
            <button type="button" className="setlist-action-btn" disabled={!canEditBand || addingSong} onClick={openSongPicker}>
              <Plus size={15} /> {addingSong ? 'Adding…' : 'Add songs'}
            </button>
            {showSongPicker ? (
              <div className="song-picker-overlay" role="dialog" aria-modal="true" aria-label="Add songs to band library">
                <div className="song-picker-panel">
                  <div className="song-picker-header">
                    <h2>Add songs to {band.name}</h2>
                    <button className="song-picker-close" onClick={closeSongPicker} aria-label="Close song picker">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="song-picker-search-wrap">
                    <Search size={15} className="song-picker-search-icon" />
                    <input
                      type="text"
                      className="song-picker-search"
                      value={pickerQuery}
                      onChange={(event) => setPickerQuery(event.target.value)}
                      placeholder="Search by title, artist, or tag"
                    />
                  </div>

                  <div className="song-picker-results" role="list">
                    {filteredAvailableSongs.length === 0 ? (
                      <p className="song-picker-empty">No songs available to add.</p>
                    ) : (
                      filteredAvailableSongs.map((song) => (
                        <div key={song.id} className="song-picker-item" role="listitem">
                          <div className="song-picker-item-main">
                            <span className="song-picker-song-title">{song.title}</span>
                            {song.artist ? <span className="song-picker-song-artist">{song.artist}</span> : null}
                          </div>
                          <button
                            className="song-picker-add-btn"
                            onClick={() => void handleAddSong(song.id)}
                            title={`Add ${song.title}`}
                            disabled={addingSong}
                          >
                            <Plus size={14} /> Add
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="song-picker-footer">
                    <button className="setlist-action-btn" onClick={closeSongPicker}>Done</button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </section>
  );
}