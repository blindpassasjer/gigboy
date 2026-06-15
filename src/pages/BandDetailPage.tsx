import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { FolderInput, Link2, Plus, Search, Settings, Upload, X } from 'lucide-react';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { useSongs } from '../context/SongsContext';
import SongList from '../components/SongList';
import SetlistsView from '../components/SetlistsView';
import BandTechRiderPanel from '../components/BandTechRiderPanel';
import TrashView from '../components/TrashView';
import PressKitView from '../components/PressKitView';
import type { Song } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';
import { buildBandPublicShareUrl } from '../utils/publicShare';
import { parseImportedSongFile, SONG_TEXT_IMPORT_ACCEPT } from '../utils/songImport';

export default function BandDetailPage() {
  const { id } = useParams();
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addSong } = useSongs();
  const {
    bands,
    bandSongsByBandId,
    bandSongListsByBandId,
    bandSetlistsByBandId,
    bandInputListsByBandId,
    bandTrashByBandId,
    loading,
    renameBand,
    refreshBandSongs,
    refreshBandSongLists,
    refreshBandSetlists,
    refreshBandInputLists,
    refreshBandTrash,
    addSongToBandLibrary,
    removeSongFromBandLibrary,
    renameBandSongList,
    updateBandSongListIcon,
    deleteBandSongList,
    addSongToBandSongList,
    removeSongFromBandSongList,
    renameBandSetlist,
    updateBandSetlistIcon,
    setBandSetlistPublicShare,
    deleteBandSetlist,
    addSongToBandSetlist,
    moveSongInBandSetlist,
    removeSongFromBandSetlist,
    updateSongNoteInBandSetlist,
    restoreBandTrashItem,
    deleteBandTrashItemPermanently,
    updateBandLibraryIcon,
    bandPressKitsByBandId,
    refreshBandPressKits,
    renameBandPressKit,
    updateBandPressKitIcon,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;
  const bandSongs = useMemo(() => (id ? (bandSongsByBandId[id] ?? []) : []), [bandSongsByBandId, id]);
  const bandSongLists = id ? (bandSongListsByBandId[id] ?? []) : [];
  const bandSetlists = id ? (bandSetlistsByBandId[id] ?? []) : [];
  const bandInputLists = id ? (bandInputListsByBandId[id] ?? []) : [];
  const bandTrash = id ? (bandTrashByBandId[id] ?? []) : [];
  const bandPressKits = id ? (bandPressKitsByBandId[id] ?? []) : [];

  const allBandsSongs = useMemo(() => {
    return Object.entries(bandSongsByBandId)
      .filter(([bandId]) => bandId !== id)
      .flatMap(([, bandSongList]) => bandSongList);
  }, [bandSongsByBandId, id]);

  const routeSegments = pathname.split('/').filter(Boolean);
  const routeBandId = routeSegments[0] === 'bands' ? routeSegments[1] : null;
  const bandSection = routeBandId === id ? (routeSegments[2] ?? 'library') : 'library';
  const bandResourceId = routeBandId === id ? (routeSegments[3] ?? null) : null;
  const autoRenameState = (() => {
    if (!state || typeof state !== 'object') return null;
    const autoRename = (state as {
      autoRename?: {
        kind?: unknown;
        resourceId?: unknown;
        token?: unknown;
      };
    }).autoRename;
    if (!autoRename || typeof autoRename !== 'object') return null;
    const kind = autoRename.kind;
    const resourceId = autoRename.resourceId;
    const token = autoRename.token;
    if (kind !== 'songlist' && kind !== 'setlist' && kind !== 'rider') return null;
    if (typeof resourceId !== 'string' || !resourceId.trim()) return null;
    if (typeof token !== 'number' && typeof token !== 'string') return null;
    return { kind, resourceId, token };
  })();

  const activeBandSongList = bandSection === 'songlists'
    ? bandSongLists.find((entry) => entry.id === bandResourceId) ?? null
    : null;
  const activeBandSetlist = bandSection === 'setlists'
    ? bandSetlists.find((entry) => entry.id === bandResourceId) ?? null
    : null;
  const activeBandPressKit = bandSection === 'press-kit'
    ? bandPressKits.find((entry) => entry.id === bandResourceId) ?? null
    : null;
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isImportingSongs, setIsImportingSongs] = useState(false);
  const [showBandPicker, setShowBandPicker] = useState(false);
  const [bandPickerQuery, setBandPickerQuery] = useState('');
  const songsById = useMemo(() => new Map(bandSongs.map((song) => [song.id, song])), [bandSongs]);
  const bandSongIds = useMemo(() => new Set(bandSongs.map((s) => s.id)), [bandSongs]);
  const availableForImport = useMemo(() => {
    const base = allBandsSongs
      .filter((s) => !bandSongIds.has(s.id))
      .sort((a, b) => a.title.localeCompare(b.title));
    const q = bandPickerQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? '').toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [allBandsSongs, bandSongIds, bandPickerQuery]);

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
    void refreshBandInputLists(id).catch((error: unknown) => {
      console.error('Failed to load band technical riders.', error);
    });
  }, [band, id, refreshBandInputLists]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandTrash(id).catch((error) => {
      console.error('Failed to load band trash.', error);
    });
  }, [band, id, refreshBandTrash]);

  useEffect(() => {
    if (!id || !band) return;
    void refreshBandPressKits(id).catch((error) => {
      console.error('Failed to load band press kits.', error);
    });
  }, [band, id, refreshBandPressKits]);

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

  const handleImportSongs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!canEditBand) {
      toast.error('You do not have permission to edit this band library.');
      return;
    }

    setIsImportingSongs(true);
    let importedCount = 0;
    const failedFiles: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const imported = await parseImportedSongFile(file);
        const now = new Date().toISOString();
        const song: Song = {
          id: crypto.randomUUID(),
          title: imported.title,
          artist: imported.artist,
          author: imported.author,
          language: imported.language ?? 'en',
          secondaryLanguages: imported.secondaryLanguages,
          tags: imported.tags,
          key: imported.key,
          capo: imported.capo,
          tempo: imported.tempo,
          timeSignature: imported.timeSignature,
          chordpro: imported.chordpro,
          createdAt: now,
          updatedAt: now,
        };

        const saveError = await addSong(song);
        if (saveError) {
          throw new Error(saveError);
        }

        const linkError = await addSongToBandLibrary(band.id, song);
        if (linkError) {
          throw new Error(linkError);
        }

        importedCount += 1;
      } catch {
        failedFiles.push(file.name);
      }
    }

    if (importedCount > 0 && failedFiles.length === 0) {
      toast.success(`Imported ${importedCount} song${importedCount === 1 ? '' : 's'} to ${band.name}.`);
    } else if (importedCount > 0) {
      toast.success(`Imported ${importedCount} song${importedCount === 1 ? '' : 's'}. ${failedFiles.length} failed.`);
    } else {
      toast.error('No songs were imported.');
    }

    if (failedFiles.length > 0) {
      const examples = failedFiles.slice(0, 2).join(', ');
      toast.error(`Failed: ${examples}${failedFiles.length > 2 ? '…' : ''}`);
    }

    setIsImportingSongs(false);
    if (importInputRef.current) {
      importInputRef.current.value = '';
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
    const publicUrl = buildBandPublicShareUrl(
      window.location.origin,
      band.id,
      band.name,
      'setlists',
      activeBandSetlist.id
    );
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
          autoStartRenameToken={
            autoRenameState?.kind === 'songlist' && autoRenameState.resourceId === activeBandSongList.id
              ? autoRenameState.token
              : null
          }
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
          bandId={band.id}
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
          onMoveSong={async (songId, beforeSongId) => {
            if (!canEditBand) return;
            const error = await moveSongInBandSetlist(band.id, activeBandSetlist.id, songId, beforeSongId);
            if (error) {
              toast.error(error);
            }
          }}
          onAddSong={async (songId) => {
            const error = await addSongToBandSetlist(band.id, activeBandSetlist.id, songId);
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
              className="setlist-action-btn setlist-action-btn--accent"
              onClick={() => void handleShareSetlist()}
              title={activeBandSetlist.publicShareEnabled ? 'Copy public link' : 'Create & copy public link'}
            >
              <Link2 size={14} />
            </button>
          )}
          autoStartRenameToken={
            autoRenameState?.kind === 'setlist' && autoRenameState.resourceId === activeBandSetlist.id
              ? autoRenameState.token
              : null
          }
        />
      </section>
    );
  }

  if (bandSection === 'riders') {
    return (
      <BandTechRiderPanel
        bandId={band.id}
        bandName={band.name}
        riders={bandInputLists}
        canEdit={canEditBand}
        userId={user?.id ?? null}
        userEmail={user?.email ?? null}
        initialRiderId={bandResourceId}
        autoStartRenameToken={
          autoRenameState?.kind === 'rider' && autoRenameState.resourceId === bandResourceId
            ? autoRenameState.token
            : null
        }
      />
    );
  }

  if (bandSection === 'press-kit' && activeBandPressKit) {
    return (
      <PressKitView
        bandId={band.id}
        bandName={band.name}
        kit={activeBandPressKit}
        canEdit={canEditBand}
        userId={user?.id ?? null}
        userEmail={user?.email ?? null}
        onDelete={() => { navigate(`/bands/${band.id}/press-kit`); }}
        onRename={canEditBand ? async (name) => {
          const error = await renameBandPressKit(band.id, activeBandPressKit.id, name);
          if (error) toast.error(error);
        } : undefined}
        onUpdateIcon={canEditBand ? async (icon) => {
          const error = await updateBandPressKitIcon(band.id, activeBandPressKit.id, icon);
          if (error) toast.error(error);
        } : undefined}
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

      if (entry.itemType === 'technicalRider') {
        return {
          trashId: entry.trashId,
          itemType: 'technicalRider' as const,
          name: entry.inputList.name,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      if (entry.itemType === 'pressKitImage') {
        return {
          itemType: 'pressKitImage' as const,
          trashId: entry.trashId,
          name: entry.image.title,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      if (entry.itemType === 'bandLogo') {
        return {
          itemType: 'bandLogo' as const,
          trashId: entry.trashId,
          name: entry.image.title,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      if (entry.itemType === 'pressKit') {
        return {
          itemType: 'pressKit' as const,
          trashId: entry.trashId,
          name: entry.pressKit.name,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      if (entry.itemType === 'setlist') {
        return {
          itemType: 'setlist' as const,
          trashId: entry.trashId,
          name: entry.setlist.name,
          deletedAt: entry.deletedAt,
          purgeAt: entry.purgeAt,
        };
      }

      return null;
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    return (
      <TrashView
        title={`${band.name} Trash`}
        emptyMessage="Trash is empty."
        items={trashItems}
        onRestore={canEditBand ? (trashId) => restoreBandTrashItem(band.id, trashId) : undefined}
        onDeletePermanently={isOwner ? (trashId) => deleteBandTrashItemPermanently(band.id, trashId) : undefined}
        onEmptyTrash={isOwner ? async () => {
          const results = await Promise.allSettled(
            trashItems.map((item) => deleteBandTrashItemPermanently(band.id, item.trashId))
          );

          const failedCount = results.reduce((count, result) => {
            if (result.status === 'rejected') return count + 1;
            if (result.value) return count + 1;
            return count;
          }, 0);

          if (failedCount === 0) return null;
          if (failedCount === trashItems.length) return 'Failed to empty trash.';
          return `Deleted ${trashItems.length - failedCount} item${trashItems.length - failedCount === 1 ? '' : 's'}, but ${failedCount} item${failedCount === 1 ? '' : 's'} could not be deleted.`;
        } : undefined}
      />
    );
  }

  const closeBandPicker = () => {
    setShowBandPicker(false);
    setBandPickerQuery('');
  };

  return (
    <section className="bands-page bands-page--library">
      <input
        ref={importInputRef}
        type="file"
        accept={SONG_TEXT_IMPORT_ACCEPT}
        multiple
        onChange={(event) => {
          void handleImportSongs(event.target.files);
        }}
        style={{ display: 'none' }}
      />
      <SongList
        songs={bandSongs}
        listName={band.name}
        listEntityLabel="band"
        listIcon={band.icon}
        headerMeta={`${band.memberIds.length} member${band.memberIds.length === 1 ? '' : 's'} in this band.`}
        headerVariant="bands"
        onRenameList={canEditBand ? (name) => void handleRenameBand(name) : undefined}
        onUpdateListAppearance={canEditBand ? async ({ icon }) => {
          const error = await updateBandLibraryIcon(band.id, icon);
          if (error) toast.error(error);
        } : undefined}
        headerActions={(
          <>
            {canEditBand && allBandsSongs.length > 0 && (
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={() => setShowBandPicker(true)}
                title="Add song from another band library"
                aria-label="Add song from another band library"
              >
                <FolderInput size={14} />
              </button>
            )}
            {canEditBand && (
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={() => importInputRef.current?.click()}
                title={isImportingSongs ? 'Importing songs…' : 'Import local song files'}
                aria-label={isImportingSongs ? 'Importing songs' : 'Import local song files'}
                disabled={isImportingSongs}
              >
                <Upload size={14} />
              </button>
            )}
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => navigate(isOwner ? `/bands/${band.id}/settings` : `/bands/${band.id}/members`)}
              title="Band settings"
            >
              <Settings size={14} />
            </button>
          </>
        )}
        onDeleteSong={handleDeleteSong}
        bandId={band.id}
      />

      {showBandPicker && (
        <div className="song-picker-overlay" role="dialog" aria-modal="true" aria-label="Add song from another band library">
          <div className="song-picker-panel">
            <div className="song-picker-header">
              <h2>Add song from another band</h2>
              <button className="song-picker-close" onClick={closeBandPicker} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <p className="song-picker-source-note">Showing songs from your other band libraries.</p>
            <div className="song-picker-search-wrap">
              <Search size={15} className="song-picker-search-icon" />
              <input
                type="text"
                className="song-picker-search"
                value={bandPickerQuery}
                onChange={(e) => setBandPickerQuery(e.target.value)}
                placeholder="Search by title, artist, or tag"
                autoFocus
              />
            </div>
            <div className="song-picker-results" role="list">
              {availableForImport.length === 0 ? (
                <p className="song-picker-empty">No songs available to add.</p>
              ) : (
                availableForImport.map((song) => (
                  <div key={song.id} className="song-picker-item" role="listitem">
                    <div className="song-picker-item-main">
                      <span className="song-picker-song-title">{song.title}</span>
                      {song.artist && <span className="song-picker-song-artist">{song.artist}</span>}
                    </div>
                    <button
                      className="song-picker-add-btn"
                      onClick={() => void handleAddSong(song.id)}
                      title={`Add ${song.title}`}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="song-picker-footer">
              <button className="setlist-action-btn" onClick={closeBandPicker}>Done</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}