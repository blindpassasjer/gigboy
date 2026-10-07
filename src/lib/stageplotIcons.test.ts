import { describe, expect, it } from 'vitest';
import type { StageplotItem } from '../types';
import { compareStageplotItemsByChannel, stageplotChannelNumbers, stageplotChannelsOverlap } from './stageplotIcons';

const item = (channel?: string, extra: Partial<StageplotItem> = {}): StageplotItem => ({
  id: channel ?? 'none', kind: 'vocals', label: 'x', x: 0, y: 0, channel, ...extra,
});

describe('stageplotChannelNumbers', () => {
  it('parses single numbers and inclusive ranges', () => {
    expect(stageplotChannelNumbers('8')).toEqual([8]);
    expect(stageplotChannelNumbers('1-2')).toEqual([1, 2]);
    expect(stageplotChannelNumbers(' 7 – 9 ')).toEqual([7, 8, 9]);
  });

  it('returns nothing for labels, blanks, reversed or oversized ranges', () => {
    expect(stageplotChannelNumbers('FX')).toEqual([]);
    expect(stageplotChannelNumbers('')).toEqual([]);
    expect(stageplotChannelNumbers(undefined)).toEqual([]);
    expect(stageplotChannelNumbers('8-7')).toEqual([]);
    expect(stageplotChannelNumbers('1-500')).toEqual([]);
  });
});

describe('stageplotChannelsOverlap', () => {
  it('detects overlap between numbers and ranges in either order', () => {
    expect(stageplotChannelsOverlap('1-2', '2')).toBe(true);
    expect(stageplotChannelsOverlap('2', '1-2')).toBe(true);
    expect(stageplotChannelsOverlap('1-2', '3-4')).toBe(false);
    expect(stageplotChannelsOverlap('3', '4')).toBe(false);
  });

  it('compares free-text labels ignoring case and spacing', () => {
    expect(stageplotChannelsOverlap('FX', 'fx')).toBe(true);
    expect(stageplotChannelsOverlap('Aux  1', 'aux 1')).toBe(true);
    expect(stageplotChannelsOverlap('FX', '3')).toBe(false);
    expect(stageplotChannelsOverlap('', '')).toBe(false);
  });
});

describe('compareStageplotItemsByChannel', () => {
  it('sorts a range by its first number, ahead of unnumbered items', () => {
    const entries = [item('10-11'), item(undefined), item('3'), item('1-2')].map((it, index) => ({ item: it, index }));
    expect(entries.sort(compareStageplotItemsByChannel).map((e) => e.item.channel)).toEqual(['1-2', '3', '10-11', undefined]);
  });
});
