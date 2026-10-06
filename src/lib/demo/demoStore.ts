import type {
  Band,
  Gig,
  InputList,
  PressKit,
  Setlist,
  Song,
  SongList,
  StageplotItem,
  Tour,
  LyricNoteDocument,
} from '../../types';
import type { User } from '../../context/AuthContext';
import type { SongAttachment } from '../songAttachments';
import type { TrashListItem } from '../../components/TrashView';
import type { PressKitImage, PublicTourDate } from '../dataClient/types';
import { appOrigin } from '../appOrigin';
import { generateId } from '../uuid';
import {
  EXTRA_SONGS,
  PRESS_KIT_SPECS,
  RIDER_SPECS,
  STANDARD_PLOT,
  SETLIST_SPECS,
  SONGLIST_SPECS,
  demoImage,
  demoLogo,
  generateGigs,
  makeTourSpec,
  tourKey,
  type ImageKind,
  type TourKind,
  type TourSpec,
} from './demoSeedData';
import type { BandLogoAsset } from '../bandLogos';
import type { SongRecording } from '../songRecordings';

const STORAGE_KEY = 'gigboy-demo-store';
/** Bump when the seeded sample data changes, so returning visitors get the new content. */
const SEED_VERSION = 5;
const SESSION_KEY = 'gigboy-demo-session';
const DEMO_USER_ID = 'demo-user';
const DEMO_BAND_ID = 'demo-band';
const OTHER_MEMBER_ID = 'demo-member-2';

/**
 * The public GitHub Pages demo sets `VITE_DEMO_AUTOLOGIN=true` so visitors land
 * straight in the app. `npm run dev:demo` leaves it unset, so the login page is
 * shown and any email/password signs you in against the seeded demo data.
 */
const DEMO_AUTOLOGIN = import.meta.env.VITE_DEMO_AUTOLOGIN === 'true';

export function isDemoSignedIn(): boolean {
  if (DEMO_AUTOLOGIN) return true;
  try {
    return localStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemoSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SESSION_KEY, '1');
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable (private browsing) — session lasts until reload.
  }
}

/** Simulates network latency so loading states in the UI look/feel real. */
export function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let nextId = 1000;
// The counter restarts on every page load, but ids are persisted in localStorage — without a per-load salt an item
// created in a later session could reuse an id that's already in the saved store.
const idSalt = Math.random().toString(36).slice(2, 6);
function genId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${idSalt}${nextId}`;
}

interface TrashEntry {
  trashId: string;
  itemType: TrashListItem['itemType'];
  name: string;
  deletedAt: string;
  purgeAt: string;
  /** Internal bookkeeping so restore can put the item back where it came from. */
  songId?: string;
  payload: unknown;
}

interface DemoState {
  seedVersion?: number;
  /** Public press-kit share links. Persisted with the rest of the demo so a link opened in a new tab still resolves. */
  pressKitShares?: Array<{ kitId: string; token: string }>;
  user: User;
  band: Band;
  songs: Song[];
  songLists: SongList[];
  setlists: Setlist[];
  riders: InputList[];
  tours: Tour[];
  gigs: Gig[];
  pressKits: PressKit[];
  pressKitImages: PressKitImage[];
  bandLogos: BandLogoAsset[];
  attachments: Record<string, SongAttachment[]>;
  recordings: Record<string, SongRecording[]>;
  handNotes: Record<string, LyricNoteDocument[]>;
  /** Per-song personal transpose override for the demo user, keyed by song id. */
  songTranspose: Record<string, number>;
  /** Per-band chord voicing overrides. */
  chordVoicings: Array<{ instrument: 'guitar' | 'ukulele'; chordName: string; frets: number[] }>;
  /** Append-only song edit history, keyed by song id (newest last). */
  songRevisions: Record<string, DemoSongRevision[]>;
  /** Comments on recordings, keyed by recording id. */
  recordingComments: Record<string, DemoRecordingComment[]>;
  trash: TrashEntry[];
}

export interface DemoRecordingComment {
  id: string;
  recordingId: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
  authorAvatar: string | null;
  atMs: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoSongRevision {
  id: string;
  createdAt: string;
  editorUserId: string | null;
  editorDisplayName: string | null;
  editorAvatar: string | null;
  snapshot: Record<string, unknown>;
  changed: string[];
}

const now = () => new Date().toISOString();
/** An ISO time `daysAhead` days from now at the given local hour/minute, so the seeded gig is always upcoming. */
function gigTime(daysAhead: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
const purgeDate = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function seedRiderItems(): StageplotItem[] {
  return STANDARD_PLOT.map((item) => ({ ...item, id: genId('sp') }));
}

function seedSongs(): Song[] {
  const songs: Array<Pick<Song, 'title' | 'artist' | 'language' | 'key' | 'tempo' | 'timeSignature' | 'durationSeconds' | 'chordpro'>> = [
    {
      title: 'Amazing Grace',
      artist: 'Traditional',
      language: 'en',
      key: 'G',
      tempo: 72,
      timeSignature: '3/4',
      durationSeconds: 258,
      chordpro: `{title: Amazing Grace}
{artist: Traditional}
{key: G}
{tempo: 72}

{start_of_verse}
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [Em]saved a [D]wretch like [G]me [D]
I [G]once was [G7]lost, but [C]now am [G]found
Was [Em]blind, but [D]now I [G]see
{end_of_verse}

{start_of_verse}
'Twas [G]grace that [G7]taught my [C]heart to [G]fear
And [Em]grace my [D]fears re[G]lieved [D]
How [G]precious [G7]did that [C]grace ap[G]pear
The [Em]hour I [D]first be[G]lieved
{end_of_verse}`,
    },
    {
      title: 'Scarborough Fair',
      artist: 'Traditional',
      language: 'en',
      key: 'Dm',
      tempo: 84,
      timeSignature: '3/4',
      durationSeconds: 195,
      chordpro: `{title: Scarborough Fair}
{artist: Traditional}
{key: Dm}
{tempo: 84}

