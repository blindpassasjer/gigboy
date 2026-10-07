import type { GigStatus, Song, StageplotItem } from '../../types';

/**
 * Sample content for the static demo build (see demoStore.ts). Everything here is plain data or a pure
 * function of `now` — ids are assigned by the store. Songs are public-domain/traditional so the demo can
 * ship their lyrics; every name, address, phone number and email is made up.
 */

type SongSpec = Pick<Song, 'title' | 'artist' | 'language' | 'key' | 'tempo' | 'timeSignature' | 'durationSeconds' | 'chordpro'> & {
  tags?: string[];
};

// ── Songs ────────────────────────────────────────────────────────────────────

export const EXTRA_SONGS: SongSpec[] = [
  {
    title: 'When the Saints Go Marching In',
    artist: 'Traditional',
    language: 'en',
    key: 'G',
    tempo: 112,
    timeSignature: '4/4',
    durationSeconds: 190,
    tags: ['gospel', 'singalong'],
    chordpro: `{title: When the Saints Go Marching In}
{artist: Traditional}
{key: G}
{tempo: 112}

{start_of_verse}
Oh when the [G]saints go marching [G]in
Oh when the saints go [D]marching in
Oh Lord I want to be in that [G]number
When the [C]saints go [G]marching [D]in [G]
{end_of_verse}

{start_of_verse}
Oh when the [G]sun refuse to [G]shine
Oh when the sun refuse to [D]shine
Oh Lord I want to be in that [G]number
When the [C]sun re[G]fuse to [D]shine [G]
{end_of_verse}`,
  },
  {
    title: 'Loch Lomond',
    artist: 'Traditional',
    language: 'en',
    key: 'G',
    tempo: 80,
    timeSignature: '4/4',
    durationSeconds: 215,
    tags: ['scottish', 'ballad'],
    chordpro: `{title: Loch Lomond}
{artist: Traditional}
{key: G}
{tempo: 80}

{start_of_verse}
By [G]yon bonnie banks and by [C]yon bonnie [G]braes
Where the [G]sun shines bright on Loch [D]Lomond
Where [G]me and my true love were [C]ever wont to [G]gae
On the [Em]bonnie, bonnie [D]banks o' Loch [G]Lomond
{end_of_verse}

{start_of_chorus}
Oh ye'll [G]tak' the high road and I'll tak' the [C]low road
And I'll be in Scotland a[G]fore ye
But [G]me and my true love will [C]never meet a[G]gain
On the [Em]bonnie, bonnie [D]banks o' Loch [G]Lomond
{end_of_chorus}`,
  },
  {
    title: 'The Wild Rover',
    artist: 'Traditional',
    language: 'en',
    key: 'G',
    tempo: 126,
    timeSignature: '4/4',
    durationSeconds: 175,
    tags: ['irish', 'pub', 'singalong'],
    chordpro: `{title: The Wild Rover}
{artist: Traditional}
{key: G}
{tempo: 126}

{start_of_verse}
I've [G]been a wild rover for many a [C]year
And I [G]spent all my money on [D]whiskey and [G]beer
But [G]now I'm returning with gold in great [C]store
And I [G]never will play the wild [D]rover no [G]more
{end_of_verse}

{start_of_chorus}
And it's [G]no, nay, never, [C]no, nay, never no [G]more
Will I [G]play the wild rover, [D]no never no [G]more
{end_of_chorus}`,
  },
];

// ── Songlists / setlists ─────────────────────────────────────────────────────

export interface SongListSpec {
  name: string;
  icon?: string;
  titles: string[];
}

export const SONGLIST_SPECS: SongListSpec[] = [
  {
    name: 'Celtic & Folk Ballads',
    icon: '🎻',
    titles: ['Scarborough Fair', 'Loch Lomond', 'Danny Boy', 'The Wild Rover', 'Auld Lang Syne'],
  },
  {
    name: 'Slow & Gentle',
    icon: '🎼',
    titles: ['Amazing Grace', 'Scarborough Fair', 'Danny Boy', 'Loch Lomond'],
  },
  {
    name: 'Sing-along Closers',
    icon: '🎤',
    titles: ['The Wild Rover', 'When the Saints Go Marching In', 'House of the Rising Sun', 'Auld Lang Syne'],
  },
];

