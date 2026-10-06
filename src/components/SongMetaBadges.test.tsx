import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SongMetaBadges from './SongMetaBadges';
import type { Song } from '../types';

const song = (chordpro: string): Song => ({ id: 's', title: 'T', language: 'en', chordpro });

describe('SongMetaBadges tabs badge', () => {
  afterEach(cleanup);

  it('shows a Tabs badge when the song has a tab block', () => {
    render(<SongMetaBadges song={song('{start_of_tab}\ne|--0--|\n{end_of_tab}')} />);
    expect(screen.getByTitle('This song has tabs')).toBeTruthy();
  });

  it('understands the {sot}/{eot} shorthand', () => {
    render(<SongMetaBadges song={song('{sot}\ne|--0--|\n{eot}')} />);
    expect(screen.getByTitle('This song has tabs')).toBeTruthy();
  });

  it('shows no badge for a song without tabs, or with an empty tab block', () => {
    render(<SongMetaBadges song={song('[C]Just chords and lyrics')} />);
    render(<SongMetaBadges song={song('{start_of_tab}\n{end_of_tab}')} />);
    expect(screen.queryByTitle('This song has tabs')).toBeNull();
  });
});
