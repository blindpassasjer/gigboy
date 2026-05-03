import { useState } from 'react';
import { Link2 } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useSongs } from '../context/SongsContext';
import { useSongLists } from '../context/SongListsContext';
import { useSetlists } from '../context/SetlistsContext';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { useStageplots } from '../context/StageplotsContext';
import { useTechnicalRiders } from '../context/TechnicalRidersContext';
import SongList from '../components/SongList';
import SetlistsView from '../components/SetlistsView';
import StageplotEditor from '../components/StageplotEditor';
import TechnicalRiderEditor from '../components/TechnicalRiderEditor';
import type { Song } from '../types';
import { showConfirmToast } from '../utils/toastDialogs';

const INTERNAL_SONGLISTS_CATEGORY_ID = 'songlists-default';
const ALL_SONGS_ICON_KEY = 'folio-all-songs-icon';

type CopyMode = 'songlist' | 'setlist';
type CopyTargetMode = 'new' | 'existing';

interface CopyDialogState {
  mode: CopyMode;
  sourceName: string;
  songIds: string[];
}

export default function HomePage() {
  const { user } = useAuth();
  const { songs, deleteSong, moveSong } = useSongs();
  const {
    activeCategoryId,
    activeSongListId,
    categories,
    songLists,
    addSongToList,
    moveSongInList,
    removeSongFromList,
    deleteSongList,
    renameSongList,
    updateSongListAppearance,
  } = useSongLists();
  const {
    setlists,
    activeSetlistId,
    setSetlistPublicShare,
    addSongToSetlist,
    removeSongFromSetlist,
    moveSongInSetlist,
  } = useSetlists();
  const {
    stageplots,
    activeStageplotId,
    renameStageplot,
    updateStageplotIcon,
    updateStageplotSettings,
    deleteStageplot,
    updateStageplotContent,
    setStageplotPublicShare,
  } = useStageplots();
  const {
    technicalRiders,
    activeTechnicalRiderId,
    renameTechnicalRider,
    updateTechnicalRiderIcon,
    deleteTechnicalRider,
    updateTechnicalRiderContent,
    setTechnicalRiderPublicShare,
  } = useTechnicalRiders();
  const {
    bands,
    bandSongsByBandId,
    bandSongListsByBandId,
    bandSetlistsByBandId,
    refreshBandSongLists,
    refreshBandSetlists,
    addSongToBandLibrary,
    addBandSongList,
    addSongToBandSongList,
    addBandSetlist,
    addSongToBandSetlist,
  } = useBands();

  const activeList = songLists.find((l) => l.id === activeSongListId) ?? null;
  const activeSetlist = setlists.find((s) => s.id === activeSetlistId) ?? null;
  const activeStageplot = stageplots.find((entry) => entry.id === activeStageplotId) ?? null;
  const activeTechnicalRider = technicalRiders.find((entry) => entry.id === activeTechnicalRiderId) ?? null;
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? null;
  const songsById = new Map(songs.map((song) => [song.id, song]));
  const [allSongsIcon, setAllSongsIcon] = useState<string | undefined>(() => {
    const stored = window.localStorage.getItem(ALL_SONGS_ICON_KEY)?.trim();
    return stored ? stored : undefined;
  });
  const [copyDialog, setCopyDialog] = useState<CopyDialogState | null>(null);
  const [copyBandId, setCopyBandId] = useState<string>('');
  const [copyTargetMode, setCopyTargetMode] = useState<CopyTargetMode>('new');
  const [copyExistingTargetId, setCopyExistingTargetId] = useState<string>('');
  const [copyNameDraft, setCopyNameDraft] = useState<string>('');
  const [copyBusy, setCopyBusy] = useState(false);

  const selectedBand = bands.find((band) => band.id === copyBandId) ?? null;
  const availableSongListsForBand = selectedBand ? (bandSongListsByBandId[selectedBand.id] ?? []) : [];
  const availableSetlistsForBand = selectedBand ? (bandSetlistsByBandId[selectedBand.id] ?? []) : [];

  function closeCopyDialog() {
    setCopyDialog(null);
    setCopyBandId('');
    setCopyTargetMode('new');
    setCopyExistingTargetId('');
    setCopyNameDraft('');
    setCopyBusy(false);
  }

  async function ensureSongsInBandLibrary(bandId: string, songIds: string[]) {
    const knownBandSongIds = new Set((bandSongsByBandId[bandId] ?? []).map((song) => song.id));

    for (const songId of songIds) {
      if (knownBandSongIds.has(songId)) continue;

      const song = songsById.get(songId);
      if (!song) continue;

      const error = await addSongToBandLibrary(bandId, song);
      if (error) {
        return error;
      }

      knownBandSongIds.add(songId);
    }

    return null;
  }

  async function handleConfirmCopyToBand() {
    if (!copyDialog || !copyBandId) return;

    setCopyBusy(true);

    const readyError = await ensureSongsInBandLibrary(copyBandId, copyDialog.songIds);
    if (readyError) {
      setCopyBusy(false);
      toast.error(readyError);
      return;
    }

    if (copyDialog.mode === 'songlist') {
      let targetSongListId = copyExistingTargetId;

      if (copyTargetMode === 'new') {
        const name = copyNameDraft.trim();
        if (!name) {
          setCopyBusy(false);
          toast.error('Songlist name is required.');
          return;
        }

        const createResult = await addBandSongList(copyBandId, name);
        if (createResult.error || !createResult.songListId) {
          setCopyBusy(false);
          toast.error(createResult.error ?? 'Failed to create band songlist.');
          return;
        }

        targetSongListId = createResult.songListId;
      }

      if (!targetSongListId) {
        setCopyBusy(false);
        toast.error('Select a target songlist.');
        return;
      }

      for (const songId of copyDialog.songIds) {
        const error = await addSongToBandSongList(copyBandId, targetSongListId, songId);
        if (error) {
          setCopyBusy(false);
          toast.error(error);
          return;
        }
      }

      setCopyBusy(false);
      closeCopyDialog();
      toast.success('Copied songlist to band.');
      return;
    }

    let targetSetlistId = copyExistingTargetId;

    if (copyTargetMode === 'new') {
      const name = copyNameDraft.trim();
      if (!name) {
        setCopyBusy(false);
        toast.error('Setlist name is required.');
        return;
      }

      const createResult = await addBandSetlist(copyBandId, name);
      if (createResult.error || !createResult.setlistId) {
        setCopyBusy(false);
        toast.error(createResult.error ?? 'Failed to create band setlist.');
        return;
      }

      targetSetlistId = createResult.setlistId;
    }

    if (!targetSetlistId) {
      setCopyBusy(false);
      toast.error('Select a target setlist.');
      return;
    }

    for (const songId of copyDialog.songIds) {
      const error = await addSongToBandSetlist(copyBandId, targetSetlistId, songId);
      if (error) {
        setCopyBusy(false);
        toast.error(error);
        return;
      }
    }

    setCopyBusy(false);
    closeCopyDialog();
    toast.success('Copied setlist to band.');
  }

  const copyDialogNode = copyDialog ? (
    <div className="modal-overlay" onClick={closeCopyDialog}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>
            Copy {copyDialog.mode === 'songlist' ? 'Songlist' : 'Setlist'} to Band
          </h2>
        </div>
        <div className="modal-content">
          <section className="bands-panel">
            <label className="share-menu-field">
              <span>Band</span>
              <select
                value={copyBandId}
                onChange={(event) => {
                  const nextBandId = event.target.value;
                  setCopyBandId(nextBandId);
                  setCopyExistingTargetId('');
                  if (copyDialog.mode === 'songlist') {
                    void refreshBandSongLists(nextBandId);
                    return;
                  }
                  void refreshBandSetlists(nextBandId);
                }}
              >
                {bands.map((band) => (
                  <option key={band.id} value={band.id}>{band.name}</option>
                ))}
              </select>
            </label>

            <div className="share-menu-field">
              <span>Target</span>
              <div className="bands-create-actions" style={{ justifyContent: 'flex-start', gap: '.5rem' }}>
                <button
                  type="button"
                  className={`setlist-action-btn${copyTargetMode === 'new' ? '' : ' setlist-action-btn--secondary'}`}
                  onClick={() => {
                    setCopyTargetMode('new');
                    setCopyExistingTargetId('');
                  }}
                >
                  Create new
                </button>
                <button
                  type="button"
                  className={`setlist-action-btn${copyTargetMode === 'existing' ? '' : ' setlist-action-btn--secondary'}`}
                  onClick={() => setCopyTargetMode('existing')}
                >
                  Use existing
                </button>
              </div>
            </div>

            {copyTargetMode === 'new' ? (
              <label className="share-menu-field">
                <span>Name</span>
                <input
                  type="text"
                  value={copyNameDraft}
                  onChange={(event) => setCopyNameDraft(event.target.value)}
                  placeholder={copyDialog.sourceName}
                />
              </label>
            ) : (
              <label className="share-menu-field">
                <span>
                  {copyDialog.mode === 'songlist' ? 'Songlist' : 'Setlist'}
                </span>
                <select
                  value={copyExistingTargetId}
                  onChange={(event) => setCopyExistingTargetId(event.target.value)}
                >
                  <option value="">Select target…</option>
                  {(copyDialog.mode === 'songlist' ? availableSongListsForBand : availableSetlistsForBand).map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="bands-create-actions" style={{ justifyContent: 'flex-end', gap: '.5rem' }}>
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={closeCopyDialog}
                disabled={copyBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="setlist-action-btn"
                onClick={() => void handleConfirmCopyToBand()}
                disabled={copyBusy}
              >
                {copyBusy ? 'Copying…' : 'Copy'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  ) : null;
  
  // If viewing a setlist, show SetlistsView
  if (activeSetlist) {
    const setlistSongs = activeSetlist.songIds
      .map((songId) => songsById.get(songId))
      .filter((song): song is Song => Boolean(song));

    return (
      <>
        <SetlistsView
          setlistId={activeSetlist.id}
          setlistName={activeSetlist.name}
          songs={setlistSongs}
          allSongs={songs}
          onAddSong={(songId) => addSongToSetlist(activeSetlist.id, songId)}
          onMoveSong={(songId, beforeSongId) => moveSongInSetlist(activeSetlist.id, songId, beforeSongId)}
          onRemoveSong={(songId) => removeSongFromSetlist(activeSetlist.id, songId)}
          extraActions={(
            <button
              type="button"
              className={`setlist-action-btn setlist-action-btn--secondary${activeSetlist.publicShareEnabled ? ' setlist-action-btn--active' : ''}`}
              onClick={() => void handleShareSetlist()}
              title={activeSetlist.publicShareEnabled ? 'Copy public link' : 'Create & copy public link'}
            >
              <Link2 size={14} />
            </button>
          )}

        />
        {copyDialogNode}
      </>
    );
  }

  async function handleShareStageplot() {
    if (!activeStageplot) return;
    const ownerId = activeStageplot.ownerId;
    if (!ownerId) {
      toast.error('This stageplot cannot be publicly shared yet. Please sync your account first.');
      return;
    }

    const publicUrl = `${window.location.origin}/public/users/${ownerId}/stageplots/${activeStageplot.id}`;

    if (!activeStageplot.publicShareEnabled) {
      const error = await setStageplotPublicShare(activeStageplot.id, true);
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
  }

  if (activeStageplot) {
    return (
      <StageplotEditor
        stageplot={activeStageplot}
        canEdit
        currentUser={{
          id: user?.id ?? null,
          name: user?.fullName ?? user?.username ?? user?.email ?? 'You',
          avatar: user?.avatar ?? null,
        }}
        onRename={(name) => {
          void renameStageplot(activeStageplot.id, name).then((error) => {
            if (error) toast.error(error);
          });
        }}
        onUpdateIcon={(icon) => {
          void updateStageplotIcon(activeStageplot.id, icon).then((error) => {
            if (error) toast.error(error);
          });
        }}
        onUpdateStageSettings={(shape, size) => {
          void updateStageplotSettings(activeStageplot.id, shape, size).then((error) => {
            if (error) toast.error(error);
          });
        }}
        onDelete={async () => {
          const error = await deleteStageplot(activeStageplot.id);
          if (error) toast.error(error);
        }}
        onSaveContent={async (items, drawingLayers) => {
          const error = await updateStageplotContent({
            stageplotId: activeStageplot.id,
            items,
            drawingLayers,
          });
          if (error) toast.error(error);
        }}
        onCopyPublicLink={handleShareStageplot}
      />
    );
  }

  async function handleShareTechnicalRider() {
    if (!activeTechnicalRider) return;
    const ownerId = activeTechnicalRider.ownerId;
    if (!ownerId) {
      toast.error('This technical rider cannot be publicly shared yet. Please sync your account first.');
      return;
    }

    const publicUrl = `${window.location.origin}/public/users/${ownerId}/riders/${activeTechnicalRider.id}`;

    if (!activeTechnicalRider.publicShareEnabled) {
      const error = await setTechnicalRiderPublicShare(activeTechnicalRider.id, true);
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
  }

  if (activeTechnicalRider) {
    return (
      <TechnicalRiderEditor
        rider={activeTechnicalRider}
        canEdit
        onRename={async (name) => {
          const error = await renameTechnicalRider(activeTechnicalRider.id, name);
          if (error) toast.error(error);
        }}
        onUpdateIcon={async (icon) => {
          const error = await updateTechnicalRiderIcon(activeTechnicalRider.id, icon);
          if (error) toast.error(error);
        }}
        onDelete={async () => {
          const error = await deleteTechnicalRider(activeTechnicalRider.id);
          if (error) toast.error(error);
        }}
        onSaveContent={async (content) => {
          const error = await updateTechnicalRiderContent({
            riderId: activeTechnicalRider.id,
            lines: content.lines,
            preferredEquipment: content.preferredEquipment,
            inventoryEquipment: content.inventoryEquipment,
          });
          if (error) toast.error(error);
        }}
        onCopyPublicLink={handleShareTechnicalRider}
      />
    );
  }

  const shouldFilterByCategory = Boolean(
    activeCategory && activeCategory.id !== INTERNAL_SONGLISTS_CATEGORY_ID
  );

  const activeCategoryFilterId = shouldFilterByCategory
    ? activeCategory?.id ?? null
    : null;

  const activeCategorySongIds = activeCategoryFilterId
    ? new Set(
        songLists
          .filter((list) => list.folderId === activeCategoryFilterId)
          .flatMap((list) => list.songIds)
      )
    : null;
  const displayedSongs = activeList
    ? activeList.songIds
        .map((songId) => songsById.get(songId))
        .filter((song): song is Song => Boolean(song))
    : activeCategorySongIds
      ? songs.filter((song) => activeCategorySongIds.has(song.id))
      : songs;
  const isAllSongsView = !activeList && !activeCategorySongIds;

  function canDeleteLibrarySong(song: Song) {
    return !song.ownerId || song.accessRole === 'owner';
  }

  const canDeleteActiveSongList = Boolean(activeList && (!activeList.ownerId || activeList.accessRole === 'owner'));

  function handleUpdateAllSongsAppearance(appearance: { icon?: string }) {
    const icon = appearance.icon?.trim();
    if (!icon) {
      window.localStorage.removeItem(ALL_SONGS_ICON_KEY);
      setAllSongsIcon(undefined);
      return;
    }

    window.localStorage.setItem(ALL_SONGS_ICON_KEY, icon);
    setAllSongsIcon(icon);
  }

  function handleMoveSong(songId: string, beforeSongId: string | null) {
    if (activeList) {
      moveSongInList(activeList.id, songId, beforeSongId);
      return;
    }

    moveSong(songId, beforeSongId);
  }

  async function handleDeleteSong(song: Song) {
    if (!canDeleteLibrarySong(song)) {
      toast.error('Only the song owner can move this song to trash.');
      return;
    }

    const confirmed = await showConfirmToast(`Move "${song.title}" to trash? It will be automatically deleted after 30 days.`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;
    await deleteSong(song.id);
  }

  async function handleDeleteActiveSongList() {
    if (!activeList) return;
    if (!canDeleteActiveSongList) {
      toast.error('Only the songlist owner can move this songlist to trash.');
      return;
    }

    const confirmed = await showConfirmToast(`Move songlist "${activeList.name}" to trash? It will be automatically deleted after 30 days.`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;

    deleteSongList(activeList.id);
  }

  async function handleShareSetlist() {
    if (!activeSetlist) return;
    const ownerId = activeSetlist.ownerId;
    if (!ownerId) {
      toast.error('This setlist cannot be publicly shared yet. Please sync your account first.');
      return;
    }

    const publicUrl = `${window.location.origin}/public/users/${ownerId}/setlists/${activeSetlist.id}`;

    if (!activeSetlist.publicShareEnabled) {
      const publicSongs = activeSetlist.songIds
        .map((songId) => songsById.get(songId))
        .filter((song): song is Song => Boolean(song))
        .map((song) => ({
          id: song.id,
          title: song.title,
          ...(song.artist ? { artist: song.artist } : {}),
        }));

      const error = await setSetlistPublicShare(activeSetlist.id, true, publicSongs);
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
  }

  return (
    <>
      <SongList
      songs={displayedSongs}
      listName={activeList?.name ?? activeCategory?.name ?? 'All Songs'}
      listIcon={activeList?.icon ?? (isAllSongsView ? allSongsIcon : undefined)}
      allSongs={activeList ? songs : undefined}
      onAddSong={activeList ? (songId) => addSongToList(activeList.id, songId) : undefined}
      onMoveSong={handleMoveSong}
      onDeleteSong={handleDeleteSong}
      canDeleteSong={canDeleteLibrarySong}
      onRenameList={
        activeList
          ? (name) => renameSongList(activeList.id, name)
          : undefined
      }
      onDeleteList={activeList && canDeleteActiveSongList ? handleDeleteActiveSongList : undefined}
      deleteListLabel={activeList ? `Delete songlist ${activeList.name}` : undefined}
      onUpdateListAppearance={
        activeList
          ? (appearance) => updateSongListAppearance(activeList.id, appearance)
          : isAllSongsView
            ? handleUpdateAllSongsAppearance
            : undefined
      }
      onRemoveSong={activeList ? (song) => removeSongFromList(activeList.id, song.id) : undefined}
      headerActions={undefined}
    />
      {copyDialogNode}
    </>
  );
}
