# GIGBOY Marketing Plan

## 1. Product snapshot

GIGBOY is a browser-based songbook and gig-prep tool for musicians and bands, built on ChordPro. Installable PWA, works offline. Self-hosted: a band or musician (or their tech-savvy friend) runs it on their own server/NAS via Docker, with band collaboration and cloud sync included — no paid tier to unlock, every self-hosted instance gets full feature access.

Standout features vs. a typical "chord chart app":
- **Bands** — shared song libraries, setlists, songlists, roles, invites
- **Press kits, technical riders, stage plots** — shareable public links, generated per band (this is rare in the category; most competitors stop at chord charts)
- **Rehearsal tools** — audio recorder, metronome, tuner, hand-drawn notes on the sheet
- **No lock-in** — full ChordPro export of your whole songbook at any time, and it's your own server/database, not someone else's cloud
- **Self-hosted, not another subscription** — one Docker Compose stack, run it once and it's yours; no recurring SaaS bill

## 2. Positioning

**One-line pitch:** *GIGBOY is the songbook that turns into gig-prep for the whole band — chords, setlists, and the press kit that gets you booked, all in one place.*

**Why now / wedge:** Chord-chart apps (OnSong, Ultimate Guitar Pro, Songbook+) solve the solo musician's "what key is this in" problem. None of them solve the band's "how do we agree on a setlist, who has the tech rider, and what do we send the venue" problem. GIGBOY's Bands + press-kit/tech-rider/stage-plot feature set is the wedge — lead marketing with the band/gig-logistics angle, not just chord charts (that's a crowded, commoditized message).

## 3. Ideal customer profiles (ICPs), ranked by priority

