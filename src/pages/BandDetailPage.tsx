import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserPlus, Users, X } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { useSongs } from '../context/SongsContext';
import SongList from '../components/SongList';
import UserAvatar from '../components/UserAvatar';
import type { CollaborationPermission, Song } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';

export default function BandDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { songs, deleteSong } = useSongs();
  const {
    bands,
    bandSongsByBandId,
    loading,
    renameBand,
    refreshBandSongs,
    inviteMember,
    changeMemberRole,
    removeMember,
    leaveBand,
    addSongToBandLibrary,
    removeSongFromBandLibrary,
    moveBandSong,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;
  const bandSongs = id ? (bandSongsByBandId[id] ?? []) : [];
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaborationPermission>('viewer');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);

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

  useEffect(() => {
    if (!showMembersModal) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMembersModal(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showMembersModal]);

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

  const handleChangeRole = async (memberId: string, role: CollaborationPermission) => {
    setBusyRoleId(memberId);
    const error = await changeMemberRole(band.id, memberId, role);
    setBusyRoleId(null);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Role updated.');
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

  const handleAddSong = async (songId: string) => {
    const selectedSong = ownedSongs.find((song) => song.id === songId);
    if (!selectedSong) {
      toast.error('Select a song to add.');
      return;
    }

    const error = await addSongToBandLibrary(band.id, selectedSong);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Song added to band library.');
  };

  const handleRemoveSong = async (song: Song) => {
    const error = await removeSongFromBandLibrary(band.id, song.id);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Song removed from band library.');
  };

  const handleDeleteSong = async (song: Song) => {
    if (!user?.id || song.ownerId !== user.id) {
      toast.error('Only the song owner can delete this song from the database.');
      return;
    }

    const confirmed = await showConfirmToast(`Delete "${song.title}" from the database? This cannot be undone.`, {
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    await deleteSong(song.id);
    toast.success('Song deleted from database.');
  };

  const handleMoveSong = async (songId: string, beforeSongId: string | null) => {
    const error = await moveBandSong(band.id, songId, beforeSongId);
    if (error) {
      toast.error(error);
    }
  };

  const handleRenameBand = async (name: string) => {
    const error = await renameBand(band.id, name);
    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Band renamed.');
  };

  return (
    <section className="bands-page bands-page--library">
      <SongList
        songs={bandSongs}
        listName={band.name}
        headerMeta={`${band.memberIds.length} member${band.memberIds.length === 1 ? '' : 's'} in this band.`}
        headerVariant="bands"
        onRenameList={canEditBand ? (name) => void handleRenameBand(name) : undefined}
        headerActions={(
          <button
            type="button"
            className="setlist-action-btn setlist-action-btn--secondary"
            onClick={() => setShowMembersModal(true)}
            title="Manage band members"
          >
            <Users size={14} />
          </button>
        )}
        allSongs={ownedSongs}
        onDeleteSong={canEditBand ? handleDeleteSong : async () => {}}
        onRemoveSong={canEditBand ? handleRemoveSong : undefined}
        onAddSong={canEditBand ? handleAddSong : undefined}
        onMoveSong={canEditBand ? handleMoveSong : undefined}
      />

      {showMembersModal && (
        <div className="modal-overlay" onClick={() => setShowMembersModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Band Members</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowMembersModal(false)}
                aria-label="Close members panel"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-content">
              <section className="bands-panel">
                <h3>Members</h3>
                <ul className="bands-members-list">
                  {band.memberIds.map((memberId) => {
                    const role = band.ownerId === memberId ? 'owner' : band.memberRoles[memberId] ?? 'viewer';
                    const username = band.memberUsernames[memberId] ?? null;
                    const email = band.memberEmails[memberId] ?? 'No email saved';
                    const avatar = band.memberAvatars[memberId] ?? null;
                    const canRemove = isOwner && memberId !== band.ownerId;
                    const isCurrentUser = memberId === user?.id;

                    return (
                      <li key={memberId} className="bands-member-card">
                        <UserAvatar avatar={avatar} label={username ?? email} size="md" />
                        <div className="bands-member-copy">
                          <strong>{username ?? email}</strong>
                          <span>{username ? email : ''}</span>
                          {memberId === band.ownerId ? (
                            <span>{role}</span>
                          ) : isOwner ? (
                            <select
                              className="bands-member-role-select"
                              value={role}
                              disabled={busyRoleId === memberId}
                              onChange={(event) => void handleChangeRole(memberId, event.target.value as CollaborationPermission)}
                              aria-label="Member role"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                            </select>
                          ) : (
                            <span>{role}</span>
                          )}
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
                <h3>Invite member</h3>
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
          </div>
        </div>
      )}
    </section>
  );
}