# Gigboy Testing Checklist

Use this document as a release gate before deploy.

## 1) Automated checks (must pass)

Run from project root:

1. npm run test
2. npm run lint
3. npm run build

Expected result:

- Test suite passes
- ESLint exits with no errors
- Production build succeeds

## 2) Pre-QA setup

1. Start app locally: npm run dev
2. Open app in browser at localhost
3. Use two test accounts for permission checks
4. Keep browser DevTools open (Console + Network)

## 3) Core user flows

Mark each item pass/fail.

### Authentication

- [ ] Sign up with a new user
- [ ] Log in with existing user
- [ ] Log out
- [ ] Refresh page and verify session persistence
- [ ] Password reset flow (if enabled)

### Songs

- [ ] Create song
- [ ] Edit song metadata and content
- [ ] Delete song
- [ ] Search songs by title/artist/tag
- [ ] Filter songs by language
- [ ] Open song detail view and verify rendering

### Setlists

- [ ] Create setlist
- [ ] Add songs to setlist
- [ ] Reorder songs
- [ ] Remove song from setlist
- [ ] Open setlist public/share view (if enabled)

### Bands and members

- [ ] Create band
- [ ] Invite member
- [ ] Accept invite from second account
- [ ] Verify role-based permissions (admin/member)
- [ ] Remove member and verify access updates

### Press kit and public pages

- [ ] Open public band page(s)
- [ ] Verify private pages are blocked when not allowed
- [ ] Verify generated links are valid and shareable

### Billing (if Stripe is enabled)

- [ ] Open pricing and start checkout
- [ ] Successful checkout return flow
- [ ] Cancel/failed checkout flow
- [ ] Verify billing state updates in UI

## 4) Security and rules checks

Use two accounts: User A and User B.

- [ ] User B cannot read User A private data by direct URL/path
- [ ] User B cannot edit User A private records
- [ ] Band-private data is only available to members
- [ ] Public resources are readable without auth only where intended
- [ ] Storage file access is blocked for unauthorized users

## 5) API/function checks

For each critical endpoint, verify:

- [ ] Happy path returns 2xx
- [ ] Missing required fields return 4xx
- [ ] Unauthorized request returns 401/403
- [ ] Invalid ID/not found returns 404 (or defined 4xx)
- [ ] Error responses are clear and safe

Notes:

- Focus on functions under functions/api
- Cover auth, bands, songs, share, press-kit, stripe routes used in production

## 6) Cross-browser and responsive checks

Minimum browser matrix:

- [ ] Chrome (desktop)
- [ ] Firefox or Safari (desktop)
- [ ] Android Chrome
- [ ] iOS Safari

Viewport checks:

- [ ] 360x800 (small mobile)
- [ ] 768x1024 (tablet)
- [ ] 1440x900 (desktop)

For each viewport:

- [ ] Navigation usable
- [ ] Forms usable without layout break
- [ ] Tables/lists scroll correctly
- [ ] Modals and dialogs fit screen

## 7) Performance and reliability spot check

- [ ] No major Console errors in normal flows
- [ ] No unexpected failed Network requests
- [ ] Hard refresh on key pages behaves correctly
- [ ] Slow 3G simulation still shows useful loading and error states

## 8) PWA and offline checks (if enabled)

- [ ] App installs as PWA
- [ ] Offline fallback/page behavior works as expected
- [ ] Updated build is picked up after refresh/reopen

## 9) Data integrity checks

- [ ] Created records have expected fields
- [ ] Updated records persist correctly
- [ ] Deletes do not leave obvious orphaned data/files

## 10) Release sign-off

Do not deploy until all are true:

- [ ] Automated checks passed
- [ ] Critical flows passed
- [ ] Security checks passed
- [ ] Cross-browser checks passed
- [ ] No blocker or high-severity bugs remain

## Test run log template

Date:
Commit:
Tester:
Environment (local/staging/prod clone):

Summary:

- Passed:
- Failed:
- Blocked:

Issues found:

1. 
2. 
3. 

Go/No-go decision:
