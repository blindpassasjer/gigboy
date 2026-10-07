/** Block-level parser for the in-app user guide Markdown (see markdown.tsx). */

export type Block =
  | { type: 'heading'; level: 2 | 3; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'image'; alt: string; src: string };

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  const isBlockStart = (line: string) =>
    /^#{2,3}\s/.test(line) || /^\s*([-*]|\d+\.)\s/.test(line) || line.startsWith('>') || /^!\[/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2].trim();
      blocks.push({ type: 'heading', level: heading[1].length as 2 | 3, text, id: slugifyHeading(text) });
      i += 1;
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (image) {
      blocks.push({ type: 'image', alt: image[1], src: image[2].trim() });
      i += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: quote.join(' ').trim() });
      continue;
    }

    const listMatch = /^\s*([-*]|\d+\.)\s+/.exec(line);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const item = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (item) {
          items.push(item[2]);
          i += 1;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length > 0) {
          // Indented continuation of the previous item.
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i += 1;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !(paragraph.length > 0 && isBlockStart(lines[i]))) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}
