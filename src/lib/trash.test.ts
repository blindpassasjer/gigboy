import { describe, expect, it } from 'vitest';
import { createTrashPayload } from './trash';

describe('createTrashPayload', () => {
  it('omits undefined fields from nested trash data while preserving valid falsy values', () => {
    const payload = createTrashPayload('song', '2026-05-03T00:00:00.000Z', '2026-06-02T00:00:00.000Z', {
      id: 'song-1',
      title: 'Test Song',
      playbackUrl: undefined,
      capo: 0,
      isFavorite: false,
      notes: '',
      tags: [],
    });

    expect(payload).toEqual({
      itemType: 'song',
      deletedAt: '2026-05-03T00:00:00.000Z',
      purgeAt: '2026-06-02T00:00:00.000Z',
      data: {
        id: 'song-1',
        title: 'Test Song',
        capo: 0,
        isFavorite: false,
        notes: '',
        tags: [],
      },
    });
  });
});
