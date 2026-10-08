import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CalendarPlus,
  Copy,
  LayoutGrid,
  List as ListIcon,
  MapPin,
  Pencil,
  PenLine,
  RefreshCw,
  Rss,
  Search,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { dataClient } from '../lib/dataClient';
import type { CalendarFeed } from '../lib/dataClient/types';
import { generateId } from '../lib/uuid';
import { readStoredString, writeStoredString } from '../lib/safeStorage';
import { isDemoMode } from '../lib/demo/demoMode';
import { showConfirmToast } from '../utils/toastDialogs';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import GigsCalendar from '../components/GigsCalendar';
import type { Gig, GigStatus, InputList, PressKit, Setlist } from '../types';

type ViewMode = 'calendar' | 'cards' | 'list';

const VIEW_STORAGE_KEY = 'gigboy-gigs-view';
const VIEWS: { mode: ViewMode; label: string; icon: typeof CalendarDays }[] = [
  { mode: 'calendar', label: 'Calendar', icon: CalendarDays },
  { mode: 'cards', label: 'Cards', icon: LayoutGrid },
  { mode: 'list', label: 'List', icon: ListIcon },
];

function readStoredView(): ViewMode {
  const stored = readStoredString(VIEW_STORAGE_KEY);
  return stored === 'cards' || stored === 'list' ? stored : 'calendar';
}

const STATUS_LABEL: Record<GigStatus, string> = {
  confirmed: 'Confirmed',
  tentative: 'Tentative',
  cancelled: 'Cancelled',
};

/** ISO → the "YYYY-MM-DDTHH:mm" local string a datetime-local input expects. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Hoisted: toLocale*String builds a new formatter on every call, and search formats every gig's date per keystroke.
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

function formatTime(iso: string): string {
  return TIME_FORMAT.format(new Date(iso));
}

type Draft = Omit<Gig, 'createdAt' | 'updatedAt'>;

function emptyDraft(tourId?: string): Draft {
  // Start from the next full hour; the user picks the real time.
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return {
    id: generateId(),
    tourId,
    title: '',
    startsAt: start.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: 'confirmed',
  };
}

/** Empty strings become undefined so the server stores null instead of "". */
function cleanDraft(draft: Draft): Draft {
  const trimmed = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    ...draft,
    title: draft.title.trim(),
    venue: trimmed(draft.venue),
    address: trimmed(draft.address),
    contactName: trimmed(draft.contactName),
    contactPhone: trimmed(draft.contactPhone),
    contactEmail: trimmed(draft.contactEmail),
    notes: trimmed(draft.notes),
    tourId: draft.tourId || undefined,
    setlistId: draft.setlistId || undefined,
    pressKitId: draft.pressKitId || undefined,
    riderId: draft.riderId || undefined,
  };
}

