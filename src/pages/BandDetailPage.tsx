import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { Link2, Settings, UserPlus, X } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import SongList from '../components/SongList';
import SetlistsView from '../components/SetlistsView';
import StageplotEditor from '../components/StageplotEditor';
import TechnicalRiderEditor from '../components/TechnicalRiderEditor';
import TrashView from '../components/TrashView';
import UserAvatar from '../components/UserAvatar';
import type { Song } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';
import { ICON_OPTIONS } from '../lib/iconOptions';
import { createBandInviteLinkOnServer } from '../lib/bandsApi';

const BAND_COLOR_OPTIONS = [
  '#c33232', '#d35400', '#a66e00', '#2e7d32',
  '#00897b', '#0288d1', '#1565c0', '#5e35b1',
  '#ad1457', '#6d4c41', '#455a64', '#37474f',
] as const;

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

export default function BandDetailPage() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
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
    removeMember,
    leaveBand,
    deleteBand,
    addSongToBandLibrary,
    removeSongFromBandLibrary,
    moveBandSong,
    renameBandSongList,
    updateBandSongListIcon,
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
    updateSongNoteInBandSetlist,
    renameBandStageplot,
    updateBandStageplotIcon,
    setBandStageplotPublicShare,
    updateBandStageplotContent,
    deleteBandStageplot,
    renameBandTechnicalRider,
    updateBandTechnicalRiderIcon,
    setBandTechnicalRiderPublicShare,
    updateBandTechnicalRiderContent,
    deleteBandTechnicalRider,
    restoreBandTrashItem,
    deleteBandTrashItemPermanently,
    updateBandLibraryAppearance,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;
  const bandSongs = id ? (bandSongsByBandId[id] ?? []) : [];
  const bandSongLists = id ? (bandSongListsByBandId[id] ?? []) : [];
  const bandSetlists = id ? (bandSetlistsByBandId[id] ?? []) : [];
  const bandStageplots = id ? (bandStageplotsByBandId[id] ?? []) : [];
  const bandTechnicalRiders = id ? (bandTechnicalRidersByBandId[id] ?? []) : [];
  const bandTrash = id ? (bandTrashByBandId[id] ?? []) : [];
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'members'>('appearance');
  const [inviteUsername, setInviteUsername] = useState('');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);
  const [busyInviteLink, setBusyInviteLink] = useState(false);
  const [busyDeleteBand, setBusyDeleteBand] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [customizeName, setCustomizeName] = useState('');
  const [customizeIcon, setCustomizeIcon] = useState('🎵');
  const [customizeColor, setCustomizeColor] = useState('#c33232');
  const [useAutoColor, setUseAutoColor] = useState(true);
  const [busyAppearance, setBusyAppearance] = useState(false);

  const allBandsSongs = useMemo(() => {
    return Object.entries(bandSongsByBandId)
      .filter(([bandId]) => bandId !== id)
      .flatMap(([, bandSongList]) => bandSongList);
  }, [bandSongsByBandId, id]);

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
    if (!band) return;
    setCustomizeName(band.name);
    setCustomizeIcon(band.icon ?? '🎵');
    setCustomizeColor(band.color ?? '#c33232');
    setUseAutoColor(!band.color);
  }, [band]);

  useEffect(() => {
    if (!showSettingsModal) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSettingsModal(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showSettingsModal]);

  if (loading && !band) {
    return <p className="bands-status">Loading band…</p>;
  }

  if (!band || !id) {
    return (
      <section className="bands-page">
        <p className="bands-status">Band not found.</p>
        <Link to="/profile" className="setlist-action-btn setlist-action-btn--secondary">Back to bands</Link>
      </section>
    );
  }

  const isOwner = band.ownerId === user?.id;
  const canEditBand = isOwner || band.memberRoles[user?.id ?? ''] === 'editor';

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyInvite(true);
    const error = await inviteMember(band.id, inviteUsername, 'editor');
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
    navigate('/profile');
  };

  const handleCreateInviteLink = async () => {
    if (!user?.id || !user.email) {
      toast.error('You need to be signed in to create invite links.');
      return;
    }

    setBusyInviteLink(true);
    try {
      const result = await createBandInviteLinkOnServer({
        userId: user.id,
        userEmail: user.email,
        bandId: band.id,
        role: 'editor',
      });

      setLastInviteLink(result.inviteUrl);
      try {
        await navigator.clipboard.writeText(result.inviteUrl);
        toast.success('Invite link copied to clipboard.');
      } catch {
        toast.success('Invite link created. Copy it from the field below.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create invite link.';
      toast.error(message);
    } finally {
      setBusyInviteLink(false);
    }
  };

  const handleSaveAppearance = async () => {
    if (!canEditBand) return;

    const trimmedName = customizeName.trim();
    if (!trimmedName) {
      toast.error('Band name is required.');
      return;
    }

    const normalizedIcon = normalizeEmojiIcon(customizeIcon);
    const nextColor = useAutoColor ? undefined : customizeColor;

    setBusyAppearance(true);

    if (trimmedName !== band.name) {
      const renameError = await renameBand(band.id, trimmedName);
      if (renameError) {
        setBusyAppearance(false);
        toast.error(renameError);
        return;
      }
    }

    const appearanceChanged = band.icon !== normalizedIcon || band.color !== nextColor;
    if (appearanceChanged) {
      const appearanceError = await updateBandLibraryAppearance(band.id, {
        icon: normalizedIcon,
        color: nextColor,
      });
      if (appearanceError) {
        setBusyAppearance(false);
        toast.error(appearanceError);
        return;
      }
    }

    setBusyAppearance(false);
    toast.success('Appearance saved.');
  };

  const handleAddSong = async (songId: string) => {
    const selectedSong = allBandsSongs.find((song) => song.id === songId);
    if (!selectedSong) {
      toast.error('Select a song to add.');
      return;
    }

    const error = await addSongToBandLibrary(band.id, selectedSong);

    if (error) {
      toast.error(error);
      return;
    }
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
    if (!canEditBand) {
      toast.error('You do not have permission to edit this band library.');
      return;
    }

    const confirmed = await showConfirmToast(`Remove "${song.title}" from this band library? It will be moved to band trash and automatically deleted after 30 days.`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;

    const error = await removeSongFromBandLibrary(band.id, song.id);
    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Song moved to band trash.');
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
    navigate('/profile');
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

    const confirmed = await showConfirmToast(
      `Move songlist "${activeBandSongList.name}" to trash? It will be automatically deleted after 30 days.`,
      { confirmLabel: 'Move to trash' }
    );
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

    const confirmed = await showConfirmToast(
      `Move setlist "${activeBandSetlist.name}" to trash? It will be automatically deleted after 30 days.`,
      { confirmLabel: 'Move to trash' }
    );
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
          pickerSourceNote="Showing songs from this band's library."
          onAddSong={async (songId) => {
            const error = await addSongToBandSongList(band.id, activeBandSongList.id, songId);
            if (error) {
              toast.error(error);
            }
          }}
          onDeleteSong={handleDeleteSong}
          onMoveSong={async (songId, beforeSongId) => {
            const error = await moveSongInBandSongList(band.id, activeBandSongList.id, songId, beforeSongId);
            if (error) {
              toast.error(error);
            }
          }}
          onRenameList={canEditBand ? async (name) => {
            const error = await renameBandSongList(band.id, activeBandSongList.id, name);
            if (error) {
              toast.error(error);
            }
          } : undefined}
          onUpdateListAppearance={canEditBand ? async (appearance) => {
            const error = await updateBandSongListIcon(band.id, activeBandSongList.id, appearance.icon);
            if (error) {
              toast.error(error);
            }
          } : undefined}
          onDeleteList={canEditBand ? () => void handleDeleteBandSongList() : undefined}
          deleteListLabel={`Delete songlist ${activeBandSongList.name}`}
          onRemoveSong={canEditBand ? async (song) => {
            const error = await removeSongFromBandSongList(band.id, activeBandSongList.id, song.id);
            if (error) {
              toast.error(error);
            }
          } : undefined}
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
        <SetlistsView
          setlistId={activeBandSetlist.id}
          setlistName={activeBandSetlist.name}
          songs={setlistSongs}
          songNotes={activeBandSetlist.songNotes}
          allSongs={bandSongs}
          availableSongLists={bandSongLists}
          setlistIconOverride={activeBandSetlist.icon}
          canDeleteOverride={canEditBand}
          concertRoute={`/bands/${band.id}/setlists/${activeBandSetlist.id}/concert`}
          onRenameOverride={canEditBand ? async (name) => {
            const error = await renameBandSetlist(band.id, activeBandSetlist.id, name);
            if (error) {
              toast.error(error);
            }
          } : undefined}
          onDeleteOverride={canEditBand ? () => void handleDeleteBandSetlist() : undefined}
          onUpdateIconOverride={canEditBand ? async (icon) => {
            const error = await updateBandSetlistIcon(band.id, activeBandSetlist.id, icon);
            if (error) {
              toast.error(error);
            }
          } : undefined}
          onAddSong={async (songId) => {
            const error = await addSongToBandSetlist(band.id, activeBandSetlist.id, songId);
            if (error) {
              toast.error(error);
            }
          }}
          onMoveSong={async (songId, beforeSongId) => {
            const error = await moveSongInBandSetlist(band.id, activeBandSetlist.id, songId, beforeSongId);
            if (error) {
              toast.error(error);
            }
          }}
          onUpdateSongNote={async (songId, note) => {
            if (!canEditBand) return;
            const error = await updateSongNoteInBandSetlist(band.id, activeBandSetlist.id, songId, note);
            if (error) {
              toast.error(error);
            }
          }}
          onRemoveSong={async (songId) => {
            if (!canEditBand) return;
            const error = await removeSongFromBandSetlist(band.id, activeBandSetlist.id, songId);
            if (error) {
              toast.error(error);
            }
          }}
          extraActions={(
            <button
              type="button"
              className={`setlist-action-btn setlist-action-btn--secondary${activeBandSetlist.publicShareEnabled ? ' setlist-action-btn--active' : ''}`}
              onClick={() => void handleShareSetlist()}
              title={activeBandSetlist.publicShareEnabled ? 'Copy public link' : 'Create & copy public link'}
            >
              <Link2 size={14} />
            </button>
          )}
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
      <section className="bands-page bands-page--library">
        <StageplotEditor
          stageplot={activeBandStageplot}
          canEdit={canEditBand}
          currentUser={{
            id: user?.id ?? null,
            name: user?.fullName?.trim() || user?.username?.trim() || user?.email || 'Unknown user',
            avatar: user?.avatar,
          }}
          onRename={async (name) => {
            const error = await renameBandStageplot(band.id, activeBandStageplot.id, name);
            if (error) {
              toast.error(error);
            }
          }}
          onUpdateIcon={async (icon) => {
            const error = await updateBandStageplotIcon(band.id, activeBandStageplot.id, icon);
            if (error) {
              toast.error(error);
            }
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
              throw new Error(error);
            }
          }}
          onCopyPublicLink={handleShareStageplot}
        />
      </section>
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
        onUpdateIcon={async (icon) => {
          const error = await updateBandTechnicalRiderIcon(band.id, activeBandTechnicalRider.id, icon);
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
          if (error) {
            toast.error(error);
            throw new Error(error);
          }
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
        onRestore={canEditBand ? (trashId) => restoreBandTrashItem(band.id, trashId) : undefined}
        onDeletePermanently={canEditBand ? (trashId) => deleteBandTrashItemPermanently(band.id, trashId) : undefined}
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
        listEntityLabel="band"
        listIcon={band.icon}
        headerMeta={`${band.memberIds.length} member${band.memberIds.length === 1 ? '' : 's'} in this band.`}
        headerVariant="bands"
        onRenameList={canEditBand ? (name) => void handleRenameBand(name) : undefined}
        headerActions={(
          <button
            type="button"
            className="setlist-action-btn setlist-action-btn--secondary"
            onClick={() => {
              setSettingsTab(canEditBand ? 'appearance' : 'members');
              setShowSettingsModal(true);
            }}
            title="Band settings"
          >
            <Settings size={14} />
          </button>
        )}
        allSongs={allBandsSongs}
        pickerSourceNote="Showing songs from all bands' libraries. Selected songs will be copied to this band's library."
        onDeleteSong={handleDeleteSong}
        onRemoveSong={handleRemoveSong}
        onAddSong={handleAddSong}
        onMoveSong={handleMoveSong}
        bandId={band.id}
      />

      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Band Settings</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowSettingsModal(false)}
                aria-label="Close settings"
              >
                <X size={20} />
              </button>
            </div>

            <div className="band-settings-tabs">
              {canEditBand && (
                <button
                  type="button"
                  className={`band-settings-tab${settingsTab === 'appearance' ? ' active' : ''}`}
                  onClick={() => setSettingsTab('appearance')}
                >
                  Appearance
                </button>
              )}
              <button
                type="button"
                className={`band-settings-tab${settingsTab === 'members' ? ' active' : ''}`}
                onClick={() => setSettingsTab('members')}
              >
                Members
              </button>
            </div>

            <div className="modal-content">
              {settingsTab === 'appearance' && canEditBand && (
                <>
                  <section className="bands-panel">
                    <div className="share-menu-field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={customizeName}
                        onChange={(event) => setCustomizeName(event.target.value)}
                        placeholder="Band name"
                        maxLength={80}
                      />
                    </div>

                    <div className="list-appearance-group" style={{ marginTop: '0.75rem' }}>
                      <span className="list-appearance-label">Icon</span>
                      <div className="emoji-choice-grid" role="listbox" aria-label="Band icon options">
                        {ICON_OPTIONS.map((emoji) => {
                          const selected = customizeIcon === emoji;
                          return (
                            <button
                              key={emoji}
                              type="button"
                              className={`emoji-choice-btn${selected ? ' active' : ''}`}
                              onClick={() => setCustomizeIcon(emoji)}
                              aria-label={`Choose icon ${emoji}`}
                              aria-pressed={selected}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="list-appearance-group" style={{ marginTop: '0.75rem' }}>
                      <span className="list-appearance-label">Color</span>
                      <div className="color-swatch-grid" role="listbox" aria-label="Band color options">
                        {BAND_COLOR_OPTIONS.map((colorHex) => {
                          const selected = !useAutoColor && customizeColor.toLowerCase() === colorHex.toLowerCase();
                          return (
                            <button
                              key={colorHex}
                              type="button"
                              className={`color-swatch-btn${selected ? ' active' : ''}`}
                              style={{ backgroundColor: colorHex }}
                              onClick={() => {
                                setCustomizeColor(colorHex);
                                setUseAutoColor(false);
                              }}
                              aria-label={`Choose color ${colorHex}`}
                              aria-pressed={selected}
                            />
                          );
                        })}
                      </div>
                      <div className="share-menu-field" style={{ marginTop: '0.5rem' }}>
                        <span>Custom color</span>
                        <input
                          type="color"
                          value={customizeColor}
                          onChange={(event) => {
                            setCustomizeColor(event.target.value);
                            setUseAutoColor(false);
                          }}
                          aria-label="Custom band color"
                        />
                      </div>
                      <button
                        type="button"
                        className={`setlist-action-btn setlist-action-btn--secondary${useAutoColor ? ' setlist-action-btn--active' : ''}`}
                        onClick={() => setUseAutoColor(true)}
                      >
                        Use auto color
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
                      <button
                        type="button"
                        className="setlist-action-btn"
                        onClick={() => void handleSaveAppearance()}
                        disabled={busyAppearance}
                      >
                        {busyAppearance ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </section>
                </>
              )}

              {settingsTab === 'members' && (
                <>
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
                          <li key={memberId} className="bands-member-row">
                            <UserAvatar avatar={avatar} label={username ?? email} size="sm" />
                            <div className="bands-member-info">
                              <span className="bands-member-name">{username ?? email}</span>
                              {username && <span className="bands-member-email">{email}</span>}
                            </div>
                            <span className="bands-role-badge">{role}</span>
                            <div className="bands-member-actions">
                              {canRemove && (
                                <button
                                  type="button"
                                  className="setlist-action-btn setlist-action-btn--secondary"
                                  disabled={busyMemberId === memberId}
                                  onClick={() => void handleRemoveMember(memberId)}
                                >
                                  {busyMemberId === memberId ? 'Working…' : 'Remove'}
                                </button>
                              )}
                              {!isOwner && isCurrentUser && (
                                <button
                                  type="button"
                                  className="setlist-action-btn setlist-action-btn--secondary"
                                  disabled={busyMemberId === memberId}
                                  onClick={() => void handleLeaveBand()}
                                >
                                  {busyMemberId === memberId ? 'Working…' : 'Leave band'}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {canEditBand && (
                    <section className="bands-panel">
                      <h3>Add member</h3>
                      <form className="bands-invite-form" onSubmit={handleInvite}>
                        <label className="share-menu-field">
                          <span>Username</span>
                          <input
                            type="text"
                            value={inviteUsername}
                            onChange={(event) => setInviteUsername(event.target.value)}
                            placeholder="bandmate"
                          />
                        </label>
                        <button type="submit" className="setlist-action-btn" disabled={busyInvite}>
                          <UserPlus size={15} /> {busyInvite ? 'Sending…' : 'Send invite'}
                        </button>
                        <button
                          type="button"
                          className="setlist-action-btn setlist-action-btn--secondary"
                          disabled={busyInviteLink}
                          onClick={() => { void handleCreateInviteLink(); }}
                        >
                          {busyInviteLink ? 'Creating link…' : 'Create invite link'}
                        </button>
                      </form>
                      {lastInviteLink && (
                        <label className="share-menu-field" style={{ marginTop: '0.75rem' }}>
                          <span>Latest invite link</span>
                          <input type="text" value={lastInviteLink} readOnly />
                        </label>
                      )}
                    </section>
                  )}

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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}