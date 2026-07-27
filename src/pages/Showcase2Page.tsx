import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  FileText,
  Guitar,
  ListMusic,
  Map as MapIcon,
  Mic2,
  Minus,
  Newspaper,
  Plus,
  Search,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react';
import ChordDisplay from '../components/ChordDisplay';
import VisualMetronome from '../components/VisualMetronome';
import LanguageBadge from '../components/LanguageBadge';

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

const TICKER_ITEMS = ['CHORD CHARTS', 'SETLISTS', 'BAND HUB', 'GIG DOCS', 'REHEARSAL TOOLS', 'OFFLINE PWA'];

function Marquee() {
  const row = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="sc2-marquee" aria-hidden="true">
      <div className="sc2-marquee-track">
        {row.map((item, i) => (
          <span key={i} className="sc2-marquee-item">
            {item} <span className="sc2-marquee-dot">&bull;</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ChordCard() {
  const [transpose, setTranspose] = useState(0);
  return (
    <article className="sc2-card sc2-card--wide sc2-card--accent" id="chords">
      <header className="sc2-card-head">
        <span className="sc2-card-tag">01 / SONGBOOK</span>
        <div className="sc2-transpose">
          <button type="button" onClick={() => setTranspose((t) => Math.max(t - 1, -6))} aria-label="Transpose down">
            <Minus size={16} />
          </button>
          <span>{transpose > 0 ? `+${transpose}` : transpose}</span>
          <button type="button" onClick={() => setTranspose((t) => Math.min(t + 1, 6))} aria-label="Transpose up">
            <Plus size={16} />
          </button>
        </div>
      </header>
      <h3>CHORDS THAT READ<br />LIKE MUSICIANS WRITE</h3>
      <p>Type <code>[G]Amazing [C]grace</code> inline with the lyrics. Live transpose, zero re-typing.</p>
      <div className="sc2-chord-demo">
        <ChordDisplay chordpro={DEMO_SONG} transpose={transpose} />
      </div>
    </article>
  );
}

function SetlistCard() {
  const items = [
    { title: 'Harbor Lights', duration: '3:42' },
    { title: 'Neon Tide', duration: '4:05' },
    { title: 'Slow Static', duration: '3:18' },
    { title: 'Amber Skies (encore)', duration: '5:01' },
  ];
  return (
    <article className="sc2-card" id="setlists">
      <span className="sc2-card-tag">02 / SETLISTS</span>
      <h3>BUILD THE SET<br />IN SECONDS</h3>
      <ol className="sc2-setlist">
        {items.map((item, i) => (
          <li key={item.title}>
            <span className="sc2-setlist-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="sc2-setlist-title">{item.title}</span>
            <span className="sc2-setlist-duration">{item.duration}</span>
          </li>
        ))}
      </ol>
      <div className="sc2-card-foot">
        <ListMusic size={16} /> Reorder live &middot; concert mode ready
      </div>
    </article>
  );
}

function BandCard() {
  const members = [
    { name: 'Sebastian', role: 'Owner' },
    { name: 'Mia', role: 'Editor' },
    { name: 'Jonas', role: 'Member' },
  ];
  return (
    <article className="sc2-card sc2-card--dark" id="bands">
      <span className="sc2-card-tag">03 / BAND HUB</span>
      <h3>ONE WORKSPACE.<br />THE WHOLE BAND.</h3>
      <ul className="sc2-band-members">
        {members.map((m) => (
          <li key={m.name}>
            <span className="sc2-avatar" aria-hidden="true">{m.name.charAt(0)}</span>
            <span className="sc2-band-name">{m.name}</span>
            <span className="sc2-band-role">{m.role}</span>
          </li>
        ))}
      </ul>
      <div className="sc2-card-foot">
        <Users size={16} /> Owner &middot; editor &middot; member roles
      </div>
    </article>
  );
}

function GigDocsCard() {
  const docs = [
    { icon: Newspaper, label: 'Press kit' },
    { icon: FileText, label: 'Tech rider' },
    { icon: MapIcon, label: 'Stage plot' },
  ];
  return (
    <article className="sc2-card sc2-card--accent2" id="gig-docs">
      <span className="sc2-card-tag">04 / SHOW UP READY</span>
      <h3>PRESS KITS.<br />RIDERS.<br />STAGE PLOTS.</h3>
      <div className="sc2-doc-row">
        {docs.map(({ icon: Icon, label }) => (
          <div className="sc2-doc-chip" key={label}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="sc2-card-foot">
        <ArrowUpRight size={16} /> Shareable link, no login required
      </div>
    </article>
  );
}

function RehearsalCard() {
  return (
    <article className="sc2-card sc2-card--wide" id="rehearsal">
      <span className="sc2-card-tag">05 / REHEARSAL</span>
      <h3>THE APPS YOU'D<br />OTHERWISE NEED THREE OF</h3>
      <div className="sc2-rehearsal-body">
        <VisualMetronome tempo={96} timeSignature="4/4" />
        <div className="sc2-rehearsal-extra">
          <span><Mic2 size={16} /> Recorder</span>
          <span><Guitar size={16} /> Tuner</span>
        </div>
      </div>
    </article>
  );
}

function MoreCard() {
  const langs = ['en', 'no', 'es', 'pt', 'fr'];
  return (
    <article className="sc2-card sc2-card--dark" id="more">
      <span className="sc2-card-tag">06 / AND MORE</span>
      <h3>THE SMALL THINGS<br />THAT ADD UP</h3>
      <ul className="sc2-more-list">
        <li><Search size={16} /> Full-text search across every song</li>
        <li><Globe2Badge /> {langs.map((c) => <LanguageBadge key={c} code={c} size="sm" />)}</li>
        <li><WifiOff size={16} /> Offline-capable PWA &mdash; install &amp; go</li>
        <li><ShieldCheck size={16} /> Free / Pro / Crew &mdash; upgrade only when you outgrow it</li>
      </ul>
    </article>
  );
}

function Globe2Badge() {
  return <span className="sc2-lang-label">Multi-language</span>;
}

export default function Showcase2Page() {
  return (
    <div className="sc2-page">
      <header className="sc2-hero">
        <nav className="sc2-nav">
          <Link to="/" className="sc2-nav-back">&larr; GIGBOY</Link>
          <span className="sc2-nav-badge">SHOWCASE 2.0</span>
        </nav>
        <h1 className="sc2-hero-title">
          YOUR BAND.
          <br />
          <span className="sc2-hero-title-hl">ONE APP.</span>
        </h1>
        <p className="sc2-hero-copy">
          Songbook, setlists, gig docs and rehearsal tools &mdash; built for bands who'd
          rather be playing than juggling six apps.
        </p>
        <div className="sc2-hero-ctas">
          <Link to="/login" className="sc2-btn sc2-btn--primary">GET STARTED FREE</Link>
          <Link to="/pricing" className="sc2-btn sc2-btn--ghost">SEE PRICING</Link>
        </div>
      </header>

      <Marquee />

      <main className="sc2-grid">
        <ChordCard />
        <SetlistCard />
        <BandCard />
        <GigDocsCard />
        <RehearsalCard />
        <MoreCard />
      </main>

      <Marquee />

      <footer className="sc2-cta">
        <h2>READY TO GET<br />YOUR BAND ORGANIZED?</h2>
        <p>Free to start. Upgrade only when you need more storage, members, or setlists.</p>
        <div className="sc2-hero-ctas">
          <Link to="/login" className="sc2-btn sc2-btn--primary">GET STARTED FREE</Link>
          <Link to="/pricing" className="sc2-btn sc2-btn--ghost">SEE PRICING</Link>
        </div>
        <p className="sc2-footer-links">
          <Link to="/showcase">See the original showcase</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </p>
      </footer>
    </div>
  );
}