export interface SetlistSpec {
  name: string;
  icon?: string;
  titles: string[];
  notes?: Record<string, string>;
}

export const SETLIST_SPECS: SetlistSpec[] = [
  {
    name: 'Festival Set (60 min)',
    icon: '🎪',
    titles: [
      'When the Saints Go Marching In',
      'The Wild Rover',
      'Wildwood Flower',
      'House of the Rising Sun',
      'Loch Lomond',
      'Amazing Grace',
    ],
    notes: {
      'When the Saints Go Marching In': 'Big opener — count in, full band from bar 1',
      'The Wild Rover': 'Invite the crowd to clap along',
    },
  },
  {
    name: 'Wedding Ceremony & Dinner',
    icon: '✨',
    titles: ['Scarborough Fair', 'Danny Boy', 'Loch Lomond', 'Amazing Grace', 'Auld Lang Syne'],
    notes: { 'Auld Lang Syne': 'Last song — everyone in a circle' },
  },
  {
    name: 'Pub Singalong',
    icon: '🎤',
    titles: ['The Wild Rover', 'When the Saints Go Marching In', 'House of the Rising Sun', 'Danny Boy', 'Auld Lang Syne'],
  },
];

// ── Technical riders ─────────────────────────────────────────────────────────

type RiderItem = Omit<StageplotItem, 'id'>;

export interface RiderSpec {
  name: string;
  icon?: string;
  hospitalityNotes: string;
  logisticsNotes: string;
  items: RiderItem[];
}

/** Item colours match the stage plot editor's palette, so demo plots look like ones a user would draw. */
const PLOT_COLORS: Record<string, string> = {
  vocals: '#f97316',
  guitar: '#22c55e',
  bass: '#0ea5e9',
  drums: '#ef4444',
  keys: '#a855f7',
  violin: '#d946ef',
  'drum-kick': '#ef4444',
  'drum-snare': '#f43f5e',
  'drum-hihat': '#fb7185',
  'drum-rack-tom': '#e11d48',
  'drum-floor-tom': '#be123c',
  'drum-overhead': '#9f1239',
  monitor: '#f59e0b',
  pa: '#059669',
  iem: '#7c3aed',
  amp: '#6b7280',
  'guitar-amp': '#14b8a6',
  'bass-amp': '#06b6d4',
  'keyboard-amp': '#8b5cf6',
};

/**
 * One stage-plot item. x runs left→right and y back→front (the audience is at y=1), both 0–1 as in the editor.
 * Players standing at their own amp are position markers without a channel (`noChannel`), like on a real plot.
 */
function plotItem(
  kind: string,
  label: string,
  x: number,
  y: number,
  channel?: string,
  description?: string,
  extra: Partial<RiderItem> = {},
): RiderItem {
  return { kind, label, x, y, color: PLOT_COLORS[kind], ...(channel ? { channel } : { noChannel: true }), ...(description ? { description } : {}), ...extra };
}

/** A drum kit spread over the back of the stage, one mic per piece (channels start at `ch`). */
function drumKit(cx: number, cy: number, ch: number): RiderItem[] {
  return [
    plotItem('drum-kick', 'Kick', cx, cy + 0.07, String(ch), 'Kick in / out'),
    plotItem('drum-snare', 'Snare', cx - 0.08, cy, String(ch + 1), 'Top + bottom'),
    plotItem('drum-hihat', 'Hi-Hat', cx - 0.15, cy - 0.04, String(ch + 2), 'Small-diaphragm condenser'),
    plotItem('drum-rack-tom', 'Rack Tom', cx, cy - 0.06, String(ch + 3), 'Clip mic'),
    plotItem('drum-floor-tom', 'Floor Tom', cx + 0.12, cy, String(ch + 4), 'Clip mic'),
    plotItem('drum-overhead', 'OH L', cx - 0.12, cy - 0.13, String(ch + 5), 'Condenser', { stand: 'Tall boom' }),
    plotItem('drum-overhead', 'OH R', cx + 0.12, cy - 0.13, String(ch + 6), 'Condenser', { stand: 'Tall boom' }),
  ];
}

