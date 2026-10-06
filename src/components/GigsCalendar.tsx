import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Gig } from '../types';

interface Props {
  gigs: Gig[];
  /** Any date inside the month being shown. */
  month: Date;
  onMonthChange: (month: Date) => void;
  selectedId: string | null;
  onSelect: (gigId: string | null) => void;
}

const MAX_CHIPS_PER_DAY = 3;

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday-first weekday labels, localized. 2024-01-01 was a Monday. */
const WEEKDAY_LABELS = (() => {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
})();

// Constructing a formatter per call (what toLocale*String does) is slow; the calendar formats a time per chip.
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/** The visible weeks of `month`, each a Monday-first row of 7 days (spilling into neighbouring months). */
function buildWeeks(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weekCount = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weekCount }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)),
  );
}

function timeLabel(iso: string): string {
  return TIME_FORMAT.format(new Date(iso));
}

export default function GigsCalendar({ gigs, month, onMonthChange, selectedId, onSelect }: Props) {
  // Days whose "+N more" has been opened show every gig instead of the first few.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());
  const toggleDay = (key: string) =>
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const byDay = useMemo(() => {
    const map = new Map<string, Gig[]>();
    for (const gig of gigs) {
      const key = dayKey(new Date(gig.startsAt));
      const list = map.get(key);
      if (list) list.push(gig);
      else map.set(key, [gig]);
    }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [gigs]);

  const weeks = useMemo(() => buildWeeks(month), [month]);
  const nowMs = Date.now();
  const todayKey = dayKey(new Date());
  const shiftMonth = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const title = MONTH_FORMAT.format(month);

  return (
    <div className="gigs-calendar">
      <div className="gigs-calendar-nav">
        <button type="button" className="btn btn--secondary" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={14} />
        </button>
        <h3 className="gigs-calendar-title" aria-live="polite">{title}</h3>
        <button type="button" className="btn btn--secondary" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className="btn btn--secondary gigs-calendar-today"
          onClick={() => onMonthChange(new Date())}
        >
          Today
        </button>
      </div>

      <div className="gigs-calendar-grid" role="grid" aria-label={title}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="gigs-calendar-weekday" role="columnheader">{label}</div>
        ))}
        {weeks.flat().map((day) => {
          const key = dayKey(day);
          const dayGigs = byDay.get(key) ?? [];
          const outside = day.getMonth() !== month.getMonth();
          return (
            <div
              key={key}
              role="gridcell"
              className={[
                'gigs-calendar-day',
                outside ? 'gigs-calendar-day--outside' : '',
                key === todayKey ? 'gigs-calendar-day--today' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="gigs-calendar-daynum">{day.getDate()}</span>
              {(expandedDays.has(key) ? dayGigs : dayGigs.slice(0, MAX_CHIPS_PER_DAY)).map((gig) => (
                <button
                  key={gig.id}
                  type="button"
                  className={`gigs-chip gigs-chip--${gig.status}${new Date(gig.startsAt).getTime() < nowMs ? ' gigs-chip--past' : ''}${selectedId === gig.id ? ' gigs-chip--selected' : ''}`}
                  onClick={() => onSelect(selectedId === gig.id ? null : gig.id)}
                  title={`${timeLabel(gig.startsAt)} ${gig.title}`}
                >
                  <span className="gigs-chip-time">{timeLabel(gig.startsAt)}</span> {gig.title}
                </button>
              ))}
              {dayGigs.length > MAX_CHIPS_PER_DAY && (
                <button
                  type="button"
                  className="gigs-chip gigs-chip--more"
                  aria-expanded={expandedDays.has(key)}
                  onClick={() => toggleDay(key)}
                >
                  {expandedDays.has(key) ? 'Show less' : `+${dayGigs.length - MAX_CHIPS_PER_DAY} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
