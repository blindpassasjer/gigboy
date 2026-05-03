import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { Link2, UserPlus, Users, X } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { useSongs } from '../context/SongsContext';
import SongList from '../components/SongList';
import StageplotEditor from '../components/StageplotEditor';
import TechnicalRiderEditor from '../components/TechnicalRiderEditor';
import TrashView from '../components/TrashView';
import UserAvatar from '../components/UserAvatar';
import type { CollaborationPermission, Song } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';

export default function BandDetailPage() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { songs, deleteSong } = useSongs();
  const {
    bands,
    bandSongsByBandId,
    bandSongListsByBandId,
    bandSetlistsByBandId,
    bandStageplotsByBandId,
    bandTechnicalRidersByBandId,
    bandTrashByBandId,
    loading,
    renameBand,
    refreshBandSongs,
    refreshBandSongLists,
    refreshBandSetlists,
    refreshBandStageplots,
    refreshBandTechnicalRiders,
    refreshBandTrash,
    inviteMember,
    changeMemberRole,
    removeMember,
    leaveBand,
    deleteBand,
    addSongToBandLibrary,
    removeSongFromBandLibrary,
    moveBandSong,
    renameBandSongList,
    updateBandSongListIcon,
    updateBandLibraryIcon,
    deleteBandSongList,
    addSongToBandSongList,
    removeSongFromBandSongList,
    moveSongInBandSongList,
    renameBandSetlist,
    updateBandSetlistIcon,
    setBandSetlistPublicShare,
    deleteBandSetlist,
    addSongToBandSetlist,
    removeSongFromBandSetlist,
    moveSongInBandSetlist,
    renameBandStageplot,
    updateBandStageplotIcon,
    setBandStageplotPublicShare,
    updateBandStageplotContent,
    deleteBandStageplot,
    renameBandTechnicalRider,
    setBandTechnicalRiderPublicShare,
    updateBandTechnicalRiderContent,
    deleteBandTechnicalRider,
    restoreBandTrashItem,
    deleteBandTrashItemPermanently,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;
  const bandSongs = id ? (bandSongsByBandId[id] ?? []) : [];
  const bandSongLists = id ? (bandSongListsByBandId[id] ?? []) : [];
  const bandSetlists = id ? (bandSetlistsByBandId[id] ?? []) : [];
  const bandStageplots = id ? (bandStageplotsByBandId[id] ?? []) : [];
  const bandTechnicalRiders = id ? (bandTechnicalRidersByBandId[id] ?? []) : [];
  const bandTrash = id ? (bandTrashByBandId[id] ?? []) : [];
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaborationPermission>('viewer');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);
  const [busyDeleteBand, setBusyDeleteBand] = useState(false);

  const ownedSongs = useMemo(() => {
    if (!user?.id) return [];
    return songs.filter((song) => song.ownerId === user.id);
  }, [songs, user?.id]);

  const routeSegments = pathname.split('/').filter(Boolean);
  const routeBandId = routeSegments[0] === 'bands' ? routeSegments[1] : null;
  const bandSection = routeBandId === id ? (routeSegments[2] ?? 'library') : 'library';
  const bandResourceId = routeBandId === id ? (routeSegments[3] ?? null) : null;

  const activeBandSongList = bandSection === 'songlists'
    ? bandSongLists.find((entry) => entry.id === bandResourceId) ?? null
    : null;
  const activeBandSetlist = bandSection === 'setlists'
    ? bandSetlists.find((entry) => entry.id === bandResourceId) ?? null
    : null;
  const activeBandStageplot = bandSection === 'stageplots'
    ? bandStageplots.find((entry) => entry.id === bandResourceId) ?? null
    : null;
  const activeBandTechnicalRider = bandSection === 'riders'
    ? bandTechnicalRiders.find((entry) => entry.id === bandResourceId) ?? null
    : null;
  const songsById = useMemo(() => new Map(bandSongs.map((song) => [song.id, song])), [bandSongs]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandSongs(id).catch((error) => {
      console.error('Failed to load band songs.', error);
      toast.error('Failed to load band library.');
    });
  }, [band, id, refreshBandSongs]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandSongLists(id).catch((error) => {
      console.error('Failed to load band songlists.', error);
    });
  }, [band, id, refreshBandSongLists]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandSetlists(id).catch((error) => {
      console.error('Failed to load band setlists.', error);
    });
  }, [band, id, refreshBandSetlists]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandStageplots(id).catch((error) => {
      console.error('Failed to load band stageplots.', error);
    });
  }, [band, id, refreshBandStageplots]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandTechnicalRiders(id).catch((error) => {
      console.error('Failed to load band technical riders.', error);
    });
  }, [band, id, refreshBandTechnicalRiders]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandTrash(id).catch((error) => {
      console.error('Failed to load band trash.', error);
    });
  }, [band, id, refreshBandTrash]);

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

    const confirmed = await showConfirmToast(`Move "${song.title}" to trash? It will be automatically deleted after 30 days.`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;

    await deleteSong(song.id);
    toast.success('Song moved to trash.');
  };

  const handleMoveSong = async (songId: string, beforeSongId: string | null) => {
    const error = await moveBandSong(band.id, songId, beforeSongId);
    if (error) {
      toast.error(error);
    }
  };

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

  const handleRenameBand = async (name: string) => {
    const error = await renameBand(band.id, name);
    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Band renamed.');
  };

  const handleDeleteBandSongList = async () => {
    if (!activeBandSongList) return;

    const confirmed = await showConfirmToast(`Move songlist "${activeBandSongList.name}" to trash? It will be automatically deleted after 30 days.`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;

    const error = await deleteBandSongList(band.id, activeBandSongList.id);
    if (error) {
      toast.error(error);
      return;
    }

    navigate(`/bands/${band.id}/library`);
  };

  const handleDeleteBandSetlist = async () => {
    if (!activeBandSetlist) return;

    const confirmed = await showConfirmToast(`Move setlist "${activeBandSetlist.name}" to trash? It will be automatically deleted after 30 days.`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;

    const error = await deleteBandSetlist(band.id, activeBandSetlist.id);
    if (error) {
      toast.error(error);
      return;
    }

    navigate(`/bands/${band.id}/library`);
  };

  const handleShareSetlist = async () => {
    if (!activeBandSetlist) return;
    const publicUrl = `${window.location.origin}/public/bands/${band.id}/setlists/${activeBandSetlist.id}`;
    if (!activeBandSetlist.publicShareEnabled) {
      const error = await setBandSetlistPublicShare(band.id, activeBandSetlist.id, true);
      if (error) {
        toast.error(error);
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Public link copied to clipboard!');
    } catch {
      toast.error(`Failed to copy. Share this link: ${publicUrl}`);
    }
  };

  const handleShareStageplot = async () => {
    if (!activeBandStageplot) return;
    const publicUrl = `${window.location.origin}/public/bands/${band.id}/stageplots/${activeBandStageplot.id}`;
    if (!activeBandStageplot.publicShareEnabled) {
      const error = await setBandStageplotPublicShare(band.id, activeBandStageplot.id, true);
      if (error) {
        toast.error(error);
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Public link copied to clipboard!');
    } catch {
      toast.error(`Failed to copy. Share this link: ${publicUrl}`);
    }
  };

  const handleShareTechnicalRider = async () => {
    if (!activeBandTechnicalRider) return;
    const publicUrl = `${window.location.origin}/public/bands/${band.id}/riders/${activeBandTechnicalRider.id}`;
    if (!activeBandTechnicalRider.publicShareEnabled) {
      const error = await setBandTechnicalRiderPublicShare(band.id, activeBandTechnicalRider.id, true);
      if (error) {
        toast.error(error);
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Public link copied to clipboard!');
    } catch {
      toast.error(`Failed to copy. Share this link: ${publicUrl}`);
    }
  };

  if (bandSection === 'songlists') {
    if (!activeBandSongList) {
      return (
        <section className="bands-page">
          <p className="bands-status">Band songlist not found.</p>
          <Link to={`/bands/${band.id}/library`} className="setlist-action-btn setlist-action-btn--secondary">Back to band library</Link>
        </section>
      );
    }

    const songListSongs = activeBandSongList.songIds
      .map((songId) => songsById.get(songId))
      .filter((song): song is Song => Boolean(song));

    return (
      <section className="bands-page bands-page--library">
        <SongList
          songs={songListSongs}
          listName={activeBandSongList.name}
          listIcon={activeBandSongList.icon}
          headerMeta={undefined}
          headerVariant="bands"
          allSongs={bandSongs}
          onAddSong={(songId) => {
            void addSongToBandSongList(band.id, activeBandSongList.id, songId);
          }}
          onDeleteSong={handleDeleteSong}
          onMoveSong={(songId, beforeSongId) => {
            void moveSongInBandSongList(band.id, activeBandSongList.id, songId, beforeSongId);
          }}
          onRenameList={(name) => {
            void renameBandSongList(band.id, activeBandSongList.id, name);
          }}
          onUpdateListAppearance={(appearance) => {
            void updateBandSongListIcon(band.id, activeBandSongList.id, appearance.icon);
          }}
          onDeleteList={() => void handleDeleteBandSongList()}
          deleteListLabel={`Delete songlist ${activeBandSongList.name}`}
          onRemoveSong={(song) => {
            void removeSongFromBandSongList(band.id, activeBandSongList.id, song.id);
          }}
          bandId={band.id}
        />
      </section>
    );
  }

  if (bandSection === 'setlists') {
    if (!activeBandSetlist) {
      return (
        <section className="bands-page">
          <p className="bands-status">Band setlist not found.</p>
          <Link to={`/bands/${band.id}/library`} className="setlist-action-btn setlist-action-btn--secondary">Back to band library</Link>
        </section>
      );
    }

    const setlistSongs = activeBandSetlist.songIds
      .map((songId) => songsById.get(songId))
      .filter((song): song is Song => Boolean(song));

    return (
      <section className="bands-page bands-page--library">
        <SongList
          songs={setlistSongs}
          listName={activeBandSetlist.name}
          listIcon={activeBandSetlist.icon}
          headerVariant="bands"
          headerActions={(
            <button
              type="button"
              className={`setlist-action-btn setlist-action-btn--secondary${activeBandSetlist.publicShareEnabled ? ' setlist-action-btn--active' : ''}`}
              onClick={() => void handleShareSetlist()}
              title={activeBandSetlist.publicShareEnabled ? 'Copy public link' : 'Create & copy public link'}
            >
              <Link2 size={14} />
            </button>
          )}
          allSongs={bandSongs}
          onAddSong={(songId) => {
            void addSongToBandSetlist(band.id, activeBandSetlist.id, songId);
          }}
          onDeleteSong={handleDeleteSong}
          onMoveSong={(songId, beforeSongId) => {
            void moveSongInBandSetlist(band.id, activeBandSetlist.id, songId, beforeSongId);
          }}
          onRenameList={(name) => {
            void renameBandSetlist(band.id, activeBandSetlist.id, name);
          }}
          onDeleteList={() => void handleDeleteBandSetlist()}
          deleteListLabel={`Delete setlist ${activeBandSetlist.name}`}
          onUpdateListAppearance={(appearance) => {
            void updateBandSetlistIcon(band.id, activeBandSetlist.id, appearance.icon);
          }}
          onRemoveSong={(song) => {
            void removeSongFromBandSetlist(band.id, activeBandSetlist.id, song.id);
          }}
          bandId={band.id}
        />
      </section>
    );
  }

  if (bandSection === 'stageplots') {
    if (!activeBandStageplot) {
      return (
        <section className="bands-page">
          <p className="bands-status">Band stageplot not found.</p>
          <Link to={`/bands/${band.id}/library`} className="setlist-action-btn setlist-action-btn--secondary">Back to band library</Link>
        </section>
      );
    }

    return (
      <StageplotEditor
        stageplot={activeBandStageplot}
        canEdit={canEditBand}
        currentUser={{
          id: user?.id ?? null,
          name: user?.fullName?.trim() || user?.username?.trim() || user?.email || 'Unknown user',
          avatar: user?.avatar,
        }}
        onRename={(name) => {
          void renameBandStageplot(band.id, activeBandStageplot.id, name);
        }}
        onUpdateIcon={(icon) => {
          void updateBandStageplotIcon(band.id, activeBandStageplot.id, icon);
        }}
        onDelete={async () => {
          const error = await deleteBandStageplot(band.id, activeBandStageplot.id);
          if (error) {
            toast.error(error);
            return;
          }
          navigate(`/bands/${band.id}/library`);
        }}
        onSaveContent={async (items, drawingLayers) => {
          const error = await updateBandStageplotContent({
            bandId: band.id,
            stageplotId: activeBandStageplot.id,
            items,
            drawingLayers,
          });
          if (error) {
            toast.error(error);
          }
        }}
        onCopyPublicLink={handleShareStageplot}
      />
    );
  }

  if (bandSection === 'riders') {
    if (!activeBandTechnicalRider) {
      return (
        <section className="bands-page">
          <p className="bands-status">Band technical rider not found.</p>
          <Link to={`/bands/${band.id}/library`} className="setlist-action-btn setlist-action-btn--secondary">Back to band library</Link>
        </section>
      );
    }

    return (
      <TechnicalRiderEditor
        rider={activeBandTechnicalRider}
        canEdit={canEditBand}
        onRename={async (name) => {
          const error = await renameBandTechnicalRider(band.id, activeBandTechnicalRider.id, name);
          if (error) toast.error(error);
        }}
        onDelete={canEditBand ? async () => {
          const error = await deleteBandTechnicalRider(band.id, activeBandTechnicalRider.id);
          if (error) {
            toast.error(error);
            return;
          }
          navigate(`/bands/${band.id}/library`);
        } : undefined}
        onSaveContent={async (content) => {
          const error = await updateBandTechnicalRiderContent({
            bandId: band.id,
            riderId: activeBandTechnicalRider.id,
            lines: content.lines,
            preferredEquipment: content.preferredEquipment,
            inventoryEquipment: content.inventoryEquipment,
          });
          if (error) toast.error(error);
          else toast.success('Technical rider updated.');
        }}
        onCopyPublicLink={handleShareTechnicalRider}
      />
    );
  }

  if (bandSection === 'trash') {
    const trashItems = bandTrash.map((entry) => {
      if (entry.itemType === 'song') {
        return {
          trashId: entry.trashId,
          itemType: 'song' as const,
          name: entry.song.title,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      if (entry.itemType === 'songlist') {
        return {
          trashId: entry.trashId,
          itemType: 'songlist' as const,
          name: entry.songList.name,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      if (entry.itemType === 'stageplot') {
        return {
          trashId: entry.trashId,
          itemType: 'stageplot' as const,
          name: entry.stageplot.name,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      if (entry.itemType === 'technicalRider') {
        return {
          trashId: entry.trashId,
          itemType: 'technicalRider' as const,
          name: entry.technicalRider.name,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      return {
        itemType: 'setlist' as const,
        trashId: entry.trashId,
        name: entry.setlist.name,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
      };
    });

    return (
      <TrashView
        title={`${band.name} Trash`}
        emptyMessage="Trash is empty."
        items={trashItems}
        onRestore={(trashId) => restoreBandTrashItem(band.id, trashId)}
        onDeletePermanently={(trashId) => deleteBandTrashItemPermanently(band.id, trashId)}
        onEmptyTrash={isOwner ? async () => {
          let failedCount = 0;

          for (const item of trashItems) {
            const error = await deleteBandTrashItemPermanently(band.id, item.trashId);
            if (error) {
              failedCount += 1;
            }
          }

          if (failedCount === 0) return null;
          if (failedCount === trashItems.length) return 'Failed to empty trash.';
          return `Deleted ${trashItems.length - failedCount} item${trashItems.length - failedCount === 1 ? '' : 's'}, but ${failedCount} item${failedCount === 1 ? '' : 's'} could not be deleted.`;
        } : undefined}
      />
    );
  }

  return (
    <section className="bands-page bands-page--library">
      <SongList
        songs={bandSongs}
        listName={band.name}
        listIcon={band.icon}
        headerMeta={`${band.memberIds.length} member${band.memberIds.length === 1 ? '' : 's'} in this band.`}
        headerVariant="bands"
        onRenameList={canEditBand ? (name) => void handleRenameBand(name) : undefined}
        headerActions={(
          <button
            type="button"
            className="setlist-action-btn setlist-action-btn--secondary"
            onClick={() => navigate(`/bands/${band.id}/members`)}
            title="Manage band members"
          >
            <Users size={14} />
          </button>
        )}
        allSongs={ownedSongs}
        onDeleteSong={handleDeleteSong}
        onRemoveSong={handleRemoveSong}
        onAddSong={handleAddSong}
        onMoveSong={handleMoveSong}
        onUpdateListAppearance={(appearance) => {
          void updateBandLibraryIcon(band.id, appearance.icon);
        }}
        bandId={band.id}
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