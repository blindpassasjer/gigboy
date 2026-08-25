import type {
  Band,
  InputList,
  PressKit,
  Setlist,
  Song,
  SongList,
  StageplotItem,
  LyricNoteDocument,
} from '../../types';
import type { User } from '../../context/AuthContext';
import type { SongAttachment } from '../songAttachments';
import type { TrashListItem } from '../../components/TrashView';
import type { PressKitImage } from '../dataClient/types';
import type { BandLogoAsset } from '../bandLogos';
import type { SongRecording } from '../songRecordings';

const STORAGE_KEY = 'gigboy-demo-store';
const DEMO_USER_ID = 'demo-user';
const DEMO_BAND_ID = 'demo-band';
const OTHER_MEMBER_ID = 'demo-member-2';

/** Simulates network latency so loading states in the UI look/feel real. */
export function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let nextId = 1000;
function genId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
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
  user: User;
  band: Band;
  songs: Song[];
  songLists: SongList[];
  setlists: Setlist[];
  riders: InputList[];
  pressKits: PressKit[];
  pressKitImages: PressKitImage[];
  bandLogos: BandLogoAsset[];
  attachments: Record<string, SongAttachment[]>;
  recordings: Record<string, SongRecording[]>;
  handNotes: Record<string, LyricNoteDocument[]>;
  trash: TrashEntry[];
}

const now = () => new Date().toISOString();
const purgeDate = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function seedRiderItems(): StageplotItem[] {
  return [
    { id: genId('sp'), kind: 'vocalMic', label: 'Lead Vox', x: 0.5, y: 0.75, channel: '1', description: 'SM58, boom stand' },
    { id: genId('sp'), kind: 'guitarAmp', label: 'Guitar', x: 0.25, y: 0.6, channel: '2', description: 'Miked amp, SM57' },
    { id: genId('sp'), kind: 'bassAmp', label: 'Bass', x: 0.75, y: 0.6, channel: '3', description: 'DI + amp mic' },
    { id: genId('sp'), kind: 'drumKit', label: 'Drums', x: 0.5, y: 0.35, channel: '4-9', description: 'Full kit, standard mic package' },
  ];
}

function seedSongs(): Song[] {
  const songs: Array<Pick<Song, 'title' | 'artist' | 'language' | 'key' | 'tempo' | 'timeSignature' | 'chordpro'>> = [
    {
      title: 'Amazing Grace',
      artist: 'Traditional',
      language: 'en',
      key: 'G',
      tempo: 72,
      timeSignature: '3/4',
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
      chordpro: `{title: Scarborough Fair}
{artist: Traditional}
{key: Dm}
{tempo: 84}

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
      chordpro: `{title: House of the Rising Sun}
{artist: Traditional}
{key: Am}
{tempo: 120}

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

  return songs.map((song, i) => ({
    id: genId('song'),
    sortOrder: i,
    createdAt: now(),
    updatedAt: now(),
    tags: i === 0 ? ['hymn', 'set-opener'] : undefined,
    ...song,
  }));
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

  const band: Band = {
    id: DEMO_BAND_ID,
    name: 'The Gigboy Demo Band',
    description: 'A sample band so you can see how Gigboy feels before you self-host it.',
    icon: '🎸',
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
  ];

  const pressKits: PressKit[] = [
    {
      id: genId('presskit'),
      name: 'Electronic Press Kit',
      richText:
        '<p>The Gigboy Demo Band is a traditional folk outfit playing timeless songs with modern warmth. ' +
        'Available for weddings, festivals, and listening rooms.</p>',
      imageIds: [],
      videoUrls: [],
      selectedVideoUrls: [],
      presaveUrls: [],
      selectedPresaveUrls: [],
      createdAt: now(),
    },
  ];

  return {
    user,
    band,
    songs,
    songLists,
    setlists,
    riders,
    pressKits,
    pressKitImages: [],
    bandLogos: [],
    attachments: {},
    recordings: {},
    handNotes: {},
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
  key: 'songs' | 'songLists' | 'setlists' | 'riders' | 'pressKits',
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

export const songsCrud = makeCrud<Song>('songs', 'song', (s) => s.title);
export const songListsCrud = makeCrud<SongList>('songLists', 'songlist', (s) => s.name);
export const setlistsCrud = makeCrud<Setlist>('setlists', 'setlist', (s) => s.name);
export const ridersCrud = makeCrud<InputList>('riders', 'technicalRider', (r) => r.name);
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

// ---- Press kit shares ----

interface ShareRecord {
  kitId: string;
  token: string;
}
const pressKitShares: ShareRecord[] = [];

export function getPressKitShare(bandId: string, kitId: string): { token: string; publicUrl: string } | null {
  assertBand(bandId);
  const share = pressKitShares.find((s) => s.kitId === kitId);
  if (!share) return null;
  return { token: share.token, publicUrl: `${window.location.origin}${window.location.pathname}#/public/press-kit/${share.token}` };
}

export function createPressKitShare(bandId: string, kitId: string): { token: string; publicUrl: string } {
  assertBand(bandId);
  const existing = pressKitShares.find((s) => s.kitId === kitId);
  const token = existing?.token ?? genId('share');
  if (!existing) pressKitShares.push({ kitId, token });
  return { token, publicUrl: `${window.location.origin}${window.location.pathname}#/public/press-kit/${token}` };
}

export function disablePressKitShare(bandId: string, kitId: string): void {
  assertBand(bandId);
  const idx = pressKitShares.findIndex((s) => s.kitId === kitId);
  if (idx !== -1) pressKitShares.splice(idx, 1);
}

export function getPublicPressKit(token: string): { kit: PressKit; bandName: string; bandLogo: string | null; images: PressKitImage[] } | null {
  const share = pressKitShares.find((s) => s.token === token);
  if (!share) return null;
  const kit = state.pressKits.find((k) => k.id === share.kitId);
  if (!kit) return null;
  const images = state.pressKitImages.filter((img) => kit.imageIds.includes(img.id));
  return { kit, bandName: state.band.name, bandLogo: state.band.logo ?? null, images };
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
  return state.recordings[songId] ?? [];
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

// ---- Storage usage ----

export function getStorageUsage(): { recordingBytes: number; attachmentBytes: number; imageBytes: number; quotaBytes: number } {
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const recordingBytes = sum(Object.values(state.recordings).flat().map((r) => r.sizeBytes));
  const attachmentBytes = sum(Object.values(state.attachments).flat().map((a) => a.sizeBytes));
  const imageBytes = sum(state.pressKitImages.map((i) => i.sizeBytes + i.thumbSizeBytes)) + sum(state.bandLogos.map((l) => l.sizeBytes));
  return { recordingBytes, attachmentBytes, imageBytes, quotaBytes: state.user.storageQuotaBytes };
}
