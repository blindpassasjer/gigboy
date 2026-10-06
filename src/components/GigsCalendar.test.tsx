import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GigsCalendar from './GigsCalendar';
import type { Gig } from '../types';

const gig = (over: Partial<Gig>): Gig => ({
  id: 'g',
  title: 'Gig',
  startsAt: new Date(2026, 10, 14, 20, 0).toISOString(), // 14 Nov 2026, local
  status: 'confirmed',
  ...over,
});

describe('GigsCalendar', () => {
  afterEach(cleanup);

  it('shows gigs on their day and selects one on click', () => {
    const onSelect = vi.fn();
    render(
      <GigsCalendar
        gigs={[gig({ id: 'a', title: 'Pub night' })]}
        month={new Date(2026, 10, 1)}
        onMonthChange={() => {}}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pub night/ }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('collapses a crowded day into "+N more"', () => {
    const gigs = ['a', 'b', 'c', 'd', 'e'].map((id) => gig({ id, title: `Gig ${id}` }));
    render(
      <GigsCalendar gigs={gigs} month={new Date(2026, 10, 1)} onMonthChange={() => {}} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText('+2 more')).toBeTruthy();
  });

  it('navigates months and starts weeks on Monday', () => {
    const onMonthChange = vi.fn();
    render(
      <GigsCalendar gigs={[]} month={new Date(2026, 10, 1)} onMonthChange={onMonthChange} selectedId={null} onSelect={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    const next = onMonthChange.mock.calls[0][0] as Date;
    expect([next.getFullYear(), next.getMonth()]).toEqual([2026, 11]);

    // 1 Nov 2026 is a Sunday, so it sits in the 7th (last) column of the first row.
    const cells = screen.getAllByRole('gridcell');
    expect(cells[6].textContent).toContain('1');
    expect(cells[0].textContent).toContain('26'); // Mon 26 Oct spills in
  });
});
