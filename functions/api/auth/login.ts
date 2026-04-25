/// <reference types="@cloudflare/workers-types" />
import { verifyPassword, generateToken, setCookie } from '../../_helpers/auth';

interface Env { DB: D1Database }

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { username, password } = await ctx.request.json<{ username: string; password: string }>();

  if (!username?.trim() || !password) {
    return Response.json({ error: 'Username and password required' }, { status: 400 });
  }

  const user = await ctx.env.DB
    .prepare('SELECT id, password_hash FROM users WHERE username = ?')
    .bind(username.trim())
    .first<{ id: string; password_hash: string }>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = generateToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await ctx.env.DB
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.id, expires.toISOString())
    .run();

  return Response.json({ ok: true }, { headers: { 'Set-Cookie': setCookie(token, expires) } });
};
