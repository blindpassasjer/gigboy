/// <reference types="@cloudflare/workers-types" />
import { getPublicPressKitData } from '../../_helpers/press-kit-data';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

class AttributeRewriter {
  constructor(private readonly attribute: string, private readonly value: string) {}
  element(element: Element) {
    element.setAttribute(this.attribute, this.value);
  }
}

class TextContentRewriter {
  constructor(private readonly value: string) {}
  element(element: Element) {
    element.setInnerContent(this.value);
  }
}

class HeadAppendRewriter {
  constructor(private readonly html: string) {}
  element(element: Element) {
    element.append(this.html, { html: true });
  }
}

export const onRequestGet: PagesFunction<Record<string, string | undefined>> = async (ctx) => {
  // Fall through to the normal static/SPA response first; we only rewrite its meta tags.
  const assetResponse = await ctx.next();

  const contentType = assetResponse.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return assetResponse;

  const token = (ctx.params.token ?? '').trim();
  if (!token) return assetResponse;

  const result = await getPublicPressKitData(ctx.env, token).catch(() => null);
  if (!result || !result.ok) return assetResponse;

  const { data } = result;
  const origin = new URL(ctx.request.url).origin;

  const title = `${data.bandName} — Press Kit`;
  const descriptionSource = data.texts[0]?.body ?? '';
  const description =
    stripHtml(descriptionSource).slice(0, 200) ||
    `Press kit and media for ${data.bandName}, shared via GIGBOY.`;
  const image = data.bandLogo ?? data.images[0]?.url ?? `${origin}/pwa-512.png`;
  const pageUrl = ctx.request.url.replace(/"/g, '&quot;');

  const rewriter = new HTMLRewriter()
    .on('title', new TextContentRewriter(title))
    .on('meta[property="og:title"]', new AttributeRewriter('content', title))
    .on('meta[name="twitter:title"]', new AttributeRewriter('content', title))
    .on('meta[property="og:description"]', new AttributeRewriter('content', description))
    .on('meta[name="twitter:description"]', new AttributeRewriter('content', description))
    .on('meta[property="og:image"]', new AttributeRewriter('content', image))
    .on('meta[name="twitter:image"]', new AttributeRewriter('content', image))
    .on('meta[property="og:type"]', new AttributeRewriter('content', 'profile'))
    .on('meta[name="description"]', new AttributeRewriter('content', description))
    .on('head', new HeadAppendRewriter(`<meta property="og:url" content="${pageUrl}">`));

  const rewritten = rewriter.transform(assetResponse);
  return new Response(rewritten.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers: rewritten.headers,
  });
};
