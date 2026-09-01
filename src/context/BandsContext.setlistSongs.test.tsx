import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BandsProvider, useBands } from './BandsContext';
import type { Setlist } from '../types';

const store = vi.hoisted(() => ({ setlists: [] as Setlist[] }));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', username: 'owner', email: 'o@example.com' } }),
}));

vi.mock('../lib/dataClient', () => ({
  dataClient: {
    bands: {
      list: vi.fn(async () => [{
        id: 'band-1',
        name: 'Band',
        ownerId: 'user-1',
        memberIds: ['user-1'],
        memberRoles: { 'user-1': 'editor' },
        memberEmails: {},
        memberUsernames: {},
        memberFullNames: {},
        memberAvatars: {},
        createdAt: '2026-01-01T00:00:00.000Z',
      }]),
    },
    bandSetlists: {
      list: vi.fn(async () => store.setlists.map((s) => ({ ...s }))),
      update: vi.fn(async (_bandId: string, item: Setlist) => {
        const idx = store.setlists.findIndex((s) => s.id === item.id);
        store.setlists[idx] = { ...item };
        return { ...item };
      }),
    },
  },
}));

let api: ReturnType<typeof useBands>;
function Probe() {
  api = useBands();
  return null;
}

describe('adding a whole songlist to a band setlist', () => {
  beforeEach(() => {
    store.setlists = [{ id: 'setlist-1', name: 'Main', songIds: ['a'] } as Setlist];
  });
  afterEach(() => vi.clearAllMocks());

  it('appends every song in one update', async () => {
    render(<BandsProvider><Probe /></BandsProvider>);
    await waitFor(() => expect(api.bands).toHaveLength(1));
    await act(async () => { await api.refreshBandSetlists('band-1'); });

    await act(async () => {
      await api.addSongsToBandSetlist('band-1', 'setlist-1', ['b', 'c', 'd']);
    });

    expect(store.setlists[0].songIds).toEqual(['a', 'b', 'c', 'd']);
    expect(api.bandSetlistsByBandId['band-1'][0].songIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reproduces the old bug: sequential single adds from stale state lose all but the last', async () => {
    render(<BandsProvider><Probe /></BandsProvider>);
    await waitFor(() => expect(api.bands).toHaveLength(1));
    await act(async () => { await api.refreshBandSetlists('band-1'); });

    // Simulate SetlistsView's old loop: the handler reference is captured once
    // (stale bandSetlistsByBandId) and awaited in sequence.
    const staleAdd = api.addSongToBandSetlist;
    await act(async () => {
      for (const songId of ['b', 'c', 'd']) {
        await staleAdd('band-1', 'setlist-1', songId);
      }
    });

    expect(store.setlists[0].songIds).toEqual(['a', 'd']);
  });
});
