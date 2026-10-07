import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Markdown from './markdown';
import { parseBlocks, slugifyHeading } from './markdownParse';
import { helpArticles, parseArticle, resolveHelpImage } from './articles';

describe('markdown renderer', () => {
  afterEach(cleanup);

  it('parses headings, lists, quotes and images into blocks', () => {
    const blocks = parseBlocks([
      '## A heading',
      '',
      'Some **bold** text',
      'on two lines.',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '> **Tip:** careful',
      '',
      '![caption](shot)',
    ].join('\n'));
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'image']);
    expect(blocks[1]).toMatchObject({ text: 'Some **bold** text on two lines.' });
    expect(blocks[2]).toMatchObject({ ordered: false, items: ['one', 'two'] });
    expect(blocks[3]).toMatchObject({ ordered: true, items: ['first', 'second'] });
  });

  it('renders inline formatting and links without injecting raw HTML', () => {
    render(
      <MemoryRouter>
        <Markdown
          markdown={'Press **Start**, then `Esc`. See [setlists](/help/setlists) or [the site](https://example.com). <script>x</script>'}
          resolveImage={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Start').tagName).toBe('STRONG');
    expect(screen.getByText('Esc').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'setlists' })).toHaveAttribute('href', '/help/setlists');
    expect(screen.getByRole('link', { name: 'the site' })).toHaveAttribute('target', '_blank');
    expect(document.querySelector('script')).toBeNull();
  });

  it('does not turn javascript: links into anchors', () => {
    render(<MemoryRouter><Markdown markdown="[bad](javascript:alert(1))" resolveImage={() => undefined} /></MemoryRouter>);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('slugifies headings for in-page anchors', () => {
    expect(slugifyHeading('Playing together!')).toBe('playing-together');
  });
});

describe('guide articles', () => {
  it('parses frontmatter and numbered slugs', () => {
    const article = parseArticle('./content/02-songs.md', '---\ntitle: Songs\nsummary: About songs\n---\n## One\n\n## Two\n');
    expect(article).toMatchObject({ slug: 'songs', title: 'Songs', summary: 'About songs' });
    expect(article.headings.map((h) => h.id)).toEqual(['one', 'two']);
  });

  it('ships a non-empty guide with unique slugs', () => {
    expect(helpArticles.length).toBeGreaterThan(0);
    const slugs = helpArticles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const article of helpArticles) {
      expect(article.title).not.toBe(article.slug);
      expect(article.summary).not.toBe('');
    }
  });

  it('only references screenshots and guide pages that exist', () => {
    const slugs = new Set(helpArticles.map((a) => a.slug));
    for (const article of helpArticles) {
      for (const block of parseBlocks(article.body)) {
        if (block.type === 'image') expect(resolveHelpImage(block.src), `${article.slug}: ${block.src}`).toBeTruthy();
      }
      for (const [, target] of article.body.matchAll(/\]\(\/help\/([a-z-]+)(?:#[^)]*)?\)/g)) {
        expect(slugs.has(target), `${article.slug} links to missing /help/${target}`).toBe(true);
      }
    }
  });
});
