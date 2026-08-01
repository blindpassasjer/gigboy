import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Check,
  Disc3,
  FileText,
  Globe2,
  Guitar,
  ListMusic,
  Map as MapIcon,
  Menu,
  Mic2,
  Minus,
  Moon,
  Music,
  Newspaper,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Users,
  WifiOff,
  X,
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

const NAV_LINKS = [
  { id: 'features', label: 'Features' },
  { id: 'demo', label: 'See it work' },
  { id: 'how', label: 'How it works' },
  { id: 'plans', label: 'Plans' },
] as const;

/** Reveals an element with a fade/slide-up transition once it scrolls into view. */
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
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({ as: As = 'div', className = '', children }: { as?: 'div' | 'section'; className?: string; children: ReactNode }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <As ref={ref as never} className={`showcase-reveal${visible ? ' is-visible' : ''} ${className}`}>
      {children}
    </As>
  );
}

/** Sticky top navigation with section anchors and a mobile menu. */
function ShowcaseNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`showcase-nav${scrolled ? ' is-scrolled' : ''}`}>
      <div className="showcase-nav-inner">
        <Link to="/" className="showcase-nav-brand">
          <BrandMark size={26} />
        </Link>
        <nav className="showcase-nav-links" aria-label="Showcase sections">
          {NAV_LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`}>{l.label}</a>
          ))}
        </nav>
        <div className="showcase-nav-ctas">
          <Link to="/login" className="showcase-nav-login">Log in</Link>
          <Link to="/login" className="btn-primary showcase-nav-cta">Get started free</Link>
        </div>
        <button
          type="button"
          className="showcase-nav-menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {menuOpen && (
        <nav className="showcase-nav-mobile" aria-label="Showcase sections (mobile)">
          {NAV_LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} onClick={() => setMenuOpen(false)}>{l.label}</a>
          ))}
          <Link to="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
          <Link to="/login" className="btn-primary" onClick={() => setMenuOpen(false)}>Get started free</Link>
        </nav>
      )}
    </header>
  );
}

function HeroChordCard() {
  const [transpose, setTranspose] = useState(0);
  return (
    <div className="showcase-hero-card">
      <div className="showcase-card-toolbar">
        <span className="showcase-card-label"><Music size={13} aria-hidden="true" /> Harbor Lights</span>
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

const FEATURES = [
  {
    icon: ListMusic,
    title: 'ChordPro songbook',
    desc: 'Type chords inline with the lyrics and get clean, transposable charts — no re-typing on stage.',
  },
  {
    icon: Users,
    title: 'One workspace, whole band',
    desc: 'Invite members with a role that fits — owner, editor, or member. Everyone reads the same library.',
  },
  {
    icon: Newspaper,
    title: 'Gig documents',
    desc: 'Press kits, tech riders, and stage plots, shareable with a single public link — no login required.',
  },
  {
    icon: Activity,
    title: 'Rehearsal tools',
    desc: 'A visual metronome, chromatic tuner, and recorder built right into the song you’re practicing.',
  },
  {
    icon: Globe2,
    title: 'Multi-language',
    desc: 'Write and read songs in any language, with search and filters that understand your library.',
  },
  {
    icon: WifiOff,
    title: 'Offline-capable PWA',
    desc: 'Install it and take it to the gig. No signal, no problem — your setlist is already on the device.',
  },
];

function FeatureGrid() {
  return (
    <div className="showcase-feature-grid">
      {FEATURES.map(({ icon: Icon, title, desc }, i) => (
        <Reveal key={title} className="showcase-feature-card" as="div">
          <span className="showcase-feature-icon" style={{ transitionDelay: `${i * 60}ms` }} aria-hidden="true">
            <Icon size={20} />
          </span>
          <h3>{title}</h3>
          <p>{desc}</p>
        </Reveal>
      ))}
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

function GigDocsDemo() {
  const docs = [
    { icon: Newspaper, label: 'Press kit', desc: 'Bio, photos & links' },
    { icon: FileText, label: 'Tech rider', desc: 'Inputs & backline' },
    { icon: MapIcon, label: 'Stage plot', desc: 'Positions & monitors' },
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
    <div className="showcase-more-strip">
      <div className="showcase-card showcase-more-card">
        <Search size={16} aria-hidden="true" />
        <span>Full-text search across your whole library</span>
      </div>
      <div className="showcase-card showcase-more-card">
        <Globe2 size={16} aria-hidden="true" />
        <div className="showcase-lang-strip">
          {langs.map((code) => <LanguageBadge key={code} code={code} size="sm" />)}
        </div>
      </div>
      <button type="button" className="showcase-card showcase-more-card showcase-dark-toggle" onClick={toggle}>
        {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        <span>Tap to try {dark ? 'light' : 'dark'} mode</span>
      </button>
    </div>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'Add your songs',
    desc: 'Paste lyrics with inline chords or import from a text file. Gigboy handles the formatting.',
  },
  {
    n: '02',
    title: 'Build the set',
    desc: 'Order songs for the gig, invite your bandmates, and attach the rider, stage plot, and press kit.',
  },
  {
    n: '03',
    title: 'Take the stage',
    desc: 'Switch into concert mode for a distraction-free view, transpose on the fly, and play.',
  },
];

function HowItWorks() {
  return (
    <div className="showcase-steps">
      {STEPS.map((s, i) => (
        <Reveal key={s.n} className="showcase-step">
          <span className="showcase-step-num" style={{ transitionDelay: `${i * 80}ms` }}>{s.n}</span>
          <h3>{s.title}</h3>
          <p>{s.desc}</p>
        </Reveal>
      ))}
    </div>
  );
}

const PLANS = [
  {
    tier: 'Free',
    tagline: 'One band, forever free',
    features: ['Full songbook & ChordPro editor', 'Setlists & concert mode', '1 band workspace'],
    highlight: false,
  },
  {
    tier: 'Pro',
    tagline: 'All features, solo member',
    features: ['Everything in Free', 'Gig docs: press kit, rider, stage plot', 'Song attachments & recordings'],
    highlight: true,
  },
  {
    tier: 'Crew',
    tagline: 'All features, up to 5 members',
    features: ['Everything in Pro', 'Up to 5 band members', 'Shared roles & permissions'],
    highlight: false,
  },
] as const;

function PlansTeaser() {
  return (
    <div className="showcase-plans-grid">
      {PLANS.map((p) => (
        <div className={`showcase-plan-card${p.highlight ? ' is-highlight' : ''}`} key={p.tier}>
          {p.highlight && <span className="showcase-plan-badge">Most popular</span>}
          <h3>{p.tier}</h3>
          <p className="showcase-plan-tagline">{p.tagline}</p>
          <ul>
            {p.features.map((f) => (
              <li key={f}><Check size={14} aria-hidden="true" /> {f}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ShowcasePage() {
  const heroReveal = useReveal<HTMLDivElement>();

  return (
    <div className="showcase-page">
      <ShowcaseNav />

      <header className={`showcase-hero${heroReveal.visible ? ' is-visible' : ''}`} ref={heroReveal.ref}>
        <div className="showcase-hero-bg" aria-hidden="true">
          <span className="showcase-note showcase-note--1">&#9835;</span>
          <span className="showcase-note showcase-note--2">&#9834;</span>
          <span className="showcase-note showcase-note--3">&#9835;</span>
          <span className="showcase-note showcase-note--4">&#9833;</span>
        </div>
        <div className="showcase-hero-inner">
          <div className="showcase-hero-copy">
            <span className="showcase-eyebrow">For working bands</span>
            <h1>Your whole band, one workspace</h1>
            <p>
              Songbook, setlists, gig documents, and rehearsal tools &mdash; everything a band needs
              to show up prepared, shared in real time with everyone in the lineup.
            </p>
            <div className="showcase-hero-ctas">
              <Link to="/login" className="btn-primary">Get started free</Link>
              <Link to="/pricing" className="btn-secondary">See pricing</Link>
            </div>
            <p className="showcase-hero-note">Free forever for one band. No credit card required.</p>
          </div>
          <div className="showcase-hero-visual">
            <HeroChordCard />
          </div>
        </div>
      </header>

      <main className="showcase-body">
        <section id="features" className="showcase-section-block">
          <Reveal as="div" className="showcase-section-head">
            <span className="showcase-kicker">Everything included</span>
            <h2>Built for the way bands actually work</h2>
            <p>No add-ons to hunt down, no separate apps for rehearsal. It's all in Gigboy from day one.</p>
          </Reveal>
          <FeatureGrid />
        </section>

        <section id="demo" className="showcase-section-block showcase-section-block--muted">
          <Reveal as="div" className="showcase-section-head">
            <span className="showcase-kicker">See it work</span>
            <h2>From setlist to stage plot in one place</h2>
          </Reveal>

          <div className="showcase-demo-row">
            <Reveal className="showcase-demo-copy">
              <h3>Build the set in seconds</h3>
              <p>Order songs for a gig, reorder on the fly, and switch into concert mode for a distraction-free view during the show.</p>
            </Reveal>
            <Reveal className="showcase-demo-visual"><SetlistDemo /></Reveal>
          </div>

          <div className="showcase-demo-row showcase-demo-row--reverse">
            <Reveal className="showcase-demo-copy">
              <h3>Show up prepared</h3>
              <p>Generate professional gig documents per band and share them with a single public link &mdash; no login required for the person on the other end.</p>
            </Reveal>
            <Reveal className="showcase-demo-visual"><GigDocsDemo /></Reveal>
          </div>

          <div className="showcase-demo-row">
            <Reveal className="showcase-demo-copy">
              <h3>Rehearse without extra apps</h3>
              <p>A visual metronome, chromatic tuner, and browser-based recorder &mdash; built into the same page as the song you're rehearsing.</p>
            </Reveal>
            <Reveal className="showcase-demo-visual"><RehearsalDemo /></Reveal>
          </div>

          <Reveal className="showcase-more-wrap"><MoreFeaturesDemo /></Reveal>
        </section>

        <section id="how" className="showcase-section-block">
          <Reveal as="div" className="showcase-section-head">
            <span className="showcase-kicker">How it works</span>
            <h2>Three steps to a tighter show</h2>
          </Reveal>
          <HowItWorks />
        </section>

        <section id="plans" className="showcase-section-block showcase-section-block--muted">
          <Reveal as="div" className="showcase-section-head">
            <span className="showcase-kicker">Plans</span>
            <h2>Start free. Upgrade only when your band outgrows it.</h2>
            <p>Every account gets one free band, forever.</p>
          </Reveal>
          <PlansTeaser />
          <div className="showcase-plans-cta">
            <Link to="/pricing" className="btn-secondary">Compare plans in detail <ArrowRight size={14} /></Link>
          </div>
        </section>
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
          <span className="showcase-footer-security"><ShieldCheck size={12} aria-hidden="true" /> Private by default</span>
        </p>
      </footer>
    </div>
  );
}
