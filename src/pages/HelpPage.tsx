import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { helpArticles, resolveHelpImage } from '../help/articles';
import Markdown from '../help/markdown';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import NotFoundPage from './NotFoundPage';

function HelpIndex() {
  useDocumentTitle('User guide');
  return (
    <div className="help-page">
      <header className="help-hero">
        <BookOpen size={28} aria-hidden="true" />
        <div>
          <h1>User guide</h1>
          <p>How to do things in Gigboy, from your first song to walking on stage.</p>
        </div>
      </header>
      <div className="help-index">
        {helpArticles.map((article, index) => (
          <Link key={article.slug} to={`/help/${article.slug}`} className="help-index-card">
            <span className="help-index-number">{index + 1}</span>
            <span className="help-index-title">{article.title}</span>
            <span className="help-index-summary">{article.summary}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function HelpArticleView({ slug }: { slug: string }) {
  const index = helpArticles.findIndex((article) => article.slug === slug);
  const article = helpArticles[index];
  useDocumentTitle(article ? `${article.title} — User guide` : null);
  if (!article) return <NotFoundPage />;
  const previous = helpArticles[index - 1];
  const next = helpArticles[index + 1];

  return (
    <div className="help-page help-page--article">
      <nav className="help-nav" aria-label="User guide">
        <Link to="/help" className="help-nav-home">User guide</Link>
        <ol>
          {helpArticles.map((entry) => (
            <li key={entry.slug}>
              <Link
                to={`/help/${entry.slug}`}
                aria-current={entry.slug === slug ? 'page' : undefined}
                className={entry.slug === slug ? 'is-active' : undefined}
              >
                {entry.title}
              </Link>
              {entry.slug === slug && entry.headings.length > 0 && (
                <ul>
                  {entry.headings.map((heading) => (
                    <li key={heading.id}><a href={`#${heading.id}`}>{heading.text}</a></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <article className="help-article">
        <h1>{article.title}</h1>
        {article.summary && <p className="help-article-summary">{article.summary}</p>}
        <Markdown markdown={article.body} resolveImage={resolveHelpImage} />
        <footer className="help-pager">
          {previous ? (
            <Link to={`/help/${previous.slug}`} className="help-pager-link">
              <ArrowLeft size={16} aria-hidden="true" />
              <span><small>Previous</small>{previous.title}</span>
            </Link>
          ) : <span />}
          {next ? (
            <Link to={`/help/${next.slug}`} className="help-pager-link help-pager-link--next">
              <span><small>Next</small>{next.title}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : <span />}
        </footer>
      </article>
    </div>
  );
}

export default function HelpPage() {
  const { slug } = useParams();
  return slug ? <HelpArticleView slug={slug} /> : <HelpIndex />;
}
