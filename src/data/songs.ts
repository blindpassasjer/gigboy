import type { Song } from '../types';

const songs: Song[] = [
  // ─── English ────────────────────────────────────────────────────────────────
  {
    id: 'amazing-grace',
    title: 'Amazing Grace',
    artist: 'John Newton',
    language: 'en',
    tags: ['hymn', 'traditional'],
    key: 'G',
    capo: 0,
    chordpro: `{title: Amazing Grace}
{artist: John Newton}

{start_of_verse}
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
[G]I once was [G7]lost, but [C]now am [G]found
Was [G]blind but [D]now I [G]see
{end_of_verse}

{start_of_verse}
[G]'Twas [G7]grace that [C]taught my [G]heart to fear
And [G]grace my [Em]fears re[D]lieved
[G]How [G7]precious [C]did that [G]grace appear
The [G]hour I [D]first be[G]lieved
{end_of_verse}

{start_of_verse}
[G]Through [G7]many [C]dangers, [G]toils and snares
I [G]have al[Em]ready [D]come
[G]'Tis [G7]grace that [C]brought me [G]safe thus far
And [G]grace will [D]lead me [G]home
{end_of_verse}`,
  },
  {
    id: 'house-of-the-rising-sun',
    title: 'House of the Rising Sun',
    artist: 'The Animals',
    language: 'en',
    tags: ['folk', 'rock', 'classic'],
    key: 'Am',
    chordpro: `{title: House of the Rising Sun}
{artist: The Animals}

{start_of_verse}
[Am]There is a [C]house in [D]New Or[F]leans
They [Am]call the [C]Rising [E]Sun
[Am]And it's [C]been the [D]ruin of [F]many a poor girl
And [Am]me, oh [E]God, I'm [Am]one
{end_of_verse}

{start_of_verse}
[Am]My mother [C]was a [D]tailor
She [Am]sewed my [C]new blue [E]jeans
[Am]My father [C]was a [D]gambling [F]man
[Am]Down in [E]New Or[Am]leans
{end_of_verse}

{start_of_verse}
[Am]Now the [C]only [D]thing a [F]gambler needs
Is a [Am]suitcase [C]and a [E]trunk
[Am]And the [C]only [D]time he's [F]satisfied
Is [Am]when he's [E]on a [Am]drunk
{end_of_verse}`,
  },
  {
    id: 'let-her-go',
    title: 'Let Her Go',
    artist: 'Passenger',
    language: 'en',
    tags: ['pop', 'folk'],
    key: 'G',
    capo: 0,
    chordpro: `{title: Let Her Go}
{artist: Passenger}

{start_of_verse}
Well you [G]only need the light when it's [Bm]burning low
Only [D]miss the sun when it starts to [Cadd9]snow
Only [G]know you love her when you [Bm]let her go
{end_of_verse}

{start_of_chorus}
[G]Only know you've been [Bm]high when you're [D]feeling low
Only [Cadd9]hate the road when you're [G]missing home
Only [Bm]know you love her [D]when you let her [Cadd9]go
And you [G]let her go
{end_of_chorus}

{start_of_verse}
[G]Staring at the [Bm]bottom of your [D]glass
Hoping [Cadd9]one day you'll make a [G]dream last
But [Bm]dreams come slow and [D]they go so [Cadd9]fast
{end_of_verse}`,
  },

  // ─── Norwegian ───────────────────────────────────────────────────────────────
  {
    id: 'jeg-er-havets-datter',
    title: 'Eg er havets datter',
    artist: 'Tradisjonell',
    language: 'no',
    tags: ['folk', 'tradisjonell'],
    key: 'D',
    chordpro: `{title: Eg er havets datter}
{artist: Tradisjonell}

{start_of_verse}
[D]Eg er [G]havets [D]datter
[A]fødd av [D]bølgje og [A]vatt
[D]Eg er [G]fjordens [A]prakt og
[D]nattens [A]stjerne[D]skatt
{end_of_verse}

{start_of_verse}
[D]Eg har [G]sett dei [D]mektige
[A]fjell i [D]morgon[A]gry
[D]Og eg [G]har høyrt [A]fuglesang
[D]høgt [A]mot him[D]len fly
{end_of_verse}

{start_of_chorus}
[G]Noreg, [D]Noreg
[A]landet i [D]vest
[G]Der [D]blånar [A]havet
[D]vakrast og [A]best
{end_of_chorus}`,
  },
  {
    id: 'en-sang-om-norge',
    title: 'Ja, vi elsker dette landet',
    artist: 'Bjørnstjerne Bjørnson',
    language: 'no',
    tags: ['nasjonalsang', 'hymne'],
    key: 'G',
    chordpro: `{title: Ja, vi elsker dette landet}
{artist: Bjørnstjerne Bjørnson / Rikard Nordraak}

{start_of_verse}
[G]Ja, vi [C]elsker dette [G]landet,
[D]som det [G]stiger [D]frem
[G]furet, [Em]værbitt [Am]over [D]vannet
[G]med de [C]tusen [G]hjem,
[G]elsker, [Em]elsker det og [C]tenker
[G]på vår [D]far og [G]mor
[Em]og den [Am]saganatt som [Em]senker
[G]drømme [C]på vår [G]jord. [D] [G]
{end_of_verse}`,
  },

  // ─── Spanish ────────────────────────────────────────────────────────────────
  {
    id: 'bésame-mucho',
    title: 'Bésame Mucho',
    artist: 'Consuelo Velázquez',
    language: 'es',
    tags: ['bolero', 'clásico'],
    key: 'Dm',
    chordpro: `{title: Bésame Mucho}
{artist: Consuelo Velázquez}

{start_of_verse}
[Dm]Bésame, [Gm]bésame [Dm]mucho
[E7]Como si fuera esta [A7]noche la última [Dm]vez
[Dm]Bésame, [Gm]bésame [Dm]mucho
[A7]Que tengo miedo perderte, perderte [Dm]después
{end_of_verse}

{start_of_verse}
[Dm]Quiero tenerte muy [Gm]cerca
[Dm]Mirarme en tus [A7]ojos, verte junto a [Dm]mí
[Dm]Piensa que tal vez [Gm]mañana
[Dm]Yo ya estaré [A7]lejos, muy lejos de [Dm]ti
{end_of_verse}`,
  },
  {
    id: 'guantanamera',
    title: 'Guantanamera',
    artist: 'Joseíto Fernández',
    language: 'es',
    tags: ['folk', 'cubano', 'clásico'],
    key: 'C',
    chordpro: `{title: Guantanamera}
{artist: Joseíto Fernández}

{start_of_chorus}
[C]Guantana[F]mera, [G7]guajira Guan[C]tanamera
[C]Guantana[F]mera, [G7]guajira Guan[C]tanamera
{end_of_chorus}

{start_of_verse}
[C]Yo soy un [F]hombre sin[G7]cero
[C]De donde [F]crece la [G7]palma
[C]Yo soy un [F]hombre sin[G7]cero
[C]De donde [F]crece la [G7]palma
[C]Y antes de [F]morirme [G7]quiero
[C]Echar mis [F]versos del [G7]alma
{end_of_verse}`,
  },

  // ─── Portuguese ─────────────────────────────────────────────────────────────
  {
    id: 'garota-de-ipanema',
    title: 'Garota de Ipanema',
    artist: 'Tom Jobim & Vinícius de Moraes',
    language: 'pt',
    tags: ['bossa nova', 'clássico'],
    key: 'F',
    chordpro: `{title: Garota de Ipanema}
{artist: Tom Jobim & Vinícius de Moraes}

{start_of_verse}
[Fmaj7]Olha que coisa mais [G7]linda, mais cheia de [Gm7]graça
[Gb7]É ela menina que [Fmaj7]vem e que passa
Num [G7]doce balanço a [Gm7]caminho do [Gb7]mar
{end_of_verse}

{start_of_chorus}
[Cbmaj7]Ah, por que estou tão [D7]sozinho?
[Gm7]Ah, por que tudo é tão [Gb7]triste?
[Fmaj7]Ah, a beleza que [G7]existe
[Gm7]A beleza que não é [Gb7]só minha
[Fmaj7]Que também passa [G7]sozinha
{end_of_chorus}`,
  },

  // ─── French ─────────────────────────────────────────────────────────────────
  {
    id: 'la-vie-en-rose',
    title: 'La Vie en Rose',
    artist: 'Édith Piaf',
    language: 'fr',
    tags: ['chanson', 'classique'],
    key: 'C',
    chordpro: `{title: La Vie en Rose}
{artist: Édith Piaf}

{start_of_verse}
[C]Des yeux qui font baisser les [E7]miens
Un rire qui se [Am]perd sur sa [C7]bouche
[F]Voilà le portrait sans [Fm]retouches
[C]De l'homme auquel j'ap[G7]partiens
{end_of_verse}

{start_of_chorus}
[C]Quand il me prend dans ses [E7]bras
Il me parle tout [Am]bas
[A7]Je vois la vie en [Dm]rose
[G7]Il me dit des mots d'a[C]mour
Des mots de tous les [E7]jours
[Am]Et ça me fait quelque [A7]chose
{end_of_chorus}`,
  },

  // ─── Italian ────────────────────────────────────────────────────────────────
  {
    id: 'volare',
    title: 'Volare (Nel Blu Dipinto di Blu)',
    artist: 'Domenico Modugno',
    language: 'it',
    tags: ['pop', 'classico'],
    key: 'C',
    chordpro: `{title: Volare}
{artist: Domenico Modugno}

{start_of_verse}
[C]Penso che un [Dm]sogno così non [G7]ritorni mai più
[C]Mi dipingevo le [Dm]mani e la [G7]faccia di blu
[Cmaj7]Poi d'improvviso ve[C6]nivo dal [Dm7]vento rapito
[G7]E incominciavo a [C]volare nel [G7]cielo infinito
{end_of_verse}

{start_of_chorus}
[C]Volare, [G7]oh oh
[C]Cantare, [G7]oh oh oh oh
[Am]Nel blu, dipinto di [Dm7]blu
[G7]Felice di stare [C]lassù
{end_of_chorus}`,
  },

  // ─── German ─────────────────────────────────────────────────────────────────
  {
    id: 'lili-marleen',
    title: 'Lili Marleen',
    artist: 'Lale Andersen',
    language: 'de',
    tags: ['folk', 'klassisch'],
    key: 'C',
    chordpro: `{title: Lili Marleen}
{artist: Lale Andersen}

{start_of_verse}
[C]Vor der [F]Kaserne, [C]vor dem großen [G7]Tor
[C]Stand eine [F]Laterne, [C]und steht sie [G7]noch davor
[C]So woll'n wir [F]uns da [C]wieder[G7]sehn
[C]Bei der Laterne [G7]woll'n wir stehn
[G7]Wie einst Lili [C]Marleen
Wie einst Lili [G7]Mar[C]leen
{end_of_verse}`,
  },
];

export default songs;
