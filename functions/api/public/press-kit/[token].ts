/// <reference types="@cloudflare/workers-types" />
import { getPublicPressKitData } from '../../../_helpers/press-kit-data';

export const onRequestGet: PagesFunction<Record<string, string | undefined>> = async (ctx) => {
  const token = (ctx.params.token ?? '').trim();
  const result = await getPublicPressKitData(ctx.env, token);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data);
};
