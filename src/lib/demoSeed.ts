import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const DEMO_SEED_SESSION_KEY = 'gigboy-demo-seeded';

interface DemoSong {
  title: string;
  artist: string;
  language: string;
  key: string;
  capo?: number;
  tempo?: number;
  timeSignature: string;
  chordpro: string;
  sortOrder: number;
  createdAt: string;
}

const DEMO_SONGS: DemoSong[] = [
  {
    title: "Wonderwall",
    artist: "Oasis",
    language: "en",
    key: "F#m",
    capo: 2,
    tempo: 87,
    timeSignature: "4/4",
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    chordpro: `{title: Wonderwall}
{artist: Oasis}

[Em7]Today is gonna be the day that they're [G]gonna throw it back to [Dsus4]you
[Em7]By now you should've somehow real[G]ized what you gotta [Dsus4]do
[Em7]I don't believe that any[G]body feels the way I [Dsus4]do about you [A7sus4]now

[Em7]Backbeat, the word was on the street that the [G]fire in your heart is [Dsus4]out
[Em7]I'm sure you've heard it all before but you [G]never really had a [Dsus4]doubt
[Em7]I don't believe that any[G]body feels the way I [Dsus4]do about you [A7sus4]now

{start_of_chorus}
[C]And all the roads we have to [D]walk are [Em]winding
[C]And all the lights that lead us [D]there are [Em]blinding
[C]There are many things that I [D]would like to [Em]say to [G]you
But I don't know [A7sus4]how
{end_of_chorus}

Because [Em7]maybe [G]you're gonna be the [Dsus4]one that [A7sus4]saves me
And after [Em7]all you're my wonder[Dsus4]wall [A7sus4]`,
  },
  {
    title: "Knockin' on Heaven's Door",
    artist: "Bob Dylan",
    language: "en",
    key: "G",
    tempo: 68,
    timeSignature: "4/4",
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    chordpro: `{title: Knockin' on Heaven's Door}
{artist: Bob Dylan}

[G]Mama, take this [D]badge off of [Am]me
[G]I can't use it [D]anymore
[G]It's gettin' dark, [D]too dark for me to [Am]see
[G]I feel like I'm [D]knockin' on heaven's [G]door

{start_of_chorus}
[G]Knock, knock, [D]knockin' on heaven's [Am]door
[G]Knock, knock, [D]knockin' on heaven's [G]door
[G]Knock, knock, [D]knockin' on heaven's [Am]door
[G]Knock, knock, [D]knockin' on heaven's [G]door
{end_of_chorus}

[G]Mama, put my [D]guns in the [Am]ground
[G]I can't shoot them [D]anymore
[G]That long black [D]cloud is comin' [Am]down
[G]I feel like I'm [D]knockin' on heaven's [G]door`,
  },
  {
    title: "The House of the Rising Sun",
    artist: "The Animals",
    language: "en",
    key: "Am",
    tempo: 80,
    timeSignature: "6/8",
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    chordpro: `{title: The House of the Rising Sun}
{artist: The Animals}

[Am]There is a [C]house in [D]New Or[F]leans
They [Am]call the [C]Rising [E]Sun
And it's [Am]been the [C]ruin of [D]many a poor [F]boy
And [Am]God, I [E]know I'm [Am]one [E]

[Am]My [C]mother was a [D]tailor [F]
She [Am]sewed my [C]new blue [E]jeans
My [Am]father was a [C]gambling [D]man [F]
Down [Am]in New Or[E]leans [Am][E]

[Am]Now the [C]only thing a [D]gambler [F]needs
Is a [Am]suitcase [C]and a [E]trunk
And the [Am]only time he's [C]satisfied [D][F]
Is when he's on [Am]a [E]drunk [Am][E]`,
  },
  {
    title: "Horse With No Name",
    artist: "America",
    language: "en",
    key: "Em",
    tempo: 76,
    timeSignature: "4/4",
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    chordpro: `{title: Horse With No Name}
{artist: America}

[Em]On the first part of the journey
I was looking at all the [D6]life
[Em]There were plants and birds and rocks and things
There was [D6]sand and hills and rings
[Em]The first thing I met was a fly with a buzz
And the [D6]sky with no clouds
[Em]The heat was hot and the ground was dry
But the [D6]air was full of sound

{start_of_chorus}
[Em]I've been through the desert on a horse with no [D6]name
It felt good to be [Em]out of the rain
In the desert you can remember your [D6]name
'Cause there ain't no one for to [Em]give you no pain
La, [D6]la, la la la [Em]la la, la la la, [D6]la
{end_of_chorus}`,
  },
  {
    title: "Let Her Go",
    artist: "Passenger",
    language: "en",
    key: "G",
    tempo: 70,
    timeSignature: "4/4",
    sortOrder: 4,
    createdAt: new Date().toISOString(),
    chordpro: `{title: Let Her Go}
{artist: Passenger}

[G]Well you only need the light when it's [Bm]burning low
Only miss the sun when it starts to [D]snow
Only know you love her when you let her [G]go

Only know you've been [D]high when you're feeling [Em]low
Only hate the road when you're missing [Bm]home
Only know you love her when you let her [D]go
And you let her [G]go

[Am]Staring at the bottom of your [Bm]glass
[D]Hoping one day you'll make a [Em]dream last
But dreams come slow and they [Bm]go so fast
[Am]You see her when you close your [Bm]eyes
[D]Maybe one day you'll understand [Em]why
Everything you touch surely [Bm]dies`,
  },
];

/**
 * Seeds demo songs into Firestore for a new anonymous user.
 * Uses sessionStorage to avoid re-seeding on page refresh.
 * Skips if the user already has songs (e.g. returning demo session).
 */
export async function seedDemoData(firestore: Firestore, userId: string): Promise<void> {
  // Skip if already seeded in this browser session
  try {
    if (sessionStorage.getItem(DEMO_SEED_SESSION_KEY) === userId) return;
  } catch {
    // Ignore sessionStorage errors
  }

  try {
    const snap = await getDocs(collection(firestore, 'users', userId, 'songs'));
    if (snap.size > 0) {
      try { sessionStorage.setItem(DEMO_SEED_SESSION_KEY, userId); } catch { /* ignore */ }
      return;
    }

    const batch = writeBatch(firestore);
    for (const song of DEMO_SONGS) {
      const songRef = doc(collection(firestore, 'users', userId, 'songs'));
      batch.set(songRef, { ...song, ownerId: userId });
    }
    await batch.commit();

    try { sessionStorage.setItem(DEMO_SEED_SESSION_KEY, userId); } catch { /* ignore */ }
  } catch (error) {
    console.warn('Failed to seed demo data.', error);
  }
}
