import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { parseBlocks } from './markdownParse';

/**
 * A deliberately small Markdown renderer for the in-app user guide. It supports the handful
 * of constructs the guide uses — headings, paragraphs, bullet/numbered lists, blockquote
 * callouts, images and inline bold/italic/code/links — and renders them as React elements,
 * so there is no raw HTML injection and no extra dependency.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (href.startsWith('/')) return <Link key={index} to={href}>{label}</Link>;
      if (/^https?:\/\//.test(href)) {
        return <a key={index} href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
      }
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

interface MarkdownProps {
  markdown: string;
  /** Resolves an image name used in the Markdown (`![alt](name)`) to a URL. */
  resolveImage: (name: string) => string | undefined;
}

export default function Markdown({ markdown, resolveImage }: MarkdownProps) {
  return (
    <>
      {parseBlocks(markdown).map((block, index) => {
        switch (block.type) {
          case 'heading':
            return block.level === 2
              ? <h2 key={index} id={block.id}>{renderInline(block.text)}</h2>
              : <h3 key={index} id={block.id}>{renderInline(block.text)}</h3>;
          case 'paragraph':
            return <p key={index}>{renderInline(block.text)}</p>;
          case 'quote':
            return <blockquote key={index}>{renderInline(block.text)}</blockquote>;
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={index}>
                {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
              </Tag>
            );
          }
          case 'image': {
            const url = resolveImage(block.src);
            if (!url) return null;
            return (
              <figure key={index}>
                <img src={url} alt={block.alt} loading="lazy" />
                {block.alt && <figcaption>{block.alt}</figcaption>}
              </figure>
            );
          }
        }
      })}
    </>
  );
}
