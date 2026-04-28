/// <reference types="@cloudflare/workers-types" />

export const onRequestPost: PagesFunction<never> = async (ctx) => {
  const { username, password } = await ctx.request.json<{ username: string; password: string }>();

  if (!username?.trim() || !password) {
    return Response.json({ error: 'Username and password required' }, { status: 400 });
  }

  // Firebase user lookup would go here
  return Response.json({ error: 'Invalid credentials' }, { status: 401 });
};