{start_of_tab}
e|------1-----|------------|------1-----|------------|
B|----3---3---|------1-----|----3---3---|------1-----|
G|--2-------2-|----0---0---|--2-------2-|----2---2---|
D|0-----------|--2-------2-|0-----------|--2-------2-|
A|------------|3-----------|------------|0-----------|
E|------------|------------|------------|------------|
{end_of_tab}

{start_of_verse}
Are you [Dm]going to [C]Scarborough [Dm]Fair?
[C]Parsley, [Dm]sage, rose[F]mary and [Dm]thyme
[Dm]Remember [C]me to [Dm]one who lives [Am]there
[C]She once [Dm]was a [Am]true love of [Dm]mine
{end_of_verse}

{start_of_verse}
Tell her to [Dm]make me a [C]cambric [Dm]shirt
[C]Parsley, [Dm]sage, rose[F]mary and [Dm]thyme
[Dm]Without no [C]seam nor [Dm]needlework [Am]
[C]Then she'll [Dm]be a [Am]true love of [Dm]mine
{end_of_verse}`,
    },
    {
      title: 'House of the Rising Sun',
      artist: 'Traditional',
      language: 'en',
      key: 'Am',
      tempo: 120,
      timeSignature: '6/8',
      durationSeconds: 271,
      chordpro: `{title: House of the Rising Sun}
{artist: Traditional}
{key: Am}
{tempo: 120}

{start_of_tab}
e|------------|------------|------2-----|------1-----|
B|------1-----|------1-----|----3---3---|----1---1---|
G|----2---2---|----0---0---|--2-------2-|--2-------2-|
D|--2-------2-|--2-------2-|0-----------|3-----------|
A|0-----------|3-----------|------------|------------|
E|------------|------------|------------|------------|
{end_of_tab}

{start_of_verse}
There [Am]is a [C]house in [D]New Or[F]leans
They [Am]call the [C]Rising [E7]Sun [E7]
And it's [Am]been the [C]ruin of [D]many a poor [F]boy
And [Am]God I [E7]know I'm [Am]one
{end_of_verse}

{start_of_chorus}
My [Am]mother was a [C]tailor
She [D]sewed my new blue [F]jeans
My [Am]father was a [C]gamblin' man
Down [Am]in New Or[E7]leans [Am]
{end_of_chorus}`,
    },
    {
      title: 'Auld Lang Syne',
      artist: 'Robert Burns',
      language: 'en',
      key: 'D',
      tempo: 100,
      timeSignature: '4/4',
      durationSeconds: 143,
      chordpro: `{title: Auld Lang Syne}
{artist: Robert Burns}
{key: D}
{tempo: 100}

{start_of_verse}
Should [D]auld ac[G]quaintance [D]be for[A]got
And [D]never [G]brought to [A]mind [D]
Should [D]auld ac[G]quaintance [D]be for[A]got
And [D]days of [A]auld lang [D]syne
{end_of_verse}

{start_of_chorus}
For [D]auld lang [G]syne, my [D]dear
For [A]auld lang [D]syne
We'll [D]take a cup of [G]kindness [D]yet
For [A]auld lang [D]syne
{end_of_chorus}`,
    },
    {
      title: 'Danny Boy',
      artist: 'Traditional (Irish)',
      language: 'en',
      key: 'C',
      tempo: 66,
      timeSignature: '4/4',
      durationSeconds: 224,
      chordpro: `{title: Danny Boy}
{artist: Traditional (Irish)}
{key: C}
{tempo: 66}

{start_of_verse}
Oh [C]Danny boy, the [F]pipes, the [C]pipes are [G]calling
From [C]glen to [Am]glen and [F]down the [C]mountain[G]side
The [C]summer's [F]gone, and [C]all the [Am]roses [D]falling
'Tis [G]you, 'tis [G7]you must [C]go and [G]I must [C]bide
{end_of_verse}`,
    },
    {
      title: 'Wildwood Flower',
      artist: 'The Carter Family',
      language: 'en',
      key: 'C',
      tempo: 96,
      timeSignature: '4/4',
      durationSeconds: 168,
      chordpro: `{title: Wildwood Flower}
{artist: The Carter Family}
{key: C}
{tempo: 96}

