import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AddSongForm from './AddSongForm';
import toast from '../utils/anchoredToast';

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
});
