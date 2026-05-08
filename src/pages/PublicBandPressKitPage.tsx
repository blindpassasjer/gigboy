import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, ArrowDownToLine } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { fetchPublicPressKit } from '../lib/pressKitApi';
import { generatePressKitZip } from '../lib/pressKitZip';

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

export default function PublicBandPressKitPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDownload, setBusyDownload] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState<string | null>(null);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchPublicPressKit>> | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing press kit token.');
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    void fetchPublicPressKit(token)
      .then((result) => {
        if (!mounted) return;
        setPayload(result);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load press kit.');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const handleImageDownload = async (url: string, title: string) => {
    setDownloadingImage(url);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const ext = blob.type.split('/')[1] ?? 'jpg';
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${slugifyFileName(title)}.${ext}`;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
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
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${slugifyFileName(payload.bandName)}-press-kit.zip`;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
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

  return (
    <main className="public-setlist-page public-presskit-page">
      <nav className="public-page-nav">
        <Link to="/" className="public-page-nav-brand"><BrandMark size={16} /></Link>
      </nav>

      <header className="public-setlist-header public-presskit-header">
        <div className="public-setlist-band-row">
          {payload.bandLogo ? <img src={payload.bandLogo} alt={`${payload.bandName} logo`} className="public-setlist-band-logo" loading="lazy" /> : null}
          <p className="public-setlist-band">{payload.bandName}</p>
        </div>
        <h1 className="public-setlist-title">Press Kit</h1>
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
        {payload.texts.length > 0 && (
          <section className="public-presskit-texts-section">
            <h2 className="public-presskit-section-heading">About</h2>
            <div className="public-presskit-text-grid">
              {payload.texts.map((entry) => (
                <article key={`${entry.title}-${entry.body.slice(0, 16)}`} className="public-presskit-text-item">
                  <h3 className="public-presskit-text-title">{entry.title}</h3>
                  <div
                    className="public-presskit-rich-text"
                    dangerouslySetInnerHTML={{ __html: sanitizePressKitHtml(entry.body) || `<p>${escapeHtml(entry.body)}</p>` }}
                  />
                </article>
              ))}
            </div>
          </section>
        )}

        {payload.images.length > 0 && (
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

        {payload.texts.length === 0 && payload.images.length === 0 && (
          <p className="public-setlist-status">This press kit has no content yet.</p>
        )}
      </div>

      <footer className="public-setlist-footer">
        <Link to="/" className="public-setlist-footer-link"><BrandMark size={13} /></Link>
        <p className="public-setlist-signoff">Built for musicians by Gigboy</p>
      </footer>
    </main>
  );
}
