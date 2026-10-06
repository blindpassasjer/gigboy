import { describe, expect, it } from 'vitest';
import { stageplotIconForKind } from '../stageplotIcons';
import {
  EXTRA_SONGS,
  STANDARD_PLOT,
  PRESS_KIT_SPECS,
  RIDER_SPECS,
  SETLIST_SPECS,
  SONGLIST_SPECS,
  demoImage,
  generateGigs,
} from './demoSeedData';

const NOW = new Date(2026, 9, 6);
const BASE_SETLISTS = ['Saturday Night Gig'];
const BASE_RIDERS = ['Standard Stage Plot'];
const BASE_KITS = ['Electronic Press Kit'];

describe('demo seed data', () => {
  it('generates three gigs a year from this year through the end of 2030', () => {
    const { gigs } = generateGigs(NOW);
    const perYear: Record<number, number> = {};
    for (const g of gigs) perYear[new Date(g.startsAt).getFullYear()] = (perYear[new Date(g.startsAt).getFullYear()] ?? 0) + 1;
    expect(perYear).toEqual({ 2026: 3, 2027: 3, 2028: 3, 2029: 3, 2030: 3 });
    expect(new Date(gigs[gigs.length - 1].startsAt).getFullYear()).toBe(2030);
  });

  it('has exactly one tour per year, 2026 through 2030', () => {
    const { tours } = generateGigs(NOW);
    expect(tours.map((t) => t.name)).toEqual(['Tour 2026', 'Tour 2027', 'Tour 2028', 'Tour 2029', 'Tour 2030']);
  });

  it('is deterministic and never double-books a day', () => {
    const a = generateGigs(NOW).gigs;
    expect(a).toEqual(generateGigs(NOW).gigs);
    const days = a.map((g) => new Date(g.startsAt).toDateString());
    expect(new Set(days).size).toBe(days.length);
  });

  it('only holds upcoming gigs tentatively', () => {
    for (const g of generateGigs(NOW).gigs) {
      if (new Date(g.startsAt) < NOW) expect(g.status).toBe('confirmed');
    }
  });

  it('references only setlists, riders, kits and tours that exist', () => {
    const setlists = new Set([...BASE_SETLISTS, ...SETLIST_SPECS.map((s) => s.name)]);
    const riders = new Set([...BASE_RIDERS, ...RIDER_SPECS.map((r) => r.name)]);
    const kits = new Set([...BASE_KITS, ...PRESS_KIT_SPECS.map((k) => k.name)]);
    const { gigs, tours } = generateGigs(NOW);
    const tourKeys = new Set(tours.map((t) => t.key));
    for (const g of gigs) {
      expect(setlists.has(g.setlist), g.setlist).toBe(true);
      expect(riders.has(g.rider), g.rider).toBe(true);
      expect(kits.has(g.kit), g.kit).toBe(true);
      expect(tourKeys.has(g.tourKey), g.tourKey).toBe(true);
    }
  });

  it('has three new items in each category', () => {
    expect(EXTRA_SONGS).toHaveLength(3);
    expect(SONGLIST_SPECS).toHaveLength(3);
    expect(SETLIST_SPECS).toHaveLength(3);
    expect(RIDER_SPECS).toHaveLength(3);
    expect(PRESS_KIT_SPECS).toHaveLength(3);
  });

  it('only puts existing songs on songlists and setlists', () => {
    const titles = new Set([
      'Amazing Grace', 'Scarborough Fair', 'House of the Rising Sun', 'Auld Lang Syne', 'Danny Boy', 'Wildwood Flower',
      ...EXTRA_SONGS.map((s) => s.title),
    ]);
    for (const spec of [...SONGLIST_SPECS, ...SETLIST_SPECS]) {
      for (const t of spec.titles) expect(titles.has(t), `${spec.name}: ${t}`).toBe(true);
    }
  });

  it('produces image data URIs for every kind used by a press kit', () => {
    for (const kit of PRESS_KIT_SPECS) {
      for (const kind of kit.images) {
        expect(demoImage(kind).url.startsWith('data:image/svg+xml')).toBe(true);
      }
    }
  });

  it('draws every stage plot with kinds the editor knows (not the generic fallback icon) at on-stage positions', () => {
    const fallback = stageplotIconForKind('definitely-not-a-kind');
    for (const plot of [STANDARD_PLOT, ...RIDER_SPECS.map((r) => r.items)]) {
      expect(plot.length).toBeGreaterThanOrEqual(5);
      for (const item of plot) {
        expect(stageplotIconForKind(item.kind), item.kind).not.toBe(fallback);
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.x).toBeLessThanOrEqual(1);
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeLessThanOrEqual(1);
        expect(item.color).toBeTruthy();
      }
    }
  });
});
