import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AddToMenu from './AddToMenu';

function setup(setlists = [{ id: 'sl1', name: 'Festival Set', songIds: ['s1'] }]) {
  const onAddSonglist = vi.fn().mockResolvedValue(null);
  const onRemoveSonglist = vi.fn().mockResolvedValue(null);
  const onAddSetlist = vi.fn().mockResolvedValue(null);
  const onRemoveSetlist = vi.fn().mockResolvedValue(null);
  render(
    <AddToMenu
      label="Add to"
      title="Add to a songlist or setlist"
      icon={null}
      songId="s1"
      sections={[
        {
          title: 'Songlists',
          emptyText: 'No songlists yet',
          lists: [{ id: 'a', name: 'Campfire', songIds: [] }],
          onAdd: onAddSonglist,
          onRemove: onRemoveSonglist,
        },
        { title: 'Setlists', emptyText: 'No setlists yet', lists: setlists, onAdd: onAddSetlist, onRemove: onRemoveSetlist },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add to a songlist or setlist' }));
  return { onAddSonglist, onRemoveSonglist, onAddSetlist, onRemoveSetlist };
}

describe('AddToMenu', () => {
  afterEach(cleanup);

  it('shows songlists and setlists as separate groups in one menu', () => {
    setup();
    expect(screen.getByText('Songlists')).toBeTruthy();
    expect(screen.getByText('Setlists')).toBeTruthy();
    expect(screen.getByText('Campfire')).toBeTruthy();
    expect(screen.getByText('Festival Set')).toBeTruthy();
  });

  it('routes each click to its own group: add to a songlist, remove from a setlist', async () => {
    const m = setup();
    fireEvent.click(screen.getByText('Campfire'));
    await waitFor(() => expect(m.onAddSonglist).toHaveBeenCalledWith('a', 's1'));
    expect(m.onAddSetlist).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Festival Set'));
    await waitFor(() => expect(m.onRemoveSetlist).toHaveBeenCalledWith('sl1', 's1'));
    expect(m.onRemoveSonglist).not.toHaveBeenCalled();
  });

  it('marks the lists the song is already in as checked', () => {
    setup();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Festival Set' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Campfire' }).getAttribute('aria-checked')).toBe('false');
  });

  it('shows a per-group empty message', () => {
    setup([]);
    expect(screen.getByText('No setlists yet')).toBeTruthy();
    expect(screen.queryByText('No songlists yet')).toBeNull();
  });
});