/** The 4-piece band used by the default demo rider (and as the base of the club show). */
export const STANDARD_PLOT: RiderItem[] = [
  ...drumKit(0.5, 0.2, 1),
  plotItem('guitar-amp', 'Guitar Amp', 0.17, 0.32, '8', 'Miked cab, SM57'),
  plotItem('guitar', 'Guitar', 0.22, 0.5, undefined, 'Stage left, plays acoustic on 2 songs'),
  plotItem('bass-amp', 'Bass Amp', 0.83, 0.32, '9', 'DI + amp mic'),
  plotItem('bass', 'Bass', 0.78, 0.5, undefined, 'Stage right'),
  plotItem('vocals', 'Lead Vox', 0.5, 0.72, '10', 'SM58, boom stand', { stand: 'Tall boom' }),
  plotItem('vocals', 'Backing Vox', 0.68, 0.7, '11', 'SM58', { stand: 'Short boom' }),
  plotItem('monitor', 'Wedge 1', 0.5, 0.92, '1', 'Monitor mix 1: Lead vocal + guitar', { rotation: 180 }),
  plotItem('monitor', 'Wedge 2', 0.74, 0.9, '2', 'Monitor mix 2: Bass + drums', { rotation: 180 }),
];

export const RIDER_SPECS: RiderSpec[] = [
  {
    name: 'Festival Full Band',
    icon: '🎛️',
    hospitalityNotes: 'Water and towels on stage. Hot meal for 6 after soundcheck, vegetarian option for 1.',
    logisticsNotes: 'Changeover 15 min max. Our own in-ear system (2 packs) — please provide a rack position and a clear frequency. Parking for one van next to the stage.',
    items: [
      ...drumKit(0.5, 0.18, 1),
      plotItem('keyboard-amp', 'Keys Amp', 0.14, 0.3, '8-9', 'Stereo DI'),
      plotItem('keys', 'Keys', 0.2, 0.46, undefined, 'Stage left'),
      plotItem('bass-amp', 'Bass Amp', 0.86, 0.3, '10', 'DI + amp mic'),
      plotItem('bass', 'Bass', 0.8, 0.46),
      plotItem('guitar-amp', 'Acoustic / DI', 0.3, 0.5, '11', 'Active DI, XLR'),
      plotItem('guitar', 'Guitar', 0.34, 0.62),
      plotItem('violin', 'Fiddle', 0.66, 0.56, '12', 'Clip-on condenser, DI backup'),
      plotItem('vocals', 'Lead Vox', 0.5, 0.78, '13', 'Wireless handheld, boom stand spare', { stand: 'Tall boom' }),
      plotItem('vocals', 'Backing Vox', 0.72, 0.74, '14', 'SM58', { stand: 'Short boom' }),
      plotItem('iem', 'IEM Pack 1', 0.4, 0.9, '1-2', 'Monitor mix 1-2: Own pack, stereo'),
      plotItem('iem', 'IEM Pack 2', 0.6, 0.9, '3-4', 'Monitor mix 3-4: Own pack, stereo'),
      plotItem('monitor', 'Wedge', 0.5, 0.96, '5', 'Monitor mix 5: Lead vocal wedge', { rotation: 180 }),
      plotItem('pa', 'PA', 0.04, 0.9, undefined, 'House PA, stage left', { rotation: 90 }),
      plotItem('pa', 'PA', 0.96, 0.9, undefined, 'House PA, stage right', { rotation: 270 }),
    ],
  },
  {
    name: 'Acoustic Duo',
    icon: '🎙️',
    hospitalityNotes: 'Water on stage. A herbal tea and honey for the singer, please.',
    logisticsNotes: 'Very quick setup: 20 minutes in the room. We bring our own stools. Need two mains sockets at the front of the stage.',
    items: [
      plotItem('vocals', 'Vox + Guitar', 0.36, 0.66, '1-2', 'Condenser for voice, guitar via DI', { stand: 'Tall boom' }),
      plotItem('guitar', 'Acoustic Guitar', 0.32, 0.56),
      plotItem('vocals', 'Harmony Vox', 0.66, 0.66, '3', 'SM58 or similar', { stand: 'Tall boom' }),
      plotItem('violin', 'Fiddle', 0.7, 0.54, '4', 'Small-diaphragm condenser'),
      plotItem('monitor', 'Wedge', 0.5, 0.92, '1', 'Monitor mix 1: One shared wedge, mostly vocals', { rotation: 180 }),
    ],
  },
  {
    name: 'Wedding Trio',
    icon: '💍',
    hospitalityNotes: 'Dinner for 3 where the guests are served, or a quiet place to eat. Soft drinks on stage.',
    logisticsNotes: 'We play quietly at dinner, so we need a small PA only. Please tell us where the first dance happens. Arrival 2 hours before the ceremony.',
    items: [
      plotItem('vocals', 'Lead Vox', 0.5, 0.7, '1', 'Wireless handheld', { stand: 'Short boom' }),
      plotItem('guitar', 'Guitar', 0.3, 0.6, '2', 'DI, no amp'),
      plotItem('bass', 'Upright / Bass', 0.74, 0.58, '3', 'DI'),
      plotItem('monitor', 'Wedge', 0.5, 0.92, '1', 'Monitor mix 1: Quiet monitor mix', { rotation: 180 }),
      plotItem('pa', 'Small PA', 0.1, 0.88, undefined, 'Two tops, no subs', { rotation: 90 }),
      plotItem('pa', 'Small PA', 0.9, 0.88, undefined, 'Two tops, no subs', { rotation: 270 }),
    ],
  },
];

