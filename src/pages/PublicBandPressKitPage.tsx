import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileText, Images, Map, ClipboardList } from 'lucide-react';
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
    return <main className="app-status">Loading public press kit…</main>;
  }

  if (error || !payload) {
    return <main className="app-status">{error ?? 'Press kit not found.'}</main>;
  }

  return (
    <main className="bands-page bands-page--library" style={{ maxWidth: '980px', margin: '0 auto' }}>
      <div className="setlist-shell">
        <header className="setlist-header">
          <div className="setlist-header-main">
            <h1 className="setlist-title">{payload.bandName} Press Kit</h1>
            <p className="setlist-subtitle">Public promo package</p>
          </div>
          <div className="setlist-actions">
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => void handleDownload()}
              disabled={busyDownload}
            >
              <Download size={14} />
            </button>
          </div>
        </header>

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
          <div className="songlist-body">
            {payload.texts.length === 0
              ? <p className="bands-status">No text entries included.</p>
              : payload.texts.map((entry) => (
                <article key={`${entry.title}-${entry.body.slice(0, 16)}`} className="songlist-item" style={{ display: 'block' }}>
                  <strong>{entry.title}</strong>
                  <p className="songlist-item-meta" style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>{entry.body}</p>
                </article>
              ))}
          </div>
        )}

        {activeTab === 'images' && (
          <div className="songlist-body">
            {payload.images.length === 0
              ? <p className="bands-status">No image links included.</p>
              : payload.images.map((entry) => (
                <article key={`${entry.title}-${entry.url}`} className="songlist-item" style={{ display: 'block' }}>
                  <strong>{entry.title}</strong>
                  <p className="songlist-item-meta" style={{ marginTop: '0.35rem', wordBreak: 'break-word' }}>{entry.url}</p>
                </article>
              ))}
          </div>
        )}
      </div>
    </main>
  );
}
