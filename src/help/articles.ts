import { slugifyHeading } from './markdownParse';

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  body: string;
  headings: Array<{ id: string; text: string }>;
}

const rawArticles = import.meta.glob('./content/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const imageUrls = import.meta.glob('./images/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** Resolves an image name from the guide Markdown (e.g. `concert-mode`) to its bundled URL. */
export function resolveHelpImage(name: string): string | undefined {
  return imageUrls[`./images/${name}.webp`];
}

export function parseArticle(path: string, source: string): HelpArticle {
  const slug = path.replace(/^.*\//, '').replace(/\.md$/, '').replace(/^\d+-/, '');
  let body = source.replace(/\r\n/g, '\n');
  const meta: Record<string, string> = {};
  const frontmatter = /^---\n([\s\S]*?)\n---\n?/.exec(body);
  if (frontmatter) {
    for (const line of frontmatter[1].split('\n')) {
      const separator = line.indexOf(':');
      if (separator > 0) meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    body = body.slice(frontmatter[0].length);
  }
  const headings = [...body.matchAll(/^##\s+(.*)$/gm)].map((match) => {
    const text = match[1].trim();
    return { id: slugifyHeading(text), text };
  });
  return { slug, title: meta.title ?? slug, summary: meta.summary ?? '', body, headings };
}

/** Guide articles in reading order (the numeric filename prefix sets the order). */
export const helpArticles: HelpArticle[] = Object.keys(rawArticles)
  .sort()
  .map((path) => parseArticle(path, rawArticles[path]));
