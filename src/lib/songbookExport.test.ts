import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildSongbookExportZip } from './songbookExport';
import { generatePressKitZip, pressKitDateLine } from './pressKitZip';
import type { Band, Gig, PressKit, Setlist, Tour } from '../types';

const band = { id: 'b1', name: 'Demo Band' } as Band;
const tour: Tour = { id: 't1', name: 'Tour 2027', icon: '🎸' };
const setlist: Setlist = { id: 's1', name: 'Festival Set', songIds: [] };
const gig: Gig = {
  id: 'g1',
  tourId: 't1',
  title: 'Lakeside Acoustic Days',
  startsAt: '2027-07-10T13:00:00.000Z',
  timezone: 'Europe/Oslo',
  venue: 'Lake Meadow',
  contactName: 'Priya',
  contactEmail: 'p@example.com',
  notes: 'Bring ear plugs',
  setlistId: 's1',
  status: 'confirmed',
};
const kit: PressKit = { id: 'k1', name: 'EPK', richText: '', imageIds: [], gigIds: ['g1'] };

const empty = {
  bands: [band],
  bandSongsByBandId: {},
  bandSongListsByBandId: {},
  bandSetlistsByBandId: { b1: [setlist] },
  bandInputListsByBandId: {},
  bandPressKitsByBandId: { b1: [kit] },
  bandToursByBandId: { b1: [tour] },
  bandGigsByBandId: { b1: [gig] },
  bandPressKitImagesByBandId: {},
  bandRecordingsBySongId: {},
};

// jsdom's Blob has no arrayBuffer(), so read it the old way.
function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function unzip(blob: Blob) {
  return JSZip.loadAsync(await readBlob(blob));
}

describe('songbook export', () => {
  it('includes gigs and tours, with tour and attachments by name', async () => {
    const zip = await unzip(await buildSongbookExportZip(empty));
    const json = JSON.parse(await zip.file('bands/demo-band/gigs/gigs.json')!.async('string'));
    expect(json.type).toBe('gigboy.gigs');
    expect(json.tours).toEqual([{ name: 'Tour 2027', icon: '🎸' }]);
    expect(json.gigs[0]).toMatchObject({
      title: 'Lakeside Acoustic Days',
      tour: 'Tour 2027',
      setlist: 'Festival Set',
      contactName: 'Priya',
      notes: 'Bring ear plugs',
    });
    const text = await zip.file('bands/demo-band/gigs/gigs.txt')!.async('string');
    expect(text).toContain('Lakeside Acoustic Days');
    expect(text).toContain('Tour: Tour 2027');
  });

  it('records which gigs a press kit lists by title, not by local id', async () => {
    const zip = await unzip(await buildSongbookExportZip(empty));
    const json = JSON.parse(await zip.file('bands/demo-band/press-kits/epk/kit.json')!.async('string'));
    expect(json.listedGigs).toEqual([{ title: 'Lakeside Acoustic Days', startsAt: '2027-07-10T13:00:00.000Z' }]);
    expect(JSON.stringify(json)).not.toContain('"g1"');
  });

  it('still exports a band that only has gigs', async () => {
    const zip = await unzip(
      await buildSongbookExportZip({ ...empty, bandSetlistsByBandId: {}, bandPressKitsByBandId: {}, bandToursByBandId: {} }),
    );
    expect(zip.file('bands/demo-band/gigs/gigs.json')).toBeTruthy();
  });
});

describe('press kit zip dates', () => {
  it('writes upcoming-dates.txt grouped by tour', async () => {
    const dates = [
      { title: 'A', startsAt: '2027-07-10T13:00:00.000Z', timezone: 'Europe/Oslo', venue: 'Lake', tourName: 'Tour 2027' },
      { title: 'B', startsAt: '2027-08-10T13:00:00.000Z', venue: 'Hall', tourName: 'Tour 2027' },
      { title: 'C', startsAt: '2028-01-10T13:00:00.000Z', tourName: null },
    ];
    const zip = await unzip(
      await generatePressKitZip({ bandName: 'Demo Band', stageplots: [], riders: [], texts: [], images: [], tourDates: dates }),
    );
    const text = await zip.file('demo-band/upcoming-dates.txt')!.async('string');
    expect(text.match(/Tour 2027/g)).toHaveLength(1); // one heading for both dates
    expect(text).toContain('Lake');
    expect(text).toContain('— C');
    expect(await zip.file('demo-band/README.txt')!.async('string')).toContain('Upcoming dates: 3');
  });

  it('omits the file when there are no dates', async () => {
    const zip = await unzip(await generatePressKitZip({ bandName: 'Demo Band', stageplots: [], riders: [], texts: [], images: [] }));
    expect(zip.file('demo-band/upcoming-dates.txt')).toBeNull();
  });

  it('formats in the gig timezone and survives an unknown one', () => {
    expect(pressKitDateLine({ title: 'X', startsAt: '2027-07-10T13:00:00.000Z', timezone: 'Europe/Oslo' })).toContain('15:00');
    expect(() => pressKitDateLine({ title: 'X', startsAt: '2027-07-10T13:00:00.000Z', timezone: 'Not/AZone' })).not.toThrow();
  });
});
