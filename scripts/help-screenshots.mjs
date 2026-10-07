#!/usr/bin/env node
/**
 * Regenerates the screenshots used by the in-app user guide (src/help/images/*.webp).
 *
 * It drives a real browser against the demo build, so the shots always show the current UI
 * with the seeded sample band. Not part of the normal build — run it when the UI changes:
 *
 *   VITE_DEMO=true VITE_DEMO_AUTOLOGIN=true VITE_BASE=/ npx vite build --outDir /tmp/gigboy-demo
 *   npx vite preview --outDir /tmp/gigboy-demo --port 4173 &
 *   npm i --no-save playwright-core && npx playwright-core install chromium
 *   node scripts/help-screenshots.mjs            # or: BASE_URL=http://localhost:4173 node ...
 *
 * (`npm run build:demo` alone is not enough: it does not enable demo mode or autologin.)
 */
/* global process */
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const OUT = process.env.OUT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/help/images');
const BANNER = 36; // height of the "live demo" banner, cropped out of every shot
const only = process.argv.slice(2);
const MAIN = { x: 220, y: BANNER, width: 1060, height: 760 };
const TOOLS = { x: 300, y: BANNER + 90, width: 900, height: 510 };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function session({ width = 1280, height = 760, dark = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: height + BANNER }, deviceScaleFactor: 1 });
  if (dark) await context.addInitScript(() => localStorage.setItem('gigboy-theme', 'dark'));
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForSelector('text=Amazing Grace');
  await page.waitForTimeout(800);
  return { page, width, height, context };
}

async function save({ page, width, height }, name, { full = false, clip } = {}) {
  if (only.length && !only.includes(name)) return;
  await page.waitForTimeout(500);
  const box = clip ?? { x: 0, y: BANNER, width, height };
  const png = await page.screenshot(full ? { fullPage: true, clip: { x: 0, y: BANNER, width, height: (await page.evaluate(() => document.documentElement.scrollHeight)) - BANNER } } : { clip: box });
  await sharp(png).webp({ quality: 82 }).toFile(path.join(OUT, `${name}.webp`));
  console.log('saved', name);
}

const click = async (page, selector) => { await page.click(selector); await page.waitForTimeout(500); };

// Library, filters, sidebar on a phone
{
  const s = await session();
  await save(s, 'library');
  await click(s.page, 'button:has-text("Filters")');
  await save(s, 'library-filters');
  await s.context.close();
}
{
  const s = await session({ width: 390, height: 780 });
  await click(s.page, 'button[aria-label="Open sidebar"], button[aria-label="Toggle sidebar"], button.topbar-icon-btn >> nth=0').catch(() => {});
  await save(s, 'mobile-sidebar');
  await s.context.close();
}

// Song page: settings + tools, floating tools, edit, history, dark mode
{
  const s = await session();
  const { page } = s;
  await click(page, 'text=Amazing Grace');
  await save(s, 'song-view', { clip: MAIN });
  await click(page, 'button[aria-label="Show metronome"]');
  await save(s, 'tool-metronome', { clip: TOOLS });
  await click(page, 'button[aria-label="Hide metronome"]');
  await click(page, 'button[aria-label="Show tuner"]');
  await save(s, 'tool-tuner', { clip: TOOLS });
  await click(page, 'button[aria-label="Hide tuner"]');
  await click(page, 'button[aria-label="Show recorder"]');
  await save(s, 'tool-recorder', { clip: TOOLS });
  await click(page, 'button[aria-label="Hide recorder"]');
  await click(page, 'button[title="Add to a songlist or setlist"]');
  await save(s, 'add-to-menu', { clip: { x: 220, y: BANNER + 60, width: 700, height: 540 } });
  await page.keyboard.press('Escape');
  await page.mouse.click(1000, 700);
  await click(page, 'button[aria-label="Show handwritten notes"]');
  await save(s, 'tool-notes', { clip: TOOLS });
  await click(page, 'button[aria-label="Hide handwritten notes"]');
  await click(page, 'button[aria-label="Show chord finder"]');
  await save(s, 'tool-chord-finder', { clip: TOOLS });
  await click(page, 'button[aria-label="Hide chord finder"]');
  await click(page, 'button[aria-label^="Edit Amazing Grace"]');
  await save(s, 'song-edit', { clip: MAIN });
  await page.locator('text=ChordPro Lyrics').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 0));
  await save(s, 'song-edit-lyrics', { clip: MAIN });
  await s.context.close();
}
{
  const s = await session({ dark: true });
  await click(s.page, 'text=Amazing Grace');
  await save(s, 'song-dark', { clip: MAIN });
  await s.context.close();
}

// Setlists, concert mode
{
  const s = await session();
  const { page } = s;
  await click(page, 'text=Saturday Night Gig');
  await save(s, 'setlist');
  await click(page, 'button[title="Print"], a[title*="rint"]').catch(() => {});
  await save(s, 'setlist-print');
  await s.context.close();
}
{
  const s = await session({ width: 1180, height: 740 });
  const { page } = s;
  await click(page, 'text=Saturday Night Gig');
  await click(page, 'a[title^="Start concert"]');
  await save(s, 'concert');
  await click(page, 'button[aria-label="Concert settings"]');
  await save(s, 'concert-settings');
  await page.keyboard.press('Escape');
  await click(page, 'button[title="Song list"]');
  await save(s, 'concert-navigator');
  await s.context.close();
}

// Gigs, band, press kit, rider, profile
{
  const s = await session();
  const { page } = s;
  await click(page, 'text=All gigs');
  await save(s, 'gigs-calendar');
  await click(page, 'button:has-text("Cards")');
  await save(s, 'gigs-cards');
  await click(page, 'text=Electronic Press Kit');
  await save(s, 'press-kit');
  await click(page, 'text=Standard Stage Plot');
  await save(s, 'stage-plot');
  await click(page, 'button[aria-label="Switch band"]');
  await save(s, 'band-switcher', { clip: { x: 0, y: BANNER + 40, width: 500, height: 200 } });
  await page.keyboard.press('Escape');
  await page.mouse.click(900, 500);
  await click(page, 'text=Library');
  await click(page, '[title="Band settings"], [aria-label="Band settings"]');
  await save(s, 'band-settings');
  await page.goto(`${BASE}/profile`);
  await page.waitForTimeout(1200);
  await save(s, 'profile');
  await s.context.close();
}

await browser.close();