// ── Press kits ───────────────────────────────────────────────────────────────

export interface PressKitSpec {
  name: string;
  icon?: string;
  richText: string;
  images: ImageKind[];
  /** Pick the near-term, non-private gigs as the dates listed on the shared kit. */
  listDates?: boolean;
}

export const PRESS_KIT_SPECS: PressKitSpec[] = [
  {
    name: 'Festival Booking Kit',
    icon: '🎬',
    richText:
      '<h2>The Gigboy Demo Band</h2>' +
      '<p>Six-piece folk and roots band with a big, warm live sound — fiddle, banjo, close harmonies and a rhythm section that gets festival crowds on their feet.</p>' +
      '<h3>Festival facts</h3>' +
      '<ul><li>45–90 minute sets, acoustic or full band</li><li>Own in-ear system, minimal backline needs</li><li>Changeover in 15 minutes</li><li>Daytime, evening and late-night sets</li></ul>' +
      '<p>Upcoming dates are listed on this page. For bookings, get in touch via the contact on this page.</p>',
    images: ['stage', 'crowd', 'portrait', 'poster'],
    listDates: true,
  },
  {
    name: 'Wedding & Events Kit',
    icon: '✨',
    richText:
      '<h2>Live music for your day</h2>' +
      '<p>From a quiet acoustic ceremony to a dance-floor finale, we adapt to your day. Our repertoire covers timeless folk songs, waltzes for the first dance, and sing-alongs that bring everyone together.</p>' +
      '<ul><li>Ceremony, drinks reception, dinner and dance sets</li><li>Duo, trio or full band</li><li>We learn your first-dance song</li><li>Small PA included</li></ul>',
    images: ['portrait', 'venue', 'landscape'],
  },
  {
    name: 'Venue One-Sheet',
    icon: '⭐',
    richText:
      '<h2>For venues &amp; promoters</h2>' +
      '<p>A concise overview: what we play, what we need, and how we promote shows. We bring a small, loyal audience and promote every date to our mailing list and social channels.</p>' +
      '<ul><li>Typical draw: 80–150 people</li><li>Promo material supplied 6 weeks ahead</li><li>Door split or guarantee, both fine</li></ul>',
    images: ['poster', 'stage'],
    listDates: true,
  },
];

// ── Generated images (inline SVG) ────────────────────────────────────────────

export type ImageKind = 'stage' | 'crowd' | 'portrait' | 'poster' | 'venue' | 'landscape';

function svgUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const IMAGE_META: Record<ImageKind, { title: string; top: string; bottom: string; accent: string }> = {
  stage: { title: 'On stage — live at the Corner Pub', top: '#1e1b4b', bottom: '#7c2d12', accent: '#fbbf24' },
  crowd: { title: 'Festival crowd, main stage', top: '#0c4a6e', bottom: '#14532d', accent: '#fde68a' },
  portrait: { title: 'Band portrait', top: '#44403c', bottom: '#78350f', accent: '#fcd34d' },
  poster: { title: 'Tour poster', top: '#881337', bottom: '#1e3a8a', accent: '#fef3c7' },
  venue: { title: 'Hillview Manor — ceremony set-up', top: '#365314', bottom: '#713f12', accent: '#fef08a' },
  landscape: { title: 'Sunrise over the festival field', top: '#0f766e', bottom: '#b45309', accent: '#fde047' },
};