{start_of_verse}
Oh [C]I'll twine with my [F]mingles and [C]waving black [G7]hair
With the [C]roses so [F]red and the [C]lilies so [G7]fair
And the [C]myrtle so [F]bright with the [C]emerald [G7]hue
And the [C]pale and the [F]leader and [C]eyes look like [G7]blue
{end_of_verse}`,
    },
  ];

  return [...songs, ...EXTRA_SONGS].map((song, i) => ({
    id: genId('song'),
    sortOrder: i,
    createdAt: now(),
    updatedAt: now(),
    tags: i === 0 ? ['hymn', 'set-opener'] : undefined,
    ...song,
  }));
}

/** Stable id for a generated tour, derived from its key (e.g. "festival-2028"). */
const tourIdFor = (key: string) => `tour-${key}`;

/** The five hand-written gigs near "now", so the app always has something upcoming, past, tentative and cancelled. */
function seedCoreGigs(refs: { setlistId?: string; riderId?: string; pressKitId?: string }): Array<{ kind: TourKind; gig: Gig }> {
  const { setlistId, riderId, pressKitId } = refs;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const common = { timezone, createdAt: now(), updatedAt: now() };
  const gigs: Gig[] = (() => {
  return [
    {
      id: genId('gig'),
      title: 'Saturday Night at The Corner Pub',
      startsAt: gigTime(7, 21, 0),
      endsAt: gigTime(7, 23, 30),
      getInAt: gigTime(7, 17, 0),
      soundCheckAt: gigTime(7, 18, 30),
      venue: 'The Corner Pub',
      address: '1 Sample Street',
      contactName: 'Sam Ortega (venue manager)',
      contactPhone: '+47 400 00 001',
      contactEmail: 'sam@cornerpub.example',
      notes: 'Park in the back alley. Two sets of 45 minutes. Drinks on the house.',
      setlistId,
      riderId,
      pressKitId,
      status: 'confirmed',
      ...common,
    },
    {
      id: genId('gig'),
      title: 'Riverside Folk Festival',
      startsAt: gigTime(21, 15, 30),
      endsAt: gigTime(21, 16, 30),
      getInAt: gigTime(21, 12, 0),
      soundCheckAt: gigTime(21, 13, 45),
      venue: 'Riverside Park, Main Stage',
      address: 'Festival Grounds, Gate B',
      contactName: 'Priya Nair (stage manager)',
      contactPhone: '+47 400 00 002',
      contactEmail: 'stage@riversidefolk.example',
      notes: '60-minute slot, no encore. Backline provided: drums, bass amp. Crew passes at Gate B.',
      setlistId,
      riderId,
      pressKitId,
      status: 'confirmed',
      ...common,
    },
    {
      id: genId('gig'),
      title: 'Wedding: Anna & Jonas',
      startsAt: gigTime(35, 19, 0),
      endsAt: gigTime(35, 22, 0),
      getInAt: gigTime(35, 16, 0),
      soundCheckAt: gigTime(35, 17, 15),
      venue: 'Hillview Manor',
      address: '12 Orchard Lane',
      contactName: 'Anna Berg (bride)',
      contactPhone: '+47 400 00 003',
      contactEmail: 'anna@example.com',
      notes: 'First dance song TBC. Acoustic set only, quiet during dinner. Dress: smart casual.',
      setlistId,
      status: 'tentative',
      ...common,
    },
    {
      id: genId('gig'),
      title: 'Listening Room Session',
      startsAt: gigTime(49, 20, 0),
      endsAt: gigTime(49, 21, 30),
      getInAt: gigTime(49, 18, 30),
      soundCheckAt: gigTime(49, 19, 15),
      venue: 'The Listening Room',
      address: '8 Vinyl Street',
      contactName: 'Lars Holm (promoter)',
      contactPhone: '+47 400 00 004',
      contactEmail: 'lars@listeningroom.example',
      notes: 'Cancelled by the venue — roof repairs. Promoter will offer a new date in spring.',
      pressKitId,
      status: 'cancelled',
      ...common,
    },
    {
      id: genId('gig'),
      title: 'Harbour Brewery Opening Night',
      startsAt: gigTime(-14, 20, 30),
      endsAt: gigTime(-14, 22, 30),
      getInAt: gigTime(-14, 17, 30),
      soundCheckAt: gigTime(-14, 19, 0),
      venue: 'Harbour Brewery',
      address: '3 Dockside Road',
      contactName: 'Mia Lund (events)',
      contactPhone: '+47 400 00 005',
      contactEmail: 'events@harbourbrewery.example',
      notes: 'Played two sets. Good crowd, invoice sent.',
      setlistId,
      riderId,
      status: 'confirmed',
      ...common,
    },
  ];
  })();
  const kindByTitle: Record<string, TourKind> = {
    'Saturday Night at The Corner Pub': 'club',
    'Riverside Folk Festival': 'festival',
    'Wedding: Anna & Jonas': 'private',
    'Listening Room Session': 'club',
    'Harbour Brewery Opening Night': 'club',
  };
  return gigs.map((gig) => ({
    kind: kindByTitle[gig.title] ?? 'club',
    gig,
  }));
}

function seedPressKitImages(): Record<ImageKind, PressKitImage> {
  const kinds: ImageKind[] = ['stage', 'crowd', 'portrait', 'poster', 'venue', 'landscape'];
  const entries = kinds.map((kind) => {
    const img = demoImage(kind);
    const image: PressKitImage = {
      id: genId('pkimg'),
      title: img.title,
      url: img.url,
      thumbUrl: img.url,
      mimeType: 'image/svg+xml',
      sizeBytes: img.sizeBytes,
      thumbSizeBytes: img.sizeBytes,
      createdAt: now(),
      createdBy: DEMO_USER_ID,
    };
    return [kind, image] as const;
  });
  return Object.fromEntries(entries) as Record<ImageKind, PressKitImage>;
}

function seed(): DemoState {
  const user: User = {
    id: DEMO_USER_ID,
    email: 'demo@example.com',
    username: 'demo',
    avatar: null,
    fullName: 'Demo Musician',
    role: 'member',
    storageQuotaBytes: 5 * 1024 * 1024 * 1024,
  };

  const songs = seedSongs();
  const songIdByTitle = new Map(songs.map((song) => [song.title, song.id]));
  const idsFor = (titles: string[]) => titles.map((t) => songIdByTitle.get(t)).filter((id): id is string => Boolean(id));

  const logo = demoLogo();
  const logoAsset: BandLogoAsset = {
    id: genId('logo'),
    url: logo.url,
    thumbUrl: logo.url,
    mimeType: 'image/svg+xml',
    sizeBytes: logo.sizeBytes,
    thumbSizeBytes: logo.sizeBytes,
    createdAt: now(),
    createdBy: DEMO_USER_ID,
  };

  const band: Band = {
    id: DEMO_BAND_ID,
    name: 'The Gigboy Demo Band',
    description: 'A sample band so you can see how Gigboy feels before you self-host it.',
    icon: '🎸',
    logo: logoAsset.url,
    ownerId: DEMO_USER_ID,
    memberIds: [DEMO_USER_ID, OTHER_MEMBER_ID],
    memberRoles: { [DEMO_USER_ID]: 'editor', [OTHER_MEMBER_ID]: 'editor' },
    memberEmails: { [DEMO_USER_ID]: user.email, [OTHER_MEMBER_ID]: 'bandmate@example.com' },
    memberUsernames: { [DEMO_USER_ID]: 'demo', [OTHER_MEMBER_ID]: 'bandmate' },
    memberFullNames: { [DEMO_USER_ID]: user.fullName ?? '', [OTHER_MEMBER_ID]: 'Sample Bandmate' },
    memberAvatars: {},
    createdAt: now(),
    updatedAt: now(),
  };

  const songLists: SongList[] = [
    { id: genId('sl'), name: 'Full Songbook', songIds: songs.map((s) => s.id), sortOrder: 0 },
    ...SONGLIST_SPECS.map((spec, i) => ({
      id: genId('sl'),
      name: spec.name,
      icon: spec.icon,
      songIds: idsFor(spec.titles),
      sortOrder: i + 1,
    })),
  ];

  const setlists: Setlist[] = [
    {
      id: genId('setlist'),
      name: 'Saturday Night Gig',
      songIds: songs.slice(0, 4).map((s) => s.id),
      songNotes: { [songs[0].id]: 'Open acoustic, no drums' },
      createdAt: now(),
      updatedAt: now(),
      sortOrder: 0,
    },
    ...SETLIST_SPECS.map((spec, i): Setlist => ({
      id: genId('setlist'),
      name: spec.name,
      icon: spec.icon,
      songIds: idsFor(spec.titles),
      songNotes: Object.fromEntries(
        Object.entries(spec.notes ?? {}).flatMap(([title, note]) => {
          const id = songIdByTitle.get(title);
          return id ? [[id, note]] : [];
        }),
      ),
      createdAt: now(),
      updatedAt: now(),
      sortOrder: i + 1,
    })),
  ];

  const riders: InputList[] = [
    {
      id: genId('rider'),
      name: 'Standard Stage Plot',
      items: seedRiderItems(),
      hospitalityNotes: 'Water and a light snack for 4 backstage, thanks!',
      logisticsNotes: 'Load-in 2 hours before doors. On-site contact: venue manager.',
      publicShareEnabled: false,
      bandName: band.name,
      createdAt: now(),
      updatedAt: now(),
      sortOrder: 0,
    },
    ...RIDER_SPECS.map((spec, i): InputList => ({
      id: genId('rider'),
      name: spec.name,
      icon: spec.icon,
      items: spec.items.map((item) => ({ ...item, id: genId('sp') })),
      hospitalityNotes: spec.hospitalityNotes,
      logisticsNotes: spec.logisticsNotes,
      publicShareEnabled: i === 0,
      bandName: band.name,
      createdAt: now(),
      updatedAt: now(),
      sortOrder: i + 1,
    })),
  ];

  // Tours: one per year, from the generated schedule plus the hand-written core gigs.
  const generated = generateGigs(new Date());
  const core = seedCoreGigs({});
  const tourSpecs = new Map<string, TourSpec>(generated.tours.map((t) => [t.key, t]));
  for (const { gig } of core) {
    const year = new Date(gig.startsAt).getFullYear();
    if (!tourSpecs.has(tourKey(year))) tourSpecs.set(tourKey(year), makeTourSpec(year));
  }
  const tours: Tour[] = [...tourSpecs.values()]
    .sort((a, b) => a.year - b.year)
    .map((spec, i) => ({
      id: tourIdFor(spec.key),
      name: spec.name,
      icon: spec.icon,
      sortOrder: i,
      createdAt: now(),
      updatedAt: now(),
    }));
  const thisYear = new Date().getFullYear();
  const images = seedPressKitImages();
  const pressKitImages = Object.values(images);

  const baseKit = {
    videoUrls: [] as string[],
    selectedVideoUrls: [] as string[],
    presaveUrls: [] as string[],
    selectedPresaveUrls: [] as string[],
    createdAt: now(),
  };
  const pressKits: PressKit[] = [
    {
      ...baseKit,
      id: genId('presskit'),
      name: 'Electronic Press Kit',
      richText:
        '<p>The Gigboy Demo Band is a traditional folk outfit playing timeless songs with modern warmth. ' +
        'Available for weddings, festivals, and listening rooms.</p>',
      imageIds: [images.portrait.id, images.stage.id, images.crowd.id],
    },
    ...PRESS_KIT_SPECS.map((spec): PressKit => ({
      ...baseKit,
      id: genId('presskit'),
      name: spec.name,
      icon: spec.icon,
      richText: spec.richText,
      imageIds: spec.images.map((kind) => images[kind].id),
    })),
  ];

  // Gigs: core gigs near today plus the generated schedule through 2030, each pointing at real setlists/riders/kits by name.
  const idByName = (list: Array<{ id: string; name: string }>, name: string) => list.find((x) => x.name === name)?.id;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const coreGigs = seedCoreGigs({
    setlistId: setlists[0].id,
    riderId: riders[0].id,
    pressKitId: pressKits[0].id,
  }).map(({ gig }) => ({ ...gig, tourId: tourIdFor(tourKey(new Date(gig.startsAt).getFullYear())) }));
  const generatedGigs: Gig[] = generated.gigs.map((g) => ({
    id: genId('gig'),
    tourId: tourIdFor(g.tourKey),
    title: g.title,
    startsAt: g.startsAt,
    endsAt: g.endsAt,
    getInAt: g.getInAt,
    soundCheckAt: g.soundCheckAt,
    timezone,
    venue: g.venue,
    address: g.address,
    contactName: g.contactName,
    contactPhone: g.contactPhone,
    contactEmail: g.contactEmail,
    notes: g.notes,
    setlistId: idByName(setlists, g.setlist),
    riderId: idByName(riders, g.rider),
    pressKitId: idByName(pressKits, g.kit),
    status: g.status,
    createdAt: now(),
    updatedAt: now(),
  }));
  const gigs = [...coreGigs, ...generatedGigs];

  // A booking kit lists the near future — this year's and next year's confirmed, upcoming, non-private gigs —
  // not five years of dates. (The Electronic Press Kit lists them too; the wedding kit lists none.)
  const nearTourIds = new Set(
    [...tourSpecs.values()].filter((t) => t.year >= thisYear && t.year <= thisYear + 1).map((t) => tourIdFor(t.key)),
  );
  const nowMs = Date.now();
  const publicGigIds = gigs
    .filter((g) => g.tourId && nearTourIds.has(g.tourId) && g.status === 'confirmed' && !g.title.startsWith('Wedding:'))
    .filter((g) => new Date(g.startsAt).getTime() >= nowMs)
    .map((g) => g.id);
  pressKits[0].gigIds = publicGigIds;
  PRESS_KIT_SPECS.forEach((spec, i) => {
    pressKits[i + 1].gigIds = spec.listDates ? publicGigIds : [];
  });

  return {
    seedVersion: SEED_VERSION,
    pressKitShares: [],
    user,
    band,
    songs,
    songLists,
    setlists,
    riders,
    tours,
    gigs,
    pressKits,
    pressKitImages,
    bandLogos: [logoAsset],
    attachments: {},
    recordings: {},
    handNotes: {},
    songTranspose: {},
    chordVoicings: [],
    songRevisions: {},
    recordingComments: {},
    trash: [],
  };
}

let state: DemoState = load();

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as DemoState;
    if (!parsed?.user || !parsed?.band) return seed();
    // The demo's sample content grows over time; a store saved by an older version is re-seeded.
    if (parsed.seedVersion !== SEED_VERSION) return seed();
    parsed.pressKitShares ??= [];
    return parsed;
  } catch {
    return seed();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable (private browsing) — demo still works for the session.
  }
}

export function resetDemoStore(): void {
  state = seed();
  persist();
}

export function getDemoUser(): User {
  return state.user;
}

export function getDemoBand(): Band {
  return state.band;
}

function assertBand(bandId: string): void {
  if (bandId !== state.band.id) {
    throw new Error('Band not found in demo data.');
  }
}

// ---- Bands ----

export function listBands(): Band[] {
  return [state.band];
}

// ---- Generic band-scoped CRUD (songs / songLists / setlists / riders / pressKits) ----

function makeCrud<T extends { id: string }>(
  key: 'songs' | 'songLists' | 'setlists' | 'riders' | 'tours' | 'gigs' | 'pressKits',
  itemType: TrashListItem['itemType'],
  nameOf: (item: T) => string
) {
  return {
    list(bandId: string): T[] {
      assertBand(bandId);
      return state[key] as unknown as T[];
    },
    create(bandId: string, item: T): T {
      assertBand(bandId);
      const created = { ...item, id: item.id || genId(key), createdAt: now(), updatedAt: now() } as T;
      (state[key] as unknown as T[]).push(created);
      persist();
      return created;
    },
    update(bandId: string, item: T): T {
      assertBand(bandId);
      const list = state[key] as unknown as T[];
      const idx = list.findIndex((i) => i.id === item.id);
      const updated = { ...item, updatedAt: now() } as T;
      if (idx === -1) {
        list.push(updated);
      } else {
        list[idx] = updated;
      }
      persist();
      return updated;
    },
    remove(bandId: string, id: string): void {
      assertBand(bandId);
      const list = state[key] as unknown as T[];
      const idx = list.findIndex((i) => i.id === id);
      if (idx === -1) return;
      const [removed] = list.splice(idx, 1);
      state.trash.push({
        trashId: genId('trash'),
        itemType,
        name: nameOf(removed),
        deletedAt: now(),
        purgeAt: purgeDate(),
        payload: removed,
      });
      persist();
    },
  };
}

const rawSongsCrud = makeCrud<Song>('songs', 'song', (s) => s.title);

/** Song CRUD that also records edit-history revisions (mirrors the server's afterWrite hook). */
export const songsCrud = {
  ...rawSongsCrud,
  create(bandId: string, item: Song): Song {
    const created = rawSongsCrud.create(bandId, item);
    recordDemoSongRevision(created);
    return created;
  },
  update(bandId: string, item: Song): Song {
    const updated = rawSongsCrud.update(bandId, item);
    recordDemoSongRevision(updated);
    return updated;
  },
};

export const songListsCrud = makeCrud<SongList>('songLists', 'songlist', (s) => s.name);
export const setlistsCrud = makeCrud<Setlist>('setlists', 'setlist', (s) => s.name);
export const ridersCrud = makeCrud<InputList>('riders', 'technicalRider', (r) => r.name);
const rawToursCrud = makeCrud<Tour>('tours', 'tour', (t) => t.name);

/** Tour CRUD that also ungroups the tour's gigs on delete (mirrors the server's ON DELETE SET NULL). */
export const toursCrud = {
  ...rawToursCrud,
  remove(bandId: string, id: string): void {
    rawToursCrud.remove(bandId, id);
    for (const g of state.gigs) if (g.tourId === id) delete g.tourId;
    persist();
  },
};
export const gigsCrud = makeCrud<Gig>('gigs', 'gig', (g) => g.title);
export const pressKitsCrud = makeCrud<PressKit>('pressKits', 'pressKit', (p) => p.name);

// ---- Attachments ----

export function listAttachments(bandId: string, songId: string): SongAttachment[] {
  assertBand(bandId);
  return state.attachments[songId] ?? [];
}

export function addAttachment(bandId: string, songId: string, file: File): SongAttachment {
  assertBand(bandId);
  const attachment: SongAttachment = {
    id: genId('attachment'),
    name: file.name,
    storagePath: '',
    downloadUrl: URL.createObjectURL(file),
    sizeBytes: file.size,
    mimeType: file.type || 'application/pdf',
    createdAt: now(),
    uploader: { userId: state.user.id, displayName: state.user.fullName ?? state.user.username ?? 'You', avatar: null },
  };
  state.attachments[songId] = [...(state.attachments[songId] ?? []), attachment];
  persist();
  return attachment;
}

export function renameAttachment(bandId: string, songId: string, attachmentId: string, name: string): void {
  assertBand(bandId);
  const list = state.attachments[songId] ?? [];
  const item = list.find((a) => a.id === attachmentId);
  if (item) item.name = name;
  persist();
}

export function removeAttachment(bandId: string, songId: string, attachmentId: string): void {
  assertBand(bandId);
  const list = state.attachments[songId] ?? [];
  const idx = list.findIndex((a) => a.id === attachmentId);
  if (idx === -1) return;
  const [removed] = list.splice(idx, 1);
  state.trash.push({
    trashId: genId('trash'),
    itemType: 'attachment',
    name: removed.name,
    deletedAt: now(),
    purgeAt: purgeDate(),
    songId,
    payload: removed,
  });
  persist();
}

// ---- Trash ----

export function listTrash(bandId: string): TrashListItem[] {
  assertBand(bandId);
  return state.trash.map(({ trashId, itemType, name, deletedAt, purgeAt }) => ({
    trashId,
    itemType,
    name,
    deletedAt,
    purgeAt,
  }));
}

function crudListFor(itemType: TrashEntry['itemType']): { list: unknown[] } | null {
  const map: Partial<Record<TrashEntry['itemType'], keyof DemoState>> = {
    song: 'songs',
    songlist: 'songLists',
    setlist: 'setlists',
    technicalRider: 'riders',
    gig: 'gigs',
    tour: 'tours',
    pressKit: 'pressKits',
  };
  const key = map[itemType];
  if (!key) return null;
  return { list: state[key] as unknown as unknown[] };
}

export function restoreTrash(bandId: string): (trashId: string) => string | null {
  return (trashId: string) => {
    assertBand(bandId);
    const idx = state.trash.findIndex((t) => t.trashId === trashId);
    if (idx === -1) return 'Item not found.';
    const [entry] = state.trash.splice(idx, 1);

    if (entry.itemType === 'attachment' && entry.songId) {
      state.attachments[entry.songId] = [...(state.attachments[entry.songId] ?? []), entry.payload as SongAttachment];
    } else if (entry.itemType === 'pressKitImage') {
      state.pressKitImages.push(entry.payload as PressKitImage);
    } else if (entry.itemType === 'bandLogo') {
      state.bandLogos.push(entry.payload as BandLogoAsset);
    } else {
      const target = crudListFor(entry.itemType);
      if (target) target.list.push(entry.payload);
    }
    persist();
    return null;
  };
}

export function removeTrashPermanently(bandId: string): (trashId: string) => string | null {
  return (trashId: string) => {
    assertBand(bandId);
    const idx = state.trash.findIndex((t) => t.trashId === trashId);
    if (idx === -1) return 'Item not found.';
    state.trash.splice(idx, 1);
    persist();
    return null;
  };
}

export function emptyTrash(bandId: string): string | null {
  assertBand(bandId);
  state.trash = [];
  persist();
  return null;
}

// ---- Press kit images ----

export function listPressKitImages(bandId: string): PressKitImage[] {
  assertBand(bandId);
  return state.pressKitImages;
}

export function addPressKitImage(bandId: string, file: File, thumbnail: Blob): PressKitImage {
  assertBand(bandId);
  const image: PressKitImage = {
    id: genId('pkimg'),
    title: file.name,
    url: URL.createObjectURL(file),
    thumbUrl: URL.createObjectURL(thumbnail),
    mimeType: file.type || 'image/jpeg',
    sizeBytes: file.size,
    thumbSizeBytes: thumbnail.size,
    createdAt: now(),
    createdBy: state.user.id,
  };
  state.pressKitImages.push(image);
  persist();
  return image;
}

export function removePressKitImage(bandId: string, imageId: string): void {
  assertBand(bandId);
  const idx = state.pressKitImages.findIndex((i) => i.id === imageId);
  if (idx === -1) return;
  const [removed] = state.pressKitImages.splice(idx, 1);
  state.pressKits.forEach((kit) => {
    kit.imageIds = kit.imageIds.filter((id) => id !== imageId);
  });
  state.trash.push({
    trashId: genId('trash'),
    itemType: 'pressKitImage',
    name: removed.title,
    deletedAt: now(),
    purgeAt: purgeDate(),
    payload: removed,
  });
  persist();
}

// ---- Calendar feed (per-member iCal subscription) ----

// The demo has no server to serve a real .ics, so the URL is a placeholder that shows the UI flow.
let calendarFeedToken: string | null = null;

function demoFeed(token: string): { token: string; feedUrl: string } {
  return { token, feedUrl: `${window.location.origin}/api/public/calendar/${token}.ics` };
}

export function getCalendarFeed(bandId: string): { token: string; feedUrl: string } | null {
  assertBand(bandId);
  return calendarFeedToken ? demoFeed(calendarFeedToken) : null;
}

export function createCalendarFeed(bandId: string): { token: string; feedUrl: string } {
  assertBand(bandId);
  calendarFeedToken ??= genId('feed');
  return demoFeed(calendarFeedToken);
}

export function regenerateCalendarFeed(bandId: string): { token: string; feedUrl: string } {
  assertBand(bandId);
  calendarFeedToken = genId('feed');
  return demoFeed(calendarFeedToken);
}

export function disableCalendarFeed(bandId: string): void {
  assertBand(bandId);
  calendarFeedToken = null;
}

// ---- Press kit shares ----

const shareUrl = (token: string) => `${appOrigin()}/public/press-kit/${token}`;

function shares(): Array<{ kitId: string; token: string }> {
  return (state.pressKitShares ??= []);
}

export function getPressKitShare(bandId: string, kitId: string): { token: string; publicUrl: string } | null {
  assertBand(bandId);
  const share = shares().find((s) => s.kitId === kitId);
  return share ? { token: share.token, publicUrl: shareUrl(share.token) } : null;
}

export function createPressKitShare(bandId: string, kitId: string): { token: string; publicUrl: string } {
  assertBand(bandId);
  const existing = shares().find((s) => s.kitId === kitId);
  // A random token, not genId(): that counter restarts every page load and would collide with saved shares.
  const token = existing?.token ?? generateId();
  if (!existing) {
    shares().push({ kitId, token });
    persist();
  }
  return { token, publicUrl: shareUrl(token) };
}

export function disablePressKitShare(bandId: string, kitId: string): void {
  assertBand(bandId);
  const idx = shares().findIndex((s) => s.kitId === kitId);
  if (idx !== -1) {
    shares().splice(idx, 1);
    persist();
  }
}

export function getPublicPressKit(token: string): { kit: PressKit; bandName: string; bandLogo: string | null; images: PressKitImage[]; tourDates: PublicTourDate[] } | null {
  const share = shares().find((s) => s.token === token);
  if (!share) return null;
  const kit = state.pressKits.find((k) => k.id === share.kitId);
  if (!kit) return null;
  const images = state.pressKitImages.filter((img) => kit.imageIds.includes(img.id));
  // Mirrors the server: only gigs picked on the kit, and of those only confirmed, upcoming ones, with public fields.
  const kitGigs = kit.gigIds ?? [];
  const tourDates: PublicTourDate[] = state.gigs
    .filter((g) => kitGigs.includes(g.id))
    .filter((g) => g.status === 'confirmed')
    .filter((g) => new Date(g.startsAt).getTime() >= Date.now())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((g) => ({
      id: g.id,
      title: g.title,
      startsAt: g.startsAt,
      timezone: g.timezone ?? null,
      venue: g.venue ?? null,
      address: g.address ?? null,
      tourId: g.tourId ?? null,
      tourName: state.tours.find((t) => t.id === g.tourId)?.name ?? null,
    }));
  return { kit, bandName: state.band.name, bandLogo: state.band.logo ?? null, images, tourDates };
}

export function getPublicRider(bandId: string, riderId: string): { rider: InputList; bandName: string; bandLogo: string | null } | null {
  if (bandId !== state.band.id) return null;
  const rider = state.riders.find((r) => r.id === riderId);
  if (!rider || !rider.publicShareEnabled) return null;
  return { rider, bandName: state.band.name, bandLogo: state.band.logo ?? null };
}

// ---- Band logos ----

export function listBandLogos(bandId: string): BandLogoAsset[] {
  assertBand(bandId);
  return state.bandLogos;
}

export function addBandLogo(bandId: string, file: File): BandLogoAsset {
  assertBand(bandId);
  const logo: BandLogoAsset = {
    id: genId('logo'),
    url: URL.createObjectURL(file),
    thumbUrl: URL.createObjectURL(file),
    mimeType: file.type || 'image/png',
    sizeBytes: file.size,
    thumbSizeBytes: file.size,
    createdAt: now(),
    createdBy: state.user.id,
  };
  state.bandLogos.push(logo);
  persist();
  return logo;
}

export function removeBandLogo(bandId: string, logoId: string): void {
  assertBand(bandId);
  const idx = state.bandLogos.findIndex((l) => l.id === logoId);
  if (idx === -1) return;
  const [removed] = state.bandLogos.splice(idx, 1);
  if (state.band.logo === removed.url) state.band.logo = undefined;
  state.trash.push({
    trashId: genId('trash'),
    itemType: 'bandLogo',
    name: 'Band logo',
    deletedAt: now(),
    purgeAt: purgeDate(),
    payload: removed,
  });
  persist();
}

export function selectBandLogo(bandId: string, logoId: string | null): Band {
  assertBand(bandId);
  const logo = logoId ? state.bandLogos.find((l) => l.id === logoId) : null;
  state.band.logo = logo?.url;
  persist();
  return state.band;
}

// ---- Recordings ----

export function listRecordings(bandId: string, songId: string): SongRecording[] {
  assertBand(bandId);
  return (state.recordings[songId] ?? []).map((rec) => ({
    ...rec,
    commentCount: (state.recordingComments?.[rec.id] ?? []).length,
  }));
}

export function addRecording(
  bandId: string,
  songId: string,
  blob: Blob,
  name: string,
  durationMs: number,
  waveformBars?: number[]
): SongRecording {
  assertBand(bandId);
  const recording: SongRecording = {
    id: genId('recording'),
    name: name || 'Recording',
    storagePath: '',
    downloadUrl: URL.createObjectURL(blob),
    durationMs,
    sizeBytes: blob.size,
    mimeType: blob.type || 'audio/webm',
    createdAt: now(),
    recorder: { userId: state.user.id, displayName: state.user.fullName ?? state.user.username ?? 'You', avatar: null },
    waveformBars,
  };
  state.recordings[songId] = [...(state.recordings[songId] ?? []), recording];
  persist();
  return recording;
}

export function removeRecording(bandId: string, songId: string, recordingId: string): void {
  assertBand(bandId);
  state.recordings[songId] = (state.recordings[songId] ?? []).filter((r) => r.id !== recordingId);
  persist();
}

export function renameRecording(bandId: string, songId: string, recordingId: string, name: string): void {
  assertBand(bandId);
  const rec = (state.recordings[songId] ?? []).find((r) => r.id === recordingId);
  if (rec) rec.name = name;
  persist();
}

// ---- Hand notes ----

export function listHandNotes(bandId: string, songId: string): LyricNoteDocument[] {
  assertBand(bandId);
  return state.handNotes[songId] ?? [];
}

export function saveHandNote(bandId: string, songId: string, note: LyricNoteDocument): void {
  assertBand(bandId);
  const notes = state.handNotes[songId] ?? [];
  const idx = notes.findIndex((n) => n.authorUid === note.authorUid);
  if (idx === -1) notes.push(note);
  else notes[idx] = note;
  state.handNotes[songId] = notes;
  persist();
}

export function deleteHandNote(bandId: string, songId: string, authorUid: string): void {
  assertBand(bandId);
  state.handNotes[songId] = (state.handNotes[songId] ?? []).filter((n) => n.authorUid !== authorUid);
  persist();
}

// ---- Recording comments ----

export function listRecordingComments(recordingId: string): DemoRecordingComment[] {
  return [...(state.recordingComments?.[recordingId] ?? [])];
}

export function addRecordingComment(
  recordingId: string,
  input: { body: string; atMs: number | null },
): DemoRecordingComment {
  if (!state.recordingComments) state.recordingComments = {};
  const comment: DemoRecordingComment = {
    id: genId('rc'),
    recordingId,
    authorUserId: state.user.id,
    authorDisplayName: state.user.fullName || state.user.username || null,
    authorAvatar: state.user.avatar ?? null,
    atMs: input.atMs,
    body: input.body,
    createdAt: now(),
    updatedAt: now(),
  };
  state.recordingComments[recordingId] = [...(state.recordingComments[recordingId] ?? []), comment];
  persist();
  return comment;
}

export function deleteRecordingComment(recordingId: string, commentId: string): void {
  state.recordingComments[recordingId] = (state.recordingComments?.[recordingId] ?? []).filter(
    (c) => c.id !== commentId,
  );
  persist();
}

// ---- Per-member transpose ----

export function getSongTranspose(bandId: string, songId: string): number | null {
  assertBand(bandId);
  const value = state.songTranspose?.[songId];
  return typeof value === 'number' ? value : null;
}

export function setSongTranspose(bandId: string, songId: string, transpose: number): number {
  assertBand(bandId);
  if (!state.songTranspose) state.songTranspose = {};
  state.songTranspose[songId] = transpose;
  persist();
  return transpose;
}

export function clearSongTranspose(bandId: string, songId: string): void {
  assertBand(bandId);
  if (state.songTranspose) delete state.songTranspose[songId];
  persist();
}

export function listBandTransposePrefs(bandId: string): Record<string, number> {
  assertBand(bandId);
  return { ...(state.songTranspose ?? {}) };
}

// ---- Band chord voicings ----

type DemoChordVoicing = { instrument: 'guitar' | 'ukulele'; chordName: string; frets: number[] };

export function listChordVoicings(bandId: string): DemoChordVoicing[] {
  assertBand(bandId);
  return [...(state.chordVoicings ?? [])];
}

export function saveChordVoicing(
  bandId: string,
  instrument: 'guitar' | 'ukulele',
  chordName: string,
  frets: number[],
): DemoChordVoicing {
  assertBand(bandId);
  if (!state.chordVoicings) state.chordVoicings = [];
  const entry: DemoChordVoicing = { instrument, chordName, frets };
  const idx = state.chordVoicings.findIndex(
    (v) => v.instrument === instrument && v.chordName === chordName,
  );
  if (idx === -1) state.chordVoicings.push(entry);
  else state.chordVoicings[idx] = entry;
  persist();
  return entry;
}

export function deleteChordVoicing(
  bandId: string,
  instrument: 'guitar' | 'ukulele',
  chordName: string,
): void {
  assertBand(bandId);
  state.chordVoicings = (state.chordVoicings ?? []).filter(
    (v) => !(v.instrument === instrument && v.chordName === chordName),
  );
  persist();
}

// ---- Song revisions (edit history) ----

const REVISION_FIELDS: Array<[keyof Song, string]> = [
  ['title', 'Title'], ['artist', 'Artist'], ['author', 'Author'], ['language', 'Language'],
  ['secondaryLanguages', 'Languages'], ['tags', 'Tags'], ['chordpro', 'Lyrics & chords'],
  ['capo', 'Capo'], ['key', 'Key'], ['tempo', 'Tempo'], ['timeSignature', 'Time signature'],
  ['date', 'Date'], ['durationSeconds', 'Duration'],
];
const REVISION_COALESCE_MS = 10 * 60 * 1000;
const REVISION_CAP = 100;

function songSnapshot(song: Song): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  const record = song as unknown as Record<string, unknown>;
  for (const [key] of REVISION_FIELDS) snap[key] = record[key] ?? null;
  return snap;
}

function normalizeSnapVal(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return JSON.stringify(value ?? null);
}

function snapshotChanged(prev: Record<string, unknown> | null, next: Record<string, unknown>): string[] {
  if (!prev) return ['Created'];
  return REVISION_FIELDS
    .filter(([key]) => normalizeSnapVal(prev[key]) !== normalizeSnapVal(next[key]))
    .map(([, label]) => label);
}

function recordDemoSongRevision(song: Song): void {
  if (!state.songRevisions) state.songRevisions = {};
  const list = state.songRevisions[song.id] ?? [];
  const snapshot = songSnapshot(song);
  const latest = list[list.length - 1];

  if (latest && REVISION_FIELDS.every(([k]) => normalizeSnapVal(latest.snapshot[k]) === normalizeSnapVal(snapshot[k]))) {
    return;
  }

  const changed = snapshotChanged(latest ? latest.snapshot : null, snapshot);
  const nowMs = Date.now();
  const canCoalesce = latest && nowMs - new Date(latest.createdAt).getTime() < REVISION_COALESCE_MS;

  if (canCoalesce) {
    latest.snapshot = snapshot;
    latest.createdAt = now();
    latest.changed = snapshotChanged(list[list.length - 2]?.snapshot ?? null, snapshot);
  } else {
    list.push({
      id: genId('rev'),
      createdAt: now(),
      editorUserId: state.user.id,
      editorDisplayName: state.user.fullName || state.user.username || null,
      editorAvatar: state.user.avatar ?? null,
      snapshot,
      changed,
    });
  }
  if (list.length > REVISION_CAP) list.splice(0, list.length - REVISION_CAP);
  state.songRevisions[song.id] = list;
  persist();
}

export function listSongRevisions(bandId: string, songId: string): DemoSongRevision[] {
  assertBand(bandId);
  return [...(state.songRevisions?.[songId] ?? [])].reverse();
}

export function getSongRevision(bandId: string, songId: string, id: string): DemoSongRevision | null {
  assertBand(bandId);
  return (state.songRevisions?.[songId] ?? []).find((r) => r.id === id) ?? null;
}

export function restoreSongRevision(bandId: string, songId: string, id: string): Song {
  assertBand(bandId);
  const revision = getSongRevision(bandId, songId, id);
  if (!revision) throw new Error('Revision not found.');
  const songs = state.songs;
  const idx = songs.findIndex((s) => s.id === songId);
  if (idx === -1) throw new Error('Song not found.');
  songs[idx] = { ...songs[idx], ...(revision.snapshot as Partial<Song>), updatedAt: now() };
  recordDemoSongRevision(songs[idx]);
  persist();
  return songs[idx];
}

// ---- Storage usage ----

export function getStorageUsage(): { recordingBytes: number; attachmentBytes: number; imageBytes: number; quotaBytes: number } {
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const recordingBytes = sum(Object.values(state.recordings).flat().map((r) => r.sizeBytes));
  const attachmentBytes = sum(Object.values(state.attachments).flat().map((a) => a.sizeBytes));
  const imageBytes = sum(state.pressKitImages.map((i) => i.sizeBytes + i.thumbSizeBytes)) + sum(state.bandLogos.map((l) => l.sizeBytes));
  return { recordingBytes, attachmentBytes, imageBytes, quotaBytes: state.user.storageQuotaBytes };
}