export default function BandGigsPage() {
  const { id, tourId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    bands,
    loading,
    bandToursByBandId,
    bandGigsByBandId,
    refreshBandTours,
    refreshBandGigs,
    updateBandGigsCache,
    renameBandTour,
    deleteBandTour,
  } = useBands();
  const band = bands.find((entry) => entry.id === id) ?? null;
  const tours = useMemo(() => (id ? (bandToursByBandId[id] ?? []) : []), [bandToursByBandId, id]);
  const toursLoaded = id ? bandToursByBandId[id] !== undefined : false;
  const tour = tourId ? (tours.find((t) => t.id === tourId) ?? null) : null;
  useDocumentTitle(band ? `${tour ? tour.name : 'Gigs'} · ${band.name}` : 'Gigs');

  // Gigs live in the shared band cache so the sidebar's tour counts stay in step with this page.
  const gigs = useMemo(() => (id ? (bandGigsByBandId[id] ?? []) : []), [bandGigsByBandId, id]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [pressKits, setPressKits] = useState<PressKit[]>([]);
  const [riders, setRiders] = useState<InputList[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const feedMenuRef = useRef<HTMLDivElement>(null);
  const feedButtonRef = useRef<HTMLButtonElement>(null);
  const feedPanelRef = useRef<HTMLDivElement>(null);
  const [showPast, setShowPast] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [month, setMonth] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingTour, setRenamingTour] = useState<string | null>(null);

  useEffect(() => {
    if (!showFeed) return;
    const onDown = (e: MouseEvent) => {
      if (!feedMenuRef.current?.contains(e.target as Node)) setShowFeed(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFeed(false);
        feedButtonRef.current?.focus();
      }
    };
    feedPanelRef.current?.focus();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showFeed]);
  const canEdit = band
    ? band.ownerId === user?.id || band.memberRoles[user?.id ?? ''] === 'editor'
    : false;

  const load = useCallback(async (bandId: string) => {
    try {
      const [, s, p, r, f] = await Promise.all([
        refreshBandGigs(bandId),
        dataClient.bandSetlists.list(bandId),
        dataClient.bandPressKits.list(bandId),
        dataClient.bandRiders.list(bandId),
        dataClient.calendarFeed.get(bandId),
      ]);
      setSetlists(s);
      setPressKits(p);
      setRiders(r);
      setFeed(f);
    } catch (error) {
      console.error('Failed to load gigs.', error);
      toast.error('Failed to load gigs.');
    } finally {
      setLoaded(true);
    }
  }, [refreshBandGigs]);

  useEffect(() => {
    if (id && band) void load(id);
  }, [id, band?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps -- reload per band, not per band-object identity

  useEffect(() => {
    if (id && band && !toursLoaded) {
      void refreshBandTours(id).catch((error) => console.error('Failed to load tours.', error));
    }
  }, [id, band, toursLoaded, refreshBandTours]);

  // Switching tour (or band) starts from a clean slate.
  useEffect(() => {
    setSelectedId(null);
    setQuery('');
    setDraft(null);
    setRenamingTour(null);
  }, [id, tourId]);

  const changeView = (next: ViewMode) => {
    setView(next);
    writeStoredString(VIEW_STORAGE_KEY, next);
  };

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of setlists) map.set(s.id, s.name);
    for (const p of pressKits) map.set(p.id, p.name);
    for (const r of riders) map.set(r.id, r.name);
    for (const t of tours) map.set(t.id, t.name);
    return (resourceId: string | undefined) => (resourceId ? map.get(resourceId) : undefined);
  }, [setlists, pressKits, riders, tours]);

  const searching = query.trim().length > 0;

  /** Gigs in scope (this tour, or all) that match the search. Every word must match somewhere in the gig. */
  const visibleGigs = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (gig: Gig) => {
      if (terms.length === 0) return true;
      const haystack = [
        gig.title,
        gig.venue,
        gig.address,
        gig.contactName,
        gig.contactPhone,
        gig.contactEmail,
        gig.notes,
        STATUS_LABEL[gig.status],
        nameOf(gig.tourId),
        nameOf(gig.setlistId),
        nameOf(gig.riderId),
        nameOf(gig.pressKitId),
        formatDate(gig.startsAt),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    };
    return gigs
      .filter((g) => !tourId || g.tourId === tourId)
      .filter(matches)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [gigs, query, tourId, nameOf]);

  const { upcoming, past } = useMemo(() => {
    const nowMs = Date.now();
    return {
      upcoming: visibleGigs.filter((g) => new Date(g.startsAt).getTime() >= nowMs),
      past: visibleGigs.filter((g) => new Date(g.startsAt).getTime() < nowMs).reverse(),
    };
  }, [visibleGigs]);

  const selectedGig = visibleGigs.find((g) => g.id === selectedId) ?? null;

  if (loading && !band) return <p className="bands-status">Loading band…</p>;

  if (!band || !id) {
    return (
      <section className="bands-page">
        <p className="bands-status">Band not found.</p>
        <Link to="/bands" className="btn btn--secondary">Back to bands</Link>
      </section>
    );
  }

  if (tourId && toursLoaded && !tour) {
    return (
      <section className="bands-page">
        <p className="bands-status">Tour not found.</p>
        <Link to={`/bands/${band.id}/gigs`} className="btn btn--secondary">All gigs</Link>
      </section>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = async () => {
    if (!draft) return;
    const cleaned = cleanDraft(draft);
    if (!cleaned.title) {
      toast.error('Give the gig a title.');
      return;
    }
    if (cleaned.endsAt && new Date(cleaned.endsAt).getTime() <= new Date(cleaned.startsAt).getTime()) {
      toast.error('The end time must be after the start.');
      return;
    }
    setSaving(true);
    try {
      const exists = gigs.some((g) => g.id === cleaned.id);
      const saved = exists
        ? await dataClient.bandGigs.update(id, cleaned)
        : await dataClient.bandGigs.create(id, cleaned);
      updateBandGigsCache(id, (prev) => (exists ? prev.map((g) => (g.id === saved.id ? saved : g)) : [...prev, saved]));
      setDraft(null);
      setSelectedId(saved.id);
      // Bring the calendar to the gig's month so a newly added gig is visible.
      setMonth(new Date(saved.startsAt));
      toast.success(exists ? 'Gig updated.' : 'Gig added.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save gig.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (gig: Gig) => {
    const confirmed = await showConfirmToast(`Delete "${gig.title}"? You can restore it from trash.`, {
      confirmLabel: 'Delete gig',
    });
    if (!confirmed) return;
    try {
      await dataClient.bandGigs.remove(id, gig.id);
      updateBandGigsCache(id, (prev) => prev.filter((g) => g.id !== gig.id));
      setSelectedId((prev) => (prev === gig.id ? null : prev));
      toast.success('Gig moved to trash.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete gig.');
    }
  };

  const handleRenameTour = async () => {
    if (!tour || renamingTour === null) return;
    const name = renamingTour.trim();
    setRenamingTour(null);
    if (!name || name === tour.name) return;
    const error = await renameBandTour(id, tour.id, name);
    if (error) toast.error(error);
  };

  const handleDeleteTour = async () => {
    if (!tour) return;
    const confirmed = await showConfirmToast(
      `Delete the tour "${tour.name}"? Its gigs are kept, just no longer grouped. You can restore the tour from trash.`,
      { confirmLabel: 'Delete tour' },
    );
    if (!confirmed) return;
    const error = await deleteBandTour(id, tour.id);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Tour moved to trash.');
    navigate(`/bands/${id}/gigs`);
  };

  const runFeed = async (action: () => Promise<CalendarFeed | null>, success?: string) => {
    setFeedBusy(true);
    try {
      setFeed(await action());
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Calendar feed request failed.');
    } finally {
      setFeedBusy(false);
    }
  };

  const copyFeedUrl = async () => {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed.feedUrl);
      toast.success('Feed link copied.');
    } catch {
      toast.error('Could not copy — select the link and copy it manually.');
    }
  };

  const gigActions = (gig: Gig) =>
    canEdit && (
      <div className="gigs-item-actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setDraft({ ...gig })}
          aria-label={`Edit ${gig.title}`}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => void handleDelete(gig)}
          aria-label={`Delete ${gig.title}`}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    );

  /** The full-detail card, used by Cards view, the Calendar's selected gig and an expanded List row. */
  const renderGigCard = (gig: Gig) => {
    const attachments = [
      { label: 'Setlist', name: nameOf(gig.setlistId) },
      { label: 'Tech rider', name: nameOf(gig.riderId) },
      { label: 'Press kit', name: nameOf(gig.pressKitId) },
    ].filter((a) => a.name);
    const schedule = [
      gig.getInAt ? `Get in ${formatTime(gig.getInAt)}` : null,
      gig.soundCheckAt ? `Sound check ${formatTime(gig.soundCheckAt)}` : null,
      `On stage ${formatTime(gig.startsAt)}`,
    ].filter(Boolean);
    const tourName = tourId ? null : nameOf(gig.tourId);
    return (
      <div key={gig.id} className={`gigs-item gigs-item--${gig.status}`}>
        <div className="gigs-item-main">
          <div className="gigs-item-date">
            {formatDate(gig.startsAt)}
            {tourName && <span className="gigs-item-tour"> · {tourName}</span>}
          </div>
          <h3 className="gigs-item-title">
            {gig.title}
            {gig.status !== 'confirmed' && <span className="gigs-status">{STATUS_LABEL[gig.status]}</span>}
          </h3>
          {(gig.venue || gig.address) && (
            <p className="gigs-item-line">
              <MapPin size={13} /> {[gig.venue, gig.address].filter(Boolean).join(', ')}
            </p>
          )}
          <p className="gigs-item-line">{schedule.join(' · ')}</p>
          {(gig.contactName || gig.contactPhone || gig.contactEmail) && (
            <p className="gigs-item-line">
              <UserIcon size={13} />{' '}
              {[gig.contactName, gig.contactPhone, gig.contactEmail].filter(Boolean).join(' · ')}
            </p>
          )}
          {attachments.length > 0 && (
            <p className="gigs-item-line">{attachments.map((a) => `${a.label}: ${a.name}`).join(' · ')}</p>
          )}
          {gig.notes && <p className="gigs-item-notes">{gig.notes}</p>}
        </div>
        {gigActions(gig)}
      </div>
    );
  };

  /** Compact one-line row; click to expand the full card underneath. */
  const renderGigRow = (gig: Gig) => {
    const expanded = selectedId === gig.id;
    return (
      <li key={gig.id} className={`gigs-row gigs-row--${gig.status}`}>
        <button
          type="button"
          className="gigs-row-main"
          aria-expanded={expanded}
          onClick={() => setSelectedId(expanded ? null : gig.id)}
        >
          <span className="gigs-row-date">{formatDate(gig.startsAt)}</span>
          <span className="gigs-row-title">{gig.title}</span>
          <span className="gigs-row-venue">{gig.venue ?? ''}</span>
          <span className="gigs-row-time">{formatTime(gig.startsAt)}</span>
          {gig.status !== 'confirmed' && <span className="gigs-status">{STATUS_LABEL[gig.status]}</span>}
        </button>
        {expanded && <div className="gigs-row-detail">{renderGigCard(gig)}</div>}
      </li>
    );
  };

  const attachmentSelect = (
    label: string,
    key: 'setlistId' | 'riderId' | 'pressKitId',
    options: { id: string; name: string }[],
  ) => (
    <label className="share-menu-field">
      <span>{label}</span>
      <select value={draft?.[key] ?? ''} onChange={(e) => set(key, e.target.value || undefined)}>
        <option value="">None</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );

  const renderCollection = (items: Gig[]) =>
    view === 'cards' ? (
      <div className="gigs-cards">{items.map(renderGigCard)}</div>
    ) : (
      <ul className="gigs-list">{items.map(renderGigRow)}</ul>
    );

  const webcalUrl = feed ? feed.feedUrl.replace(/^https?:/, 'webcal:') : null;
  const heading = tour ? tour.name : `${band.name} gigs`;

  return (
    <section className="bands-page">
      <header className="bands-header">
        <div>
          {tour && renamingTour !== null ? (
            <input
              className="gigs-rename-input"
              value={renamingTour}
              onChange={(e) => setRenamingTour(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRenameTour();
                if (e.key === 'Escape') setRenamingTour(null);
              }}
              onBlur={() => void handleRenameTour()}
              aria-label="Tour name"
              autoFocus
            />
          ) : (
            <div className="song-list-title-row">
              <h1>{heading}</h1>
              {canEdit && tour && (
                <button
                  type="button"
                  className="title-rename-btn"
                  onClick={() => setRenamingTour(tour.name)}
                  aria-label="Rename tour"
                  title="Rename tour"
                >
                  <PenLine size={14} />
                </button>
              )}
            </div>
          )}
          <p>
            {tour
              ? 'Gigs on this tour, with schedule, contacts and the setlist, rider and press kit for each.'
              : 'Every gig across all tours, with schedule, contacts and the setlist, rider and press kit for each.'}
          </p>
        </div>
        <div className="gigs-header-actions">
          {!tourId && (
            <div className="share-menu" ref={feedMenuRef}>
              <button
                ref={feedButtonRef}
                type="button"
                className="btn btn--secondary btn--accent"
                onClick={() => setShowFeed((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={showFeed}
                aria-label="RSS feed"
                title="RSS feed"
              >
                <Rss size={14} /> <span className="gigs-view-label">RSS feed</span>
              </button>
              {showFeed && (
                <div className="share-menu-panel" role="dialog" aria-label="Calendar subscription" ref={feedPanelRef} tabIndex={-1}>
                  <span className="share-menu-title">Subscribe in your calendar</span>
                  {isDemoMode ? (
                    <p className="bands-status">
                      When you run your own Gigboy, every member gets a personal calendar link here that keeps Google, Apple or
                      Outlook calendar up to date. It needs a running server, so it isn’t available in this demo.
                    </p>
                  ) : (
                    <>
                      <p className="bands-status">
                        A personal, private link to every gig in this band across all tours, including the schedule and contact.
                        Add it to Google, Apple or Outlook calendar and it stays up to date. Don’t share it — it works only while
                        you’re a member.
                      </p>
                      {feed ? (
                        <>
                          <div className="share-menu-input-wrap">
                            <input type="text" readOnly value={feed.feedUrl} aria-label="Calendar feed link" onFocus={(e) => e.currentTarget.select()} />
                            <button type="button" className="share-menu-input-action" onClick={() => void copyFeedUrl()} aria-label="Copy link" title="Copy link">
                              <Copy size={14} />
                            </button>
                          </div>
                          <div className="bands-delete-confirm-actions">
                            <a className="btn btn--primary" href={webcalUrl ?? undefined}>
                              <CalendarPlus size={14} /> Add to calendar
                            </a>
                            <button
                              type="button"
                              className="btn btn--secondary"
                              disabled={feedBusy}
                              onClick={() => void runFeed(() => dataClient.calendarFeed.regenerate(id), 'New link created. The old one no longer works.')}
                            >
                              <RefreshCw size={14} /> New link
                            </button>
                            <button
                              type="button"
                              className="btn btn--secondary"
                              disabled={feedBusy}
                              onClick={() => void runFeed(async () => { await dataClient.calendarFeed.disable(id); return null; }, 'Calendar link turned off.')}
                            >
                              Turn off
                            </button>
                          </div>
                        </>
                      ) : (
                        <div>
                          <button
                            type="button"
                            className="btn btn--primary"
                            disabled={feedBusy}
                            onClick={() => void runFeed(() => dataClient.calendarFeed.create(id))}
                          >
                            <CalendarPlus size={14} /> Create my calendar link
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {canEdit && tour && (
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => void handleDeleteTour()}
                aria-label="Delete tour"
                title="Delete tour"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </header>

      {canEdit && !draft && (
        <button
          type="button"
          className="fab-add-song"
          title="Add gig"
          aria-label="Add gig"
          onClick={() => setDraft(emptyDraft(tourId))}
        >
          <CalendarPlus size={20} />
        </button>
      )}

      <div className="gigs-toolbar">
        <div className="search-box gigs-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search gigs by title, venue, contact, notes…"
            aria-label="Search gigs"
          />
        </div>
        <div className="view-toggle" role="group" aria-label="Gig view">
          {VIEWS.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              className={`view-toggle-btn${view === mode ? ' active' : ''}`}
              aria-pressed={view === mode}
              onClick={() => changeView(mode)}
              title={`${label} view`}
              aria-label={`${label} view`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {draft && (
        <section className="bands-panel gigs-form" aria-label={gigs.some((g) => g.id === draft.id) ? 'Edit gig' : 'New gig'}>
          <h3>{gigs.some((g) => g.id === draft.id) ? 'Edit gig' : 'New gig'}</h3>
          <div className="gigs-form-grid">
            <label className="share-menu-field gigs-form-wide">
              <span>Title</span>
              <input type="text" value={draft.title} onChange={(e) => set('title', e.target.value)} autoFocus />
            </label>
            <label className="share-menu-field">
              <span>Tour</span>
              <select value={draft.tourId ?? ''} onChange={(e) => set('tourId', e.target.value || undefined)}>
                <option value="">No tour</option>
                {tours.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="share-menu-field">
              <span>Status</span>
              <select value={draft.status} onChange={(e) => set('status', e.target.value as GigStatus)}>
                {(Object.keys(STATUS_LABEL) as GigStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="share-menu-field">
              <span>Venue</span>
              <input type="text" value={draft.venue ?? ''} onChange={(e) => set('venue', e.target.value)} />
            </label>
            <label className="share-menu-field">
              <span>Address</span>
              <input type="text" value={draft.address ?? ''} onChange={(e) => set('address', e.target.value)} />
            </label>
            <label className="share-menu-field">
              <span>Get in</span>
              <input
                type="datetime-local"
                value={toLocalInput(draft.getInAt)}
                onChange={(e) => set('getInAt', fromLocalInput(e.target.value))}
              />
            </label>
            <label className="share-menu-field">
              <span>Sound check</span>
              <input
                type="datetime-local"
                value={toLocalInput(draft.soundCheckAt)}
                onChange={(e) => set('soundCheckAt', fromLocalInput(e.target.value))}
              />
            </label>
            <label className="share-menu-field">
              <span>On stage</span>
              <input
                type="datetime-local"
                value={toLocalInput(draft.startsAt)}
                onChange={(e) => {
                  const next = fromLocalInput(e.target.value);
                  if (next) set('startsAt', next);
                }}
              />
            </label>
            <label className="share-menu-field">
              <span>Ends</span>
              <input
                type="datetime-local"
                value={toLocalInput(draft.endsAt)}
                onChange={(e) => set('endsAt', fromLocalInput(e.target.value))}
              />
            </label>
            <label className="share-menu-field">
              <span>Contact person</span>
              <input type="text" value={draft.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} />
            </label>
            <label className="share-menu-field">
              <span>Contact phone</span>
              <input type="tel" value={draft.contactPhone ?? ''} onChange={(e) => set('contactPhone', e.target.value)} />
            </label>
            <label className="share-menu-field gigs-form-wide">
              <span>Contact email</span>
              <input type="email" value={draft.contactEmail ?? ''} onChange={(e) => set('contactEmail', e.target.value)} />
            </label>
            {attachmentSelect('Setlist', 'setlistId', setlists)}
            {attachmentSelect('Technical rider', 'riderId', riders)}
            {attachmentSelect('Press kit', 'pressKitId', pressKits)}
            <label className="share-menu-field gigs-form-wide">
              <span>Notes</span>
              <textarea rows={3} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
            </label>
          </div>
          <div className="bands-delete-confirm-actions">
            <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save gig'}
            </button>
            <button type="button" className="btn btn--secondary" disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {!loaded ? (
        <p className="bands-status">Loading gigs…</p>
      ) : view === 'calendar' ? (
        <section className="bands-panel">
          <GigsCalendar
            gigs={visibleGigs}
            month={month}
            onMonthChange={setMonth}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {searching && (
            <p className="bands-status">
              {visibleGigs.length === 0
                ? 'No gigs match your search.'
                : `${visibleGigs.length} matching gig${visibleGigs.length === 1 ? '' : 's'} — use the arrows to browse months.`}
            </p>
          )}
          {!searching && visibleGigs.length === 0 && (
            <p className="bands-status">No gigs yet.{canEdit ? ' Add one with “Add gig”.' : ''}</p>
          )}
          {selectedGig && renderGigCard(selectedGig)}
        </section>
      ) : (
        <>
          <section className="bands-panel">
            <h3>Upcoming</h3>
            {upcoming.length === 0 ? (
              <p className="bands-status">
                {searching
                  ? 'No upcoming gigs match your search.'
                  : `No upcoming gigs.${canEdit ? ' Add one with “Add gig”.' : ''}`}
              </p>
            ) : (
              renderCollection(upcoming)
            )}
          </section>

          {past.length > 0 && (
            <section className="bands-panel gigs-archive" aria-label="Archive">
              <button
                type="button"
                className="gigs-archive-toggle"
                aria-expanded={showPast || searching}
                disabled={searching}
                onClick={() => setShowPast((v) => !v)}
              >
                {showPast || searching ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <h3>Archive</h3>
                <span className="gigs-archive-count">{past.length} past gig{past.length === 1 ? '' : 's'}</span>
              </button>
              {(showPast || searching) && renderCollection(past)}
            </section>
          )}
        </>
      )}
    </section>
  );
}
