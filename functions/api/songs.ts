/// <reference types="@cloudflare/workers-types" />

interface Env { DB: D1Database }
interface Data { userId: string }

type DbRow = {
  id: string; title: string; artist: string | null; language: string;
  secondary_languages: string | null; tags: string | null; chordpro: string;
  capo: number | null; key: string | null; tempo: number | null;
  time_signature: string | null; created_at: string; updated_at: string;
};

function rowToSong(r: DbRow) {
  return {
    id: r.id, title: r.title, artist: r.artist ?? undefined, language: r.language,
    secondaryLanguages: r.secondary_languages ? JSON.parse(r.secondary_languages) : undefined,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    chordpro: r.chordpro, capo: r.capo ?? undefined, key: r.key ?? undefined,
    tempo: r.tempo ?? undefined, timeSignature: r.time_signature ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export const onRequestGet: PagesFunction<Env, never, Data> = async (ctx) => {
  const { results } = await ctx.env.DB
    .prepare('SELECT * FROM songs ORDER BY created_at DESC')
    .all<DbRow>();
  return Response.json(results.map(rowToSong));
};

export const onRequestPost: PagesFunction<Env, never, Data> = async (ctx) => {
  type Body = {
    id: string; title: string; artist?: string; language: string;
    secondaryLanguages?: string[]; tags?: string[]; chordpro: string;
    capo?: number; key?: string; tempo?: number; timeSignature?: string; createdAt?: string;
  };
  const s = await ctx.request.json<Body>();
  const now = new Date().toISOString();

  await ctx.env.DB.prepare(
    `INSERT INTO songs
       (id, title, artist, language, secondary_languages, tags, chordpro,
        capo, key, tempo, time_signature, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    s.id, s.title, s.artist ?? null, s.language,
    s.secondaryLanguages ? JSON.stringify(s.secondaryLanguages) : null,
    s.tags ? JSON.stringify(s.tags) : null,
    s.chordpro, s.capo ?? null, s.key ?? null, s.tempo ?? null,
    s.timeSignature ?? null, s.createdAt ?? now, now,
  ).run();

  return Response.json({ ok: true }, { status: 201 });
};
