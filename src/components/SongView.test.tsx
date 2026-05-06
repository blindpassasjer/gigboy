import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SongView from './SongView';
import type { Song } from '../types';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { state: null as { backTo?: string; backLabel?: string; bandId?: string } | null },
  deleteSong: vi.fn(),
  updateSong: vi.fn(),
  updateBandSong: vi.fn(),
  removeSongFromBandLibrary: vi.fn(),
  showConfirmToast: vi.fn(),
  showPromptToast: vi.fn(),
  toast: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => mocks.location,
  };
});

vi.mock('../context/SongsContext', () => ({
  useSongs: () => ({
    updateSong: mocks.updateSong,
    deleteSong: mocks.deleteSong,
  }),
}));

vi.mock('../context/SongListsContext', () => ({
  useSongLists: () => ({
    songLists: [],
    addSongToList: vi.fn(),
    removeSongFromList: vi.fn(),
  }),
}));

vi.mock('../context/BandsContext', () => ({
  useBands: () => ({
    bandSongListsByBandId: {},
    updateBandSong: mocks.updateBandSong,
    addSongToBandSongList: vi.fn(),
    removeSongFromBandSongList: vi.fn(),
    removeSongFromBandLibrary: mocks.removeSongFromBandLibrary,
  }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}));

vi.mock('../hooks/usePlan', () => ({
  usePlan: () => ({
    canUse: () => true,
  }),
}));

vi.mock('../hooks/useSongHandNotes', () => ({
  useSongHandNotes: () => ({
    myStrokes: [],
    visibleNotes: [],
    saveMyNotes: vi.fn(),
    clearMyNotes: vi.fn(),
    saveState: 'idle',
    authors: [],
    visibleAuthorIds: [],
    showAll: vi.fn(),
    showMineOnly: vi.fn(),
    toggleVisibleAuthor: vi.fn(),
  }),
}));

vi.mock('../utils/toastDialogs', () => ({
  showConfirmToast: mocks.showConfirmToast,
  showPromptToast: mocks.showPromptToast,
}));

vi.mock('../utils/anchoredToast', () => {
  const toast = Object.assign(mocks.toast, {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  });
  return { default: toast };
});

vi.mock('../utils/songMedia', () => ({
  parseSongMedia: () => null,
}));

vi.mock('./ChordDisplay', () => ({
  default: () => <div data-testid="chord-display" />,
}));

vi.mock('./ChordDiagram', () => ({
  default: () => null,
}));

vi.mock('./LanguageBadge', () => ({
  default: () => <span>lang</span>,
}));

vi.mock('./VisualMetronome', () => ({
  default: () => <div />,
}));

vi.mock('./VisualTuner', () => ({
  default: () => <div />,
}));

vi.mock('./SongHandNotesOverlay', () => ({
  default: () => <div />,
}));

vi.mock('./SongMediaPlayer', () => ({
  default: () => <div />,
}));

vi.mock('./SongRecorder', () => ({
  default: () => <div />,
}));

const baseSong: Song = {
  id: 'song-1',
  title: 'My Song',
  language: 'en',
  chordpro: '[G]Hello',
};

describe('SongView actions', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.deleteSong.mockReset();
    mocks.updateSong.mockReset();
    mocks.updateBandSong.mockReset();
    mocks.removeSongFromBandLibrary.mockReset();
    mocks.showConfirmToast.mockReset();
    mocks.showPromptToast.mockReset();
    mocks.toast.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.location.state = null;
  });

  it('passes song page state to edit navigation', () => {
    const state = { backTo: '/bands/band-1/library', backLabel: 'Band library', bandId: 'band-1' };
    mocks.location.state = state;

    render(<SongView song={baseSong} bandId="band-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit My Song' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/songs/song-1/edit', { state });
  });

  it('deletes from band library when viewed in band context', async () => {
    const state = { backTo: '/bands/band-1/library', backLabel: 'Band library', bandId: 'band-1' };
    mocks.location.state = state;
    mocks.showConfirmToast.mockResolvedValue(true);
    mocks.removeSongFromBandLibrary.mockResolvedValue(null);

    render(<SongView song={{ ...baseSong, ownerId: 'user-1', accessRole: 'owner' }} bandId="band-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete My Song' })[0]);

    await waitFor(() => {
      expect(mocks.removeSongFromBandLibrary).toHaveBeenCalledWith('band-1', 'song-1');
    });
    expect(mocks.deleteSong).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/bands/band-1/library', { state });
  });

  it('deletes from solo library when not in band context', async () => {
    const state = { backTo: '/profile', backLabel: 'Profile' };
    mocks.location.state = state;
    mocks.showConfirmToast.mockResolvedValue(true);

    render(<SongView song={{ ...baseSong, ownerId: 'user-1', accessRole: 'owner' }} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete My Song' })[0]);

    await waitFor(() => {
      expect(mocks.deleteSong).toHaveBeenCalledWith('song-1');
    });
    expect(mocks.removeSongFromBandLibrary).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/profile', { state });
  });

  it('renames band song through band updater', async () => {
    mocks.showPromptToast.mockResolvedValue('Renamed Song');
    mocks.updateBandSong.mockResolvedValue(null);

    render(<SongView song={{ ...baseSong, ownerId: 'user-1', accessRole: 'owner' }} bandId="band-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename My Song' }));

    await waitFor(() => {
      expect(mocks.updateBandSong).toHaveBeenCalledWith(
        'band-1',
        expect.objectContaining({ id: 'song-1', title: 'Renamed Song' })
      );
    });
    expect(mocks.updateSong).not.toHaveBeenCalled();
  });
});
