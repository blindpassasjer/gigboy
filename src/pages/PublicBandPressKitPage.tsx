import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, ArrowDownToLine } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { fetchPublicPressKit } from '../lib/pressKitApi';
import { generatePressKitZip } from '../lib/pressKitZip';

type PublicPressKitPayload = Awaited<ReturnType<typeof fetchPublicPressKit>>;

function slugifyFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'press-kit';
}

const ALLOWED_RICH_TEXT_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'hr', 'a']);

function sanitizePressKitHtml(raw: string): string {
  if (typeof window === 'undefined' || !raw.trim()) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/html');

  const sanitizeNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const source = node as HTMLElement;
    const tag = source.tagName.toLowerCase();
    if (!ALLOWED_RICH_TEXT_TAGS.has(tag)) {
      const fragment = doc.createDocumentFragment();
      source.childNodes.forEach((child) => {
        const cleanChild = sanitizeNode(child);
        if (cleanChild) fragment.appendChild(cleanChild);
      });
      return fragment;
    }

    const clean = doc.createElement(tag);

    if (tag === 'a') {
      const href = source.getAttribute('href') ?? '';
      try {
        const url = new URL(href, window.location.origin);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          clean.setAttribute('href', url.toString());
          clean.setAttribute('target', '_blank');
          clean.setAttribute('rel', 'noopener noreferrer nofollow');
        }
      } catch {
        // Ignore invalid links.
      }
    }

    source.childNodes.forEach((child) => {
      const cleanChild = sanitizeNode(child);
      if (cleanChild) clean.appendChild(cleanChild);
    });

    return clean;
  };

  const container = doc.createElement('div');
  doc.body.childNodes.forEach((child) => {
    const cleanChild = sanitizeNode(child);
    if (cleanChild) container.appendChild(cleanChild);
  });

  return container.innerHTML;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

function inferImageExtension(url: string, mimeType: string): string {
  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  const fromMime = normalizedMime.startsWith('image/') ? normalizedMime.slice(6) : '';
  if (fromMime) return fromMime;

  const pathname = new URL(url, window.location.origin).pathname;
  const fileName = pathname.split('/').pop() ?? '';
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
  return ext.toLowerCase() || 'jpg';
}

export default function PublicBandPressKitPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDownload, setBusyDownload] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState<string | null>(null);
  const [payload, setPayload] = useState<PublicPressKitPayload | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing press kit token.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    void fetchPublicPressKit(token)
      .then((result) => {
        if (!isMounted) return;
        setPayload(result);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load press kit.');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleImageDownload = async (url: string, title: string) => {
    setDownloadingImage(url);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download image.');
      const blob = await response.blob();
      const ext = inferImageExtension(url, blob.type);
      triggerBlobDownload(blob, `${slugifyFileName(title)}.${ext}`);
    } finally {
      setDownloadingImage(null);
    }
  };

  const handleDownload = async () => {
    if (!payload) return;
    setBusyDownload(true);
    try {
      const blob = await generatePressKitZip({
        bandName: payload.bandName,
        stageplots: payload.stageplots,
        riders: payload.riders,
        texts: payload.texts,
        images: payload.images,
        generatedAt: payload.generatedAt,
      });
      triggerBlobDownload(blob, `${slugifyFileName(payload.bandName)}-press-kit.zip`);
    } finally {
      setBusyDownload(false);
    }
  };

  if (loading) {
    return <main className="public-setlist-page"><p className="public-setlist-status">Loading press kit...</p></main>;
  }

  if (error || !payload) {
    return <main className="public-setlist-page"><p className="public-setlist-status">{error ?? 'Press kit not found.'}</p></main>;
  }

  const hasTexts = payload.texts.length > 0;
  const hasImages = payload.images.length > 0;

  return (
    <main className="public-setlist-page public-presskit-page">
      <header className="public-setlist-header public-presskit-header public-share-header">
        <Link to="/" className="public-page-nav-brand public-page-nav-brand--large"><BrandMark size={22} /></Link>
        <div className="public-share-branding-row public-share-branding-row--header">
          {(payload.bandName || payload.bandLogo) ? (
            <div className="public-share-band-stack public-share-band-stack--header">
              {payload.bandLogo ? (
                <img
                  src={payload.bandLogo}
                  alt={`${payload.bandName} logo`}
                  className="public-setlist-band-logo public-setlist-band-logo--large"
                  loading="lazy"
                />
              ) : null}
              {payload.bandName ? <p className="public-presskit-band-name public-share-band-name">{payload.bandName}</p> : null}
            </div>
          ) : null}
        </div>
        <h1 className="public-setlist-title">{payload.pressKitIcon && <span aria-hidden="true">{payload.pressKitIcon} </span>}Press Kit</h1>
        <p className="public-setlist-count">Public promo package</p>
        <div className="public-presskit-download-wrap">
          <button
            type="button"
            className="setlist-action-btn setlist-action-btn--secondary"
            onClick={() => void handleDownload()}
            disabled={busyDownload}
            title="Download press kit zip"
          >
            <Download size={14} />
            <span>Download ZIP</span>
          </button>
        </div>
      </header>

      <div className="public-presskit-body">
        {hasTexts && (
          <section className="public-presskit-texts-section">
            <div className="public-presskit-text-grid">
              {payload.texts.map((entry) => (
                <div key={`${entry.title}-${entry.body.slice(0, 16)}`} className="public-presskit-text-block">
                  <h2 className="public-presskit-text-standalone-title">{entry.title}</h2>
                  <article className="public-presskit-text-item">
                    <div
                      className="public-presskit-rich-text"
                      dangerouslySetInnerHTML={{ __html: sanitizePressKitHtml(entry.body) || `<p>${escapeHtml(entry.body)}</p>` }}
                    />
                  </article>
                </div>
              ))}
            </div>
          </section>
        )}

        {hasImages && (
          <section className="public-presskit-images-section">
            <h2 className="public-presskit-section-heading">Photos</h2>
            <div className="public-presskit-images-grid">
              {payload.images.map((entry) => (
                <article key={`${entry.title}-${entry.url}`} className="public-presskit-image-card">
                  <img src={entry.url} alt={entry.title} className="public-presskit-image" loading="lazy" />
                  <div className="public-presskit-image-footer">
                    <p className="public-presskit-image-title">{entry.title}</p>
                    <button
                      type="button"
                      className="public-presskit-dl-btn"
                      disabled={downloadingImage === entry.url}
                      onClick={() => void handleImageDownload(entry.url, entry.title)}
                      title="Download high-res image"
                    >
                      <ArrowDownToLine size={13} />
                      <span>{downloadingImage === entry.url ? 'Downloading…' : 'Download'}</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {!hasTexts && !hasImages && (
          <p className="public-setlist-status">This press kit has no content yet.</p>
        )}
      </div>

      <footer className="footer">From Norway - with chords</footer>
    </main>
  );
}
