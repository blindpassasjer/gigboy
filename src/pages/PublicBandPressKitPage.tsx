import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText, Images, Map, ClipboardList } from 'lucide-react';
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

type TabId = 'stageplots' | 'riders' | 'texts' | 'images';

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
  const [activeTab, setActiveTab] = useState<TabId>('stageplots');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDownload, setBusyDownload] = useState(false);
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
        <p className="public-setlist-band">{payload.bandName}</p>
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

      <div className="public-presskit-shell">
        <div className="setlist-tabs" style={{ marginBottom: '0.8rem' }}>
          {([
            { id: 'stageplots', label: `Stageplots (${payload.stageplots.length})`, icon: <Map size={14} /> },
            { id: 'riders', label: `Input Lists (${payload.riders.length})`, icon: <ClipboardList size={14} /> },
            { id: 'texts', label: `Texts (${payload.texts.length})`, icon: <FileText size={14} /> },
            { id: 'images', label: `Images (${payload.images.length})`, icon: <Images size={14} /> },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`setlist-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab === 'stageplots' && (
          <div className="songlist-body">
            {payload.stageplots.length === 0
              ? <p className="bands-status">No stageplots included.</p>
              : payload.stageplots.map((entry) => (
                <article key={entry.id} className="songlist-item" style={{ display: 'block' }}>
                  <strong>{entry.name}</strong>
                  <p className="songlist-item-meta" style={{ marginTop: '0.35rem' }}>{entry.items.length} items</p>
                </article>
              ))}
          </div>
        )}

        {activeTab === 'riders' && (
          <div className="songlist-body">
            {payload.riders.length === 0
              ? <p className="bands-status">No input lists included.</p>
              : payload.riders.map((entry) => (
                <article key={entry.id} className="songlist-item" style={{ display: 'block' }}>
                  <strong>{entry.name}</strong>
                  <p className="songlist-item-meta" style={{ marginTop: '0.35rem' }}>{entry.lines.length} lines</p>
                </article>
              ))}
          </div>
        )}

        {activeTab === 'texts' && (
          <div className="songlist-body public-presskit-text-grid">
            {payload.texts.length === 0
              ? <p className="bands-status">No text entries included.</p>
              : payload.texts.map((entry) => (
                <article key={`${entry.title}-${entry.body.slice(0, 16)}`} className="songlist-item public-presskit-text-item" style={{ display: 'block' }}>
                  <h2 className="public-presskit-text-title">{entry.title}</h2>
                  <div
                    className="public-presskit-rich-text"
                      dangerouslySetInnerHTML={{ __html: sanitizePressKitHtml(entry.body) || `<p>${escapeHtml(entry.body)}</p>` }}
                  />
                </article>
              ))}
          </div>
        )}

        {activeTab === 'images' && (
          <div className="songlist-body public-presskit-images-grid">
            {payload.images.length === 0
              ? <p className="bands-status">No images included.</p>
              : payload.images.map((entry) => (
                <article key={`${entry.title}-${entry.url}`} className="songlist-item public-presskit-image-card" style={{ display: 'block' }}>
                  <img src={entry.url} alt={entry.title} className="public-presskit-image" loading="lazy" />
                  <p className="public-presskit-image-title">{entry.title}</p>
                </article>
              ))}
          </div>
        )}
      </div>

      <footer className="public-setlist-footer">
        <Link to="/" className="public-setlist-footer-link"><BrandMark size={13} /></Link>
        <p className="public-setlist-signoff">Built for musicians by Gigboy</p>
      </footer>
    </main>
  );
}
