import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Disc3,
  FileText,
  Globe2,
  Guitar,
  ListMusic,
  Map,
  Mic2,
  Minus,
  Moon,
  Newspaper,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Users,
  WifiOff,
} from 'lucide-react';
import BrandMark from '../components/BrandMark';
import ChordDisplay from '../components/ChordDisplay';
import VisualMetronome from '../components/VisualMetronome';
import LanguageBadge from '../components/LanguageBadge';
import { useDarkModeContext } from '../context/DarkModeContext';

const DEMO_SONG = `{title: Harbor Lights}
{artist: The Fixtures}
{start_of_verse}
[G]Amazing [C]grace, how [G]sweet the [D]sound
That [G]saved a [Em]wretch like [C]me [D]
{end_of_verse}
{start_of_chorus}
I [C]once was [G]lost, but [Em]now am [D]found
Was [G]blind, but [C]now I [G]see
{end_of_chorus}`;

/** Reveals a section with a fade/slide-up transition once it scrolls into view. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function ShowcaseSection({
  id,
  kicker,
  title,
  copy,
  children,
  align = 'left',
}: {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section
      id={id}
      ref={ref}
      className={`showcase-section${visible ? ' is-visible' : ''}${align === 'right' ? ' showcase-section--reverse' : ''}`}
    >
      <div className="showcase-section-copy">
        <span className="showcase-kicker">{kicker}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <div className="showcase-section-demo">{children}</div>
    </section>
  );
}

function ChordProDemo() {
  const [transpose, setTranspose] = useState(0);
  return (
    <div className="showcase-card showcase-chord-demo">
      <div className="showcase-card-toolbar">
        <span className="showcase-card-label">Harbor Lights &mdash; live transpose</span>
        <div className="showcase-transpose-controls">
          <button type="button" onClick={() => setTranspose((t) => Math.max(t - 1, -6))} aria-label="Transpose down">
            <Minus size={14} />
          </button>
          <span>{transpose > 0 ? `+${transpose}` : transpose}</span>
          <button type="button" onClick={() => setTranspose((t) => Math.min(t + 1, 6))} aria-label="Transpose up">
            <Plus size={14} />
          </button>
        </div>
      </div>
      <ChordDisplay chordpro={DEMO_SONG} transpose={transpose} />
    </div>
  );
}

function SetlistDemo() {
  const items = [
    { title: 'Harbor Lights', duration: '3:42' },
    { title: 'Neon Tide', duration: '4:05' },
    { title: 'Slow Static', duration: '3:18' },
    { title: 'Amber Skies (encore)', duration: '5:01' },
  ];
  return (
    <div className="showcase-card">
      <div className="showcase-card-toolbar">
        <span className="showcase-card-label">Saturday &mdash; The Loft</span>
        <ListMusic size={16} />
      </div>
      <ol className="showcase-setlist">
        {items.map((item, i) => (
          <li key={item.title}>
            <span className="showcase-setlist-num">{i + 1}</span>
            <span className="showcase-setlist-title">{item.title}</span>
            <span className="showcase-setlist-duration">{item.duration}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BandDemo() {
  const members = [
    { name: 'Sebastian', role: 'Owner' },
    { name: 'Mia', role: 'Editor' },
    { name: 'Jonas', role: 'Member' },
  ];
  return (
    <div className="showcase-card">
      <div className="showcase-card-toolbar">
        <span className="showcase-card-label">The Fixtures</span>
        <Users size={16} />
      </div>
      <ul className="showcase-band-members">
        {members.map((m) => (
          <li key={m.name}>
            <span className="showcase-avatar" aria-hidden="true">{m.name.charAt(0)}</span>
            <span className="showcase-band-name">{m.name}</span>
            <span className="showcase-band-role">{m.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GigDocsDemo() {
  const docs = [
    { icon: Newspaper, label: 'Press kit', desc: 'Bio, photos & links' },
    { icon: FileText, label: 'Tech rider', desc: 'Inputs & backline' },
    { icon: Map, label: 'Stage plot', desc: 'Positions & monitors' },
  ];
  return (
    <div className="showcase-doc-grid">
      {docs.map(({ icon: Icon, label, desc }) => (
        <div className="showcase-card showcase-doc-card" key={label}>
          <Icon size={20} className="showcase-doc-icon" aria-hidden="true" />
          <h3>{label}</h3>
          <p>{desc}</p>
          <span className="showcase-doc-link">Shareable link <ArrowRight size={12} /></span>
        </div>
      ))}
    </div>
  );
}

function RehearsalDemo() {
  return (
    <div className="showcase-card showcase-rehearsal-demo">
      <div className="showcase-card-toolbar">
        <span className="showcase-card-label">Try the metronome</span>
        <Activity size={16} />
      </div>
      <VisualMetronome tempo={96} timeSignature="4/4" />
      <div className="showcase-rehearsal-extra">
        <span><Mic2 size={14} /> Recorder</span>
        <span><Guitar size={14} /> Tuner</span>
      </div>
    </div>
  );
}

function MoreFeaturesDemo() {
  const { dark, toggle } = useDarkModeContext();
  const langs = ['en', 'no', 'es', 'pt', 'fr'];
  return (
    <div className="showcase-more-grid">
      <div className="showcase-card showcase-more-card">
        <Paperclip size={18} aria-hidden="true" />
        <h3>Attachments</h3>
        <p>Scanned sheet music or lyric PDFs, up to 20 MB per song.</p>
      </div>
      <div className="showcase-card showcase-more-card">
        <Search size={18} aria-hidden="true" />
        <h3>Search &amp; filter</h3>
        <p>Full-text search by title, artist, or tag &mdash; instantly.</p>
      </div>
      <div className="showcase-card showcase-more-card">
        <Globe2 size={18} aria-hidden="true" />
        <h3>Multi-language</h3>
        <div className="showcase-lang-strip">
          {langs.map((code) => <LanguageBadge key={code} code={code} size="sm" />)}
        </div>
      </div>
      <div className="showcase-card showcase-more-card">
        <WifiOff size={18} aria-hidden="true" />
        <h3>Offline-capable PWA</h3>
        <p>Install it, take it to the gig &mdash; no signal required.</p>
      </div>
      <button type="button" className="showcase-card showcase-more-card showcase-dark-toggle" onClick={toggle}>
        {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        <h3>{dark ? 'Light mode' : 'Dark mode'}</h3>
        <p>Try it &mdash; tap this card to flip the whole page.</p>
      </button>
      <div className="showcase-card showcase-more-card">
        <ShieldCheck size={18} aria-hidden="true" />
        <h3>Free / Pro / Crew</h3>
        <p>Start free. Upgrade only when your band outgrows it.</p>
      </div>
    </div>
  );
}

export default function ShowcasePage() {
  const heroReveal = useReveal<HTMLDivElement>();

  return (
    <div className="showcase-page">
      <header className={`showcase-hero${heroReveal.visible ? ' is-visible' : ''}`} ref={heroReveal.ref}>
        <div className="showcase-hero-bg" aria-hidden="true">
          <span className="showcase-note showcase-note--1">&#9835;</span>
          <span className="showcase-note showcase-note--2">&#9834;</span>
          <span className="showcase-note showcase-note--3">&#9835;</span>
          <span className="showcase-note showcase-note--4">&#9833;</span>
          <span className="showcase-grid" />
        </div>
        <Link to="/" className="showcase-hero-nav-link">&larr; Back to Gigboy</Link>
        <BrandMark size={56} />
        <h1>See Gigboy in action</h1>
        <p>
          Scroll through everything a working band gets in one shared workspace &mdash;
          from the songbook to the stage.
        </p>
        <div className="showcase-hero-ctas">
          <Link to="/login" className="btn-primary">Get started free</Link>
          <Link to="/pricing" className="btn-secondary">See pricing</Link>
        </div>
        <div className="showcase-scroll-cue" aria-hidden="true">
          <span />
        </div>
      </header>

      <main className="showcase-body">
        <ShowcaseSection
          id="chordpro"
          kicker="Songbook"
          title="Chords that read the way musicians already write them"
          copy="Type [G]Amazing [C]grace inline with the lyrics. Gigboy renders clean chord charts and transposes in real time — no re-typing, no fumbling on stage."
        >
          <ChordProDemo />
        </ShowcaseSection>

        <ShowcaseSection
          id="setlists"
          kicker="Setlists"
          title="Build the set in seconds"
          copy="Order songs for a gig, reorder on the fly, and switch into concert mode for a distraction-free view during the show."
          align="right"
        >
          <SetlistDemo />
        </ShowcaseSection>

        <ShowcaseSection
          id="bands"
          kicker="Collaboration"
          title="One workspace, the whole band"
          copy="Invite every member with a role that fits — owner, editor, or member. Everyone reads from the same shared library and setlists."
        >
          <BandDemo />
        </ShowcaseSection>

        <ShowcaseSection
          id="gig-docs"
          kicker="Show up prepared"
          title="Press kits, tech riders & stage plots"
          copy="Generate professional gig documents per band and share them with a single public link — no login required for the person on the other end."
          align="right"
        >
          <GigDocsDemo />
        </ShowcaseSection>

        <ShowcaseSection
          id="rehearsal"
          kicker="Rehearsal tools"
          title="Everything you'd otherwise need a separate app for"
          copy="A visual metronome, chromatic tuner, and browser-based recorder — built into the same page as the song you're rehearsing."
        >
          <RehearsalDemo />
        </ShowcaseSection>

        <ShowcaseSection
          id="more"
          kicker="And more"
          title="The small things that add up"
          copy="Attachments, full-text search, multi-language songs, offline support, and a dark mode that's actually easy on the eyes at a late rehearsal."
          align="right"
        >
          <MoreFeaturesDemo />
        </ShowcaseSection>
      </main>

      <footer className="showcase-cta">
        <Disc3 size={28} aria-hidden="true" />
        <h2>Ready to get your band organized?</h2>
        <p>Free to start. Upgrade only when you need more storage, members, or setlists.</p>
        <div className="showcase-hero-ctas">
          <Link to="/login" className="btn-primary">Get started free</Link>
          <Link to="/pricing" className="btn-secondary">See pricing</Link>
        </div>
        <p className="footer-links" style={{ marginTop: '1.5rem' }}>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </p>
      </footer>
    </div>
  );
}