/** A simple generated "photo" (gradient + silhouettes) so the demo's galleries aren't empty. 1200×800. */
export function demoImage(kind: ImageKind): { title: string; url: string; sizeBytes: number } {
  const m = IMAGE_META[kind];
  const figure = (x: number, h: number) =>
    `<g fill="#0b0b12" opacity="0.92"><circle cx="${x}" cy="${620 - h}" r="${h * 0.16}"/><rect x="${x - h * 0.14}" y="${620 - h * 0.8}" width="${h * 0.28}" height="${h * 0.8}" rx="${h * 0.08}"/></g>`;
  let scene = '';
  if (kind === 'stage') {
    scene =
      `<polygon points="450,0 350,520 550,520" fill="${m.accent}" opacity="0.18"/>` +
      `<polygon points="750,0 650,520 850,520" fill="${m.accent}" opacity="0.18"/>` +
      `<rect x="0" y="560" width="1200" height="240" fill="#0b0b12"/>` +
      [330, 500, 670, 840].map((x, i) => figure(x, 300 - (i % 2) * 30)).join('');
  } else if (kind === 'crowd') {
    scene =
      `<rect x="0" y="520" width="1200" height="280" fill="#052e16"/>` +
      Array.from({ length: 16 }, (_, i) => figure(40 + i * 75, 150 + ((i * 37) % 60))).join('') +
      `<polygon points="100,520 200,380 300,520" fill="#f43f5e"/><polygon points="900,520 1000,400 1100,520" fill="#38bdf8"/>`;
  } else if (kind === 'portrait') {
    scene = [260, 480, 700, 920].map((x, i) => figure(x, 380 - (i % 2) * 40)).join('') + `<rect x="0" y="640" width="1200" height="160" fill="#0b0b12" opacity="0.7"/>`;
  } else if (kind === 'poster') {
    scene =
      `<circle cx="600" cy="330" r="220" fill="${m.accent}" opacity="0.2"/>` +
      `<text x="600" y="360" font-family="Georgia, serif" font-size="120" font-weight="700" text-anchor="middle" fill="${m.accent}">LIVE</text>` +
      `<text x="600" y="470" font-family="Georgia, serif" font-size="48" text-anchor="middle" fill="#fff" opacity="0.9">The Gigboy Demo Band</text>` +
      `<text x="600" y="560" font-family="Georgia, serif" font-size="32" text-anchor="middle" fill="#fff" opacity="0.7">Tour 2026 – 2030</text>`;
  } else if (kind === 'venue') {
    scene =
      `<rect x="0" y="560" width="1200" height="240" fill="#365314"/>` +
      `<rect x="300" y="300" width="600" height="280" fill="#fef3c7"/><polygon points="270,300 600,130 930,300" fill="#7c2d12"/>` +
      `<rect x="540" y="420" width="120" height="160" fill="#78350f"/>` +
      [360, 440, 720, 800].map((x) => `<rect x="${x}" y="360" width="60" height="80" fill="#38bdf8" opacity="0.7"/>`).join('');
  } else {
    scene =
      `<circle cx="820" cy="330" r="110" fill="${m.accent}"/>` +
      `<polygon points="0,560 220,360 420,560" fill="#064e3b"/><polygon points="300,560 600,320 900,560" fill="#065f46"/><polygon points="700,560 1000,380 1200,560" fill="#064e3b"/>` +
      `<rect x="0" y="560" width="1200" height="240" fill="#14532d"/>`;
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m.top}"/><stop offset="1" stop-color="${m.bottom}"/></linearGradient></defs>` +
    `<rect width="1200" height="800" fill="url(#g)"/>${scene}</svg>`;
  return { title: m.title, url: svgUri(svg), sizeBytes: svg.length };
}

/** The band's logo: a guitar pick with initials. */
export function demoLogo(): { url: string; sizeBytes: number } {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `<rect width="512" height="512" rx="96" fill="#1e3a8a"/>` +
    `<path d="M256 76c-92 0-150 70-150 150 0 100 82 210 150 210s150-110 150-210c0-80-58-150-150-150z" fill="#fbbf24"/>` +
    `<text x="256" y="290" font-family="Georgia, serif" font-size="150" font-weight="700" text-anchor="middle" fill="#1e3a8a">GB</text>` +
    `</svg>`;
  return { url: svgUri(svg), sizeBytes: svg.length };
}

