import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AddSongForm from './AddSongForm';
import toast from '../utils/anchoredToast';
import type { Song } from '../types';

vi.mock('../utils/anchoredToast', () => ({
  default: vi.fn(),
}));

describe('AddSongForm', () => {
  it('does not show unsaved changes warning when saving and navigating', async () => {
    const onSave = vi.fn().mockResolvedValue(null);

    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000000');

    const router = createMemoryRouter(
      [
        {
          path: '/add',
          element: <AddSongForm onSave={onSave} />,
        },
        {
          path: '/songs/:songId',
          element: <div>Song page</div>,
        },
      ],
      {
        initialEntries: ['/add'],
      }
    );

    const { container } = render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByPlaceholderText('Song title'), {
      target: { value: 'Amazing Grace' },
    });

    const chordproField = container.querySelector('textarea');
    if (!chordproField) {
      throw new Error('Expected chordpro textarea to be present.');
    }

    fireEvent.change(chordproField, {
      target: { value: '[G]Amazing grace' },
    });

    fireEvent.click(screen.getAllByRole('button', { name: /save song/i })[0]);

    await screen.findByText('Song page');

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalledWith('You have unsaved changes.', { icon: '!' });
    expect(toast).not.toHaveBeenCalled();

    randomUuidSpy.mockRestore();
  });

  it('parses pasted chord sheets automatically', () => {
    const onSave = vi.fn().mockResolvedValue(null);

    const router = createMemoryRouter(
      [
        {
          path: '/add',
          element: <AddSongForm onSave={onSave} />,
        },
      ],
      {
        initialEntries: ['/add'],
      }
    );

    const { container } = render(<RouterProvider router={router} />);

    const chordproField = container.querySelector('textarea');
    if (!chordproField) {
      throw new Error('Expected chordpro textarea to be present.');
    }

    fireEvent.paste(chordproField, {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain'
          ? 'Amazing Grace\nby Traditional\n\n[ch]G[/ch]Amazing [ch]C[/ch]grace, how [ch]G[/ch]sweet the [ch]D[/ch]sound'
          : ''),
      },
    });

    expect(screen.getByPlaceholderText('Song title')).toHaveValue('Amazing Grace');
    expect(screen.getByPlaceholderText('Artist / band')).toHaveValue('Traditional');
    expect((chordproField as HTMLTextAreaElement).value).toContain('[G]');
    expect(screen.getByText('Pasted content was parsed automatically.')).toBeInTheDocument();
    expect(screen.getByText('Detected source format: Ultimate Guitar.')).toBeInTheDocument();
  });

  it('hides the parse button in edit mode', () => {
    const onSave = vi.fn().mockResolvedValue(null);
    const initialSong: Song = {
      id: 'song-1',
      title: 'Existing Song',
      chordpro: '[G]Existing',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      language: 'en',
      tags: [],
    };

    const router = createMemoryRouter(
      [
        {
          path: '/edit',
          element: <AddSongForm onSave={onSave} initialSong={initialSong} mode="edit" />,
        },
      ],
      {
        initialEntries: ['/edit'],
      }
    );

    const { container } = render(<RouterProvider router={router} />);

    expect(within(container).queryByRole('button', { name: /parse/i })).not.toBeInTheDocument();
  });
});
