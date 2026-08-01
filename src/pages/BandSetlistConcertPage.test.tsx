import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BandSetlistConcertPage from './BandSetlistConcertPage';
import type { Song } from '../types';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  refreshBandSetlists: vi.fn(),
  refreshBandSongs: vi.fn(),
  updateBandSong: vi.fn(),
  overlayProps: null as null | {
    visible: boolean;
    drawEnabled: boolean;
    notes: Array<{ authorUid: string; strokes: number[] }>;
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
      <a href={to} {...props}>{children}</a>
    ),
    useNavigate: () => mocks.navigate,
    useParams: () => ({ bandId: 'band-1', setlistId: 'setlist-1' }),
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'owner' },
  }),
}));

const baseSong: Song = {
  id: 'song-1',
  title: 'Song One',
  language: 'en',
  chordpro: '[G]Hello world',
};

vi.mock('../context/BandsContext', () => ({
  useBands: () => ({
    bands: [{
      id: 'band-1',
      name: 'Crew Band',
      ownerId: 'owner-1',
      memberIds: ['owner-1', 'user-1'],
      memberRoles: { 'owner-1': 'editor', 'user-1': 'editor' },
      memberEmails: {},
      memberUsernames: {},
      memberFullNames: {},
      memberAvatars: {},
      billingPlan: 'crew',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    bandSetlistsByBandId: {
      'band-1': [{ id: 'setlist-1', name: 'Setlist 1', songIds: ['song-1'] }],
    },
    bandSongsByBandId: {
      'band-1': [baseSong],
    },
    refreshBandSetlists: mocks.refreshBandSetlists,
    refreshBandSongs: mocks.refreshBandSongs,
    updateBandSong: mocks.updateBandSong,
  }),
}));

vi.mock('../hooks/usePlan', () => ({
  usePlan: () => ({ canUse: () => true }),
  useBandPlan: () => ({ canUse: () => true }),
}));

vi.mock('../hooks/useSongHandNotes', () => ({
  useSongHandNotes: () => ({
    myStrokes: [],
    visibleNotes: [{
      authorUid: 'collab-1',
      authorName: 'Collaborator',
      authorAvatar: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      viewport: { width: 1000, height: 500 },
      strokes: [{
        id: 'stroke-1',
        color: '#ef4444',
        width: 2,
        points: [0.1, 0.1, 0.25, 0.25],
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    }],
    saveMyNotes: vi.fn(),
    clearMyNotes: vi.fn(),
    saveState: 'idle',
    authors: [{ uid: 'collab-1', name: 'Collaborator', avatar: null }],
    visibleAuthorIds: ['collab-1'],
    showAll: vi.fn(),
    toggleVisibleAuthor: vi.fn(),
    undoStroke: vi.fn(),
    redoStroke: vi.fn(),
    canUndo: false,
    canRedo: false,
  }),
}));

vi.mock('../utils/songMedia', () => ({ parseSongMedia: () => null }));
vi.mock('../utils/chordParser', () => ({
  transposeChord: (value: string) => value,
}));
vi.mock('../lib/userColors', () => ({ getUserNoteColor: () => '#22c55e' }));
vi.mock('../utils/anchoredToast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

vi.mock('../components/LanguageBadge', () => ({ default: () => <span>lang</span> }));
vi.mock('../components/ChordDisplay', () => ({ default: () => <div data-testid="chord-display" /> }));
vi.mock('../components/ChordDiagram', () => ({ default: () => null }));
vi.mock('../components/SongMediaPlayer', () => ({ default: () => <div /> }));
vi.mock('../components/VisualMetronome', () => ({ default: () => <div /> }));
vi.mock('../components/VisualTuner', () => ({ default: () => <div /> }));

vi.mock('../components/SongHandNotesOverlay', () => ({
  default: (props: {
    visible: boolean;
    drawEnabled: boolean;
    notes: Array<{ authorUid: string; strokes: number[] }>;
  }) => {
    mocks.overlayProps = props;
    return <div data-testid="notes-overlay" data-note-count={props.notes.length} />;
  },
}));

describe('BandSetlistConcertPage notes visibility', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.refreshBandSetlists.mockReset();
    mocks.refreshBandSongs.mockReset();
    mocks.updateBandSong.mockReset();
    mocks.overlayProps = null;
  });

  it('shows collaborator notes without requiring local drawing', async () => {
    render(<BandSetlistConcertPage />);

    await waitFor(() => {
      expect(mocks.overlayProps).not.toBeNull();
      expect(mocks.overlayProps?.visible).toBe(true);
      expect(mocks.overlayProps?.drawEnabled).toBe(false);
      expect(mocks.overlayProps?.notes).toHaveLength(1);
      expect(mocks.overlayProps?.notes[0]?.authorUid).toBe('collab-1');
    });

    expect(screen.getByTestId('notes-overlay')).toHaveAttribute('data-note-count', '1');

    fireEvent.click(screen.getByRole('button', { name: 'Show toolbar' }));
    expect(screen.getByRole('button', { name: 'Hide handwritten notes' })).toBeInTheDocument();
  });
});