1. **Cover bands / function & wedding bands** — need shared setlists, quick key/tempo lookup, and a press kit/EPK to pitch venues and couples. Highest willingness to pay (they're monetizing gigs).
2. **Worship teams / church bands** — recurring setlists, multiple members needing the same chart, transpose for different vocalists, often a designated "band leader" who'd buy Crew.
3. **Original bands / touring acts** — stage plots and tech riders solve a real, recurring pain (emailing venues a PDF every time). Press kit sharable link is a strong differentiator here.
4. **Solo gigging musicians / singer-songwriters** — smaller ACV but larger volume; good top-of-funnel/free-tier audience and word-of-mouth into bands.

## 4. Messaging pillars

| Pillar | Proof point |
|---|---|
| "Your whole band, one songbook" | Bands feature, shared setlists/songlists, invites & roles |
| "Get booked, not just rehearsed" | Press kits, tech riders, stage plots — shareable links to send venues |
| "Your server, your data" | Self-hosted via Docker Compose — no third-party account, no vendor lock-in on the infrastructure itself |
| "Your songs, never trapped" | Full ChordPro export anytime, no lock-in |
| "Practice like it's soundcheck" | In-app metronome, tuner, audio recorder, hand notes |

## 5. Competitive landscape

- **OnSong, Songbook+, Setlist Maker** — iOS-only or app-store-locked, solo-musician focused, no band collaboration, no press kit/rider tooling. GIGBOY wins on cross-platform PWA + band features.
- **Ultimate Guitar Pro / Songsterr** — huge existing tab library (hard to out-content), but no gig-logistics layer, weaker band workflow, aggressive upsells.
- **Setlist apps (Setlist Helper, PlanningCenter for churches)** — PlanningCenter is strong in the worship niche specifically; GIGBOY should not lead with worship-only messaging but can run a dedicated landing page there.
- **Generic file sharing (Google Drive/Dropbox folders of PDFs)** — the real incumbent for most bands. Message against this directly: "stop emailing PDFs, stop hunting for the latest chart version."

## 6. Channels & tactics

### Organic / community (lowest cost, start here)
- Reddit: r/WeAreTheMusicMakers, r/coverbands, r/guitar, r/WorshipMusicians, r/livesound — answer real threads about setlist chaos, chart organization, EPKs; don't spam, be genuinely useful and disclose you built it.
- Facebook Groups: wedding/function band groups, worship tech groups, local original-music scenes — these groups are where cover bands actually coordinate.
- Reddit/FB are also good for **direct user interviews** to sharpen ICP #1 before spending on ads.

### Content / SEO
- Target long-tail, low-competition terms: "ChordPro app," "setlist app for bands," "band press kit template," "stage plot maker," "technical rider template," "chord chart app that works offline."
- Blog posts doubling as free tools/templates: "Free stage plot template," "Technical rider checklist," "How to build an EPK for a cover band" — each links to the in-app feature that generates it.
- These posts target musicians actively trying to solve the exact problem GIGBOY sells, and rank well because "press kit" + "stage plot" + "musician" content is far less saturated than generic chord-app SEO.

### Video / short-form
- YouTube + TikTok/Instagram Reels: "band leader" persona showing setlist chaos → GIGBOY fix. Screen-recorded demos of transpose, offline mode, sending a press kit link to a venue.
- Partner with small-to-mid guitar/covers YouTubers for a sponsored mention or affiliate link (cheap CPM in this niche vs. general music-gear channels).

### Partnerships / channel
- Local music venues and booking agents: offer them a simple "here's a tool to tell your bands to use for stage plots/riders" pitch — reduces venues' own admin load, gets GIGBOY in front of every band that plays there.
- Music schools / worship tech conferences: sponsor small events, offer Crew-tier discounts for teams.
- Cross-promo with complementary indie tools (metronome/tuner hardware brands, indie booking platforms).

### Product-led / viral loop
- The **Bands invite flow is a built-in referral mechanic** — every band member invited is a new signup. Lean into this: make the invite email/share link emphasize what the inviter is sharing (setlist/press kit), not just "join my band."
- Public press-kit/stage-plot links are shared with venues who are not existing users — put a small "made with GIGBOY" footer/CTA on public share pages to convert venue staff into curious visitors and potential self-hosters.

### Paid (only after organic signal validates messaging)
- Small-budget Meta/Instagram ads targeting cover-band and worship-team Facebook interest groups, using stage-plot/press-kit demo creative (the differentiated feature, not generic chord charts).
- Google Ads on the long-tail terms above — cheap CPCs, high intent.

## 7. Funnel & self-host motion

There's no billing funnel — GIGBOY is free, self-hosted software with full feature access out of the box. The funnel is about getting a band (or its most technical member) from "never heard of it" to "running their own instance":

- **Awareness → try it** — a band lead or the group's designated "tech person" finds GIGBOY through content/community channels and spins up the Docker Compose stack (see [SELFHOSTING.md](SELFHOSTING.md)), a five-minute setup on a NAS, VPS, or laptop.
- **Deploy → invite the band** — the person who deployed it becomes the admin and generates invite links for bandmates (no open self-registration — the invite-link flow is a natural, deliberate act of bringing the rest of the band in, which doubles as a light viral loop).
- **Retention lever** — once a band's setlists/press-kits/riders live in their own instance, switching cost is high (their own data, already set up) — lean on this in content/positioning rather than a paywall.
- If a hosted/managed offering (someone else runs the Docker stack for a fee) is ever introduced, revisit this section — it does not exist today.

## 8. Launch phases

**Phase 0 — Pre-launch (2–3 weeks)**
- Ship the legal/production checklist already in README ("Before going public": Terms/Privacy review, session secret/reverse-proxy HTTPS setup, credential rotation, offline/PWA end-to-end test).
- Write 3–5 SEO/template blog posts (stage plot, tech rider, EPK templates) to have organic content live at launch.
- Seed 10–15 real bands/solo musicians as beta users for testimonials and bug-catching before public push.

**Phase 1 — Soft launch (weeks 1–4)**
- Post in 3–5 relevant communities (Reddit/FB) with a "I built this, here's why" story, not a hard sell.
- Publish a Show HN / Product Hunt / Indie Hackers launch post emphasizing the band + press-kit angle as the hook (not "another chord app").
- Start the blog/SEO content cadence (1 post/week).

**Phase 2 — Growth (months 2–6)**
- Turn on paid channels only for the messages/audiences that showed organic traction.
- Formalize venue/booking-agent partnership outreach.
- Start affiliate/referral push using the Bands invite mechanic and public share-page footer.

## 9. KPIs to track

- Repo/README traffic and Docker image pulls (or `git clone`s) — the real top-of-funnel now that there's no hosted signup
- Deployments started vs. completed (proxy: GitHub stars/forks, community-reported installs) — how many people who look actually stand up the stack
- Band creations & invite acceptance rate per instance (proxy for the invite-link viral loop working)
- Public press-kit/stage-plot link shares and their referral traffic back to the GIGBOY repo/site
- Organic search traffic to the template/checklist blog posts and their conversion into repo visits or SELFHOSTING.md reads

## 10. Immediate next steps

1. Confirm README's "Before going public" checklist is complete (legal pages, reverse-proxy/HTTPS, credential rotation) — don't point traffic at self-host instructions that aren't launch-ready.
2. Write and publish the 3 highest-intent SEO pages: stage plot template, tech rider template, band EPK template.
3. Draft the Reddit/Product Hunt launch post leading with the Bands + press-kit differentiation, framed as free self-hosted software.
4. Add a lightweight referral touch to the band-invite share flow if not already present.