// ── Tours + gigs through 2030 ────────────────────────────────────────────────

/** What kind of gig it is — drives notes, times and whether it may be listed publicly. Tours are per year, not per kind. */
export type TourKind = 'festival' | 'club' | 'private';

export interface TourSpec {
  /** Stable key — the year, e.g. "2028"; the store derives the id from it. */
  key: string;
  name: string;
  icon: string;
  year: number;
}

export interface GigSpec {
  title: string;
  startsAt: string;
  endsAt: string;
  getInAt: string;
  soundCheckAt: string;
  venue: string;
  address: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
  status: GigStatus;
  tourKey: string;
  setlist: string;
  rider: string;
  kit: string;
}

export function tourKey(year: number): string {
  return String(year);
}

export function makeTourSpec(year: number): TourSpec {
  return { key: tourKey(year), name: `Tour ${year}`, icon: '🎸', year };
}

const CLUBS = [
  { name: 'The Anchor', address: '14 Harbour Street, Bergen' },
  { name: 'The Corner Pub', address: '1 Sample Street, Oslo' },
  { name: 'Folk & Fiddle Club', address: '22 Mill Lane, Trondheim' },
  { name: 'The Listening Room', address: '8 Vinyl Street, Stavanger' },
  { name: 'Harbour Brewery', address: '3 Dockside Road, Bergen' },
  { name: 'Smoke & Strings', address: '41 Church Road, Tromsø' },
  { name: 'The Old Library', address: '5 Bookbinder Row, Aarhus' },
  { name: 'Blue Door Café', address: '19 Market Square, Gothenburg' },
  { name: 'Union Hall', address: '70 Union Street, Edinburgh' },
  { name: 'The Rusty Nail', address: '12 Canal Walk, Dublin' },
];

const FESTIVALS = [
  { name: 'Riverside Folk Festival', address: 'Riverside Park, Main Stage' },
  { name: 'Hilltop Roots Weekend', address: 'Hilltop Farm, Stage 2' },
  { name: 'Lakeside Acoustic Days', address: 'Lake Meadow, Lakeside Stage' },
  { name: 'Midsummer Meadow Fest', address: 'The Meadow, Tent Stage' },
  { name: 'Harvest Moon Festival', address: 'Apple Orchard Grounds' },
  { name: 'Old Town Street Music Days', address: 'Old Town Square' },
  { name: 'Northern Lights Folk Gathering', address: 'Fjord Arena' },
  { name: 'Fiddlers’ Green', address: 'Village Green, Big Top' },
];

const WEDDING_VENUES = [
  { name: 'Hillview Manor', address: '12 Orchard Lane' },
  { name: 'The Boathouse', address: 'Lakeshore Road 3' },
  { name: 'Stonebridge Barn', address: 'Stonebridge Farm' },
  { name: 'Rosewood Hall', address: '27 Rosewood Avenue' },
  { name: 'The Lighthouse', address: 'Cliff Road 1' },
];

const FIRST_NAMES = ['Anna', 'Jonas', 'Maja', 'Erik', 'Ingrid', 'Lars', 'Sofia', 'Mikkel', 'Clara', 'Henrik', 'Thea', 'Oskar', 'Nora', 'Emil', 'Freya', 'Leif'];
const CONTACTS = ['Sam Ortega', 'Priya Nair', 'Lars Holm', 'Mia Lund', 'Kaja Strand', 'Tom Reilly', 'Elin Dahl', 'Rafael Costa', 'Hanne Berg', 'Callum Reid'];

const NOTES: Record<TourKind, string[]> = {
  club: [
    'Two sets of 45 minutes. Drinks on the house. Park in the back alley.',
    'Door opens 19:30. Merch table by the entrance, no commission.',
    'Support act plays 19:30–20:15 — share the backline.',
    'Sold-out last time, expect a full room. Please arrive early for load-in.',
  ],
  festival: [
    '60-minute slot, no encore. Backline provided: drums, bass amp. Crew passes at the gate.',
    'Changeover is tight — be on stage 15 minutes before. Artist catering tent near stage left.',
    '45-minute daytime slot. Bring ear protection for the stage crew, it gets loud.',
    'Camping available for artists. Shuttle from the hotel runs every 30 minutes.',
  ],
  private: [
    'Acoustic set only, quiet during dinner. Dress: smart casual.',
    'First dance song to be confirmed with the couple. Small PA included.',
    'Ceremony music from 15:30, dinner set 18:00–19:30, dance set 20:30.',
  ],
};

/** Small deterministic PRNG so the generated schedule is the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function at(date: Date, hour: number, minute = 0): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Three gigs a year, from this year through `endYear` (2030): a summer festival, a late-summer wedding and an
 * autumn club show — all under that year's single tour ("Tour 2026" … "Tour 2030"). Deterministic, so the schedule is stable.
 */
export function generateGigs(now: Date, endYear = 2030): { tours: TourSpec[]; gigs: GigSpec[] } {
  const rand = mulberry32(20260101);
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const gigs: GigSpec[] = [];
  const tours = new Map<string, TourSpec>();

  /** The first Friday or Saturday on/after `day` of the month. */
  const weekendOf = (year: number, month: number, day: number): Date => {
    const d = new Date(year, month, day);
    while (d.getDay() !== 5 && d.getDay() !== 6) d.setDate(d.getDate() + 1);
    return d;
  };

  const add = (
    kind: TourKind,
    day: Date,
    venue: { name: string; address: string },
    title: string,
    times: { start: number; length: number; getIn: number; check: number },
    refs: { setlist: string; rider: string; kit: string },
  ) => {
    const startsAt = at(day, times.start, 0);
    const endsAt = new Date(startsAt.getTime() + times.length * 60 * 60 * 1000);
    const daysAhead = (startsAt.getTime() - now.getTime()) / 86_400_000;
    // Only upcoming gigs can still be unconfirmed; the further out, the likelier a date is still tentative.
    const status: GigStatus = daysAhead < 0 ? 'confirmed' : daysAhead > 400 && rand() < 0.5 ? 'tentative' : 'confirmed';
    const contact = pick(CONTACTS);
    const [first, last] = contact.split(' ');
    const key = tourKey(startsAt.getFullYear());
    if (!tours.has(key)) tours.set(key, makeTourSpec(startsAt.getFullYear()));
    gigs.push({
      title,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      getInAt: at(day, times.getIn).toISOString(),
      soundCheckAt: at(day, times.check, 15).toISOString(),
      venue: venue.name,
      address: venue.address,
      contactName: kind === 'private' ? `${pick(FIRST_NAMES)} ${last}` : contact,
      contactPhone: `+47 400 00 ${String(Math.floor(rand() * 90) + 10)}`,
      contactEmail: `${first.toLowerCase()}@${slug(venue.name)}.example`,
      notes: pick(NOTES[kind]),
      status,
      tourKey: key,
      ...refs,
    });
  };

  for (let year = now.getFullYear(); year <= endYear; year += 1) {
    const fest = pick(FESTIVALS);
    add('festival', weekendOf(year, 6, 10), fest, fest.name, { start: 15, length: 1.25, getIn: 12, check: 13 }, {
      setlist: 'Festival Set (60 min)',
      rider: 'Festival Full Band',
      kit: 'Festival Booking Kit',
    });

    const [a, b] = [pick(FIRST_NAMES), pick(FIRST_NAMES)];
    add('private', weekendOf(year, 7, 20), pick(WEDDING_VENUES), `Wedding: ${a} & ${b === a ? 'Jon' : b}`, { start: 19, length: 3, getIn: 15, check: 17 }, {
      setlist: 'Wedding Ceremony & Dinner',
      rider: 'Wedding Trio',
      kit: 'Wedding & Events Kit',
    });

    const club = pick(CLUBS);
    add('club', weekendOf(year, 10, 7), club, `Saturday Night at ${club.name}`, { start: 20, length: 2.25, getIn: 17, check: 18 }, {
      setlist: rand() < 0.5 ? 'Saturday Night Gig' : 'Pub Singalong',
      rider: 'Standard Stage Plot',
      kit: 'Venue One-Sheet',
    });
  }

  gigs.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  return { tours: [...tours.values()].sort((x, y) => x.year - y.year), gigs };
}
