# Firebase Setup Guide

This document explains how to set up Firebase credentials for local development and production deployment **without committing secrets to git**.

## Why Not Commit the Service Account JSON?

The Firebase service account JSON file contains sensitive credentials (private keys, etc.) that should **never** be committed to git. If accidentally committed, the credentials are exposed and must be rotated.

## Local Development Setup

### 1. Get Your Firebase Service Account Key

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **Service Accounts** (or search for it)
3. Select your Firebase project's service account
4. Go to **Keys** tab
5. Click **Create new key** → **JSON** → Download the file
6. **Keep this file private** — save it somewhere secure, NOT in your repo

### 2. Set Up Local Environment Variables

Create a `.env` file in the root directory (next to `package.json`):

```bash
# Copy from the JSON file you downloaded:
FIREBASE_PROJECT_ID=songbook-bebd5
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBA...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@songbook-bebd5.iam.gserviceaccount.com
```

**Important**: 
- The `FIREBASE_PRIVATE_KEY` must be the service account `private_key` value, not the Firebase Web API key
- It may be stored with literal `\n` escapes or pasted as a full PEM block; surrounding quotes are allowed
- The `.env` file is already in `.gitignore`, so it won't be committed

### 3. Verify Setup Locally

Run the dev server and check that Firebase functions work:

```bash
npm run dev
```

## Production Deployment

### Cloudflare (via wrangler)

For **Cloudflare Workers**, set environment variables via the Cloudflare dashboard or `wrangler secret`:

```bash
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_PRIVATE_KEY
wrangler secret put FIREBASE_CLIENT_EMAIL
```

Then deploy:

```bash
npm run deploy
```

### Firebase Hosting

For **Firebase Hosting**, use the `.env` file during deployment or set variables in your CI/CD pipeline (GitHub Actions, etc.):

```bash
firebase deploy
```

### GitHub Actions (CI/CD)

If using GitHub Actions, set these as **Repository Secrets** (not visible in logs):

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_CLIENT_EMAIL`

3. In your workflow file (`.github/workflows/*.yml`):
   ```yaml
   env:
     FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
     FIREBASE_PRIVATE_KEY: ${{ secrets.FIREBASE_PRIVATE_KEY }}
     FIREBASE_CLIENT_EMAIL: ${{ secrets.FIREBASE_CLIENT_EMAIL }}
   ```

## Rotating Credentials

If you suspect credentials are compromised:

1. Go to Google Cloud Console → Service Accounts
2. Delete the old key
3. Create a new key and download the JSON
4. Update your `.env` file and all deployment platforms with new values

## File Structure

```
folio/
├── .env                         ← Local credentials (gitignored)
├── .env.example                 ← Template (safe to commit)
├── config/firebase/
│   └── *.json                   ← Gitignored (use env vars instead)
├── functions/
│   └── _helpers/
│       └── firebase-admin.ts    ← Loads credentials from env
└── wrangler.jsonc              ← Configured for env variables
```

## Troubleshooting

Run the backend health check endpoint after deployment:

```bash
curl https://YOUR_DOMAIN/api/health/firebase
```

Expected success response includes:
- `ok: true`
- `configured: true`
- `projectId`

If this endpoint returns `ok: false`, the `error` field usually points to the missing or invalid Firebase credential.

**"Firebase credentials not fully configured"**
- Make sure all three env variables are set: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`

**"Invalid private key format"**
- Check that `FIREBASE_PRIVATE_KEY` is copied from the service account JSON field named `private_key`
- Do not use the Firebase client `apiKey`; it is a different credential and will fail server auth
- If you use Cloudflare secrets, paste the full private key value exactly once without extra shell escaping

**"Permission denied"**
- Verify the service account has the necessary Firebase roles in Google Cloud Console

## Bands, Invites, and Sharing Checklist

Use this checklist after the basic credential setup so band creation, invites, and sharing work end-to-end.

### 1. Enable Firebase Authentication

1. Open Firebase Console for your project.
2. Go to **Authentication** -> **Sign-in method**.
3. Enable at least one provider that yields verified emails (Google is recommended).
4. In **Authentication** -> **Settings**, confirm your project domain(s) are authorized.

Why this matters: invite matching uses the signed-in user UID and email.

### 2. Publish Firestore Rules

Deploy the repository rules file:

```bash
firebase deploy --only firestore:rules
```

This project expects rules from [firestore.rules](firestore.rules), including access for:
- `/bands/{bandId}` and `/bands/{bandId}/songs/{songId}`
- `/bands/{bandId}/songLists/{songListId}`
- `/bands/{bandId}/setlists/{setlistId}`
- `/bandInvites/{inviteId}`
- `/collaborationInvites/{inviteId}`
- `/users/{userId}/{songs|songLists|setlists}`

### 3. Confirm Required Collections Exist

Collections are created automatically on first write, but your deployment must allow writes to:

- `bands`
- `bands/{bandId}/songLists`
- `bands/{bandId}/setlists`
- `bandInvites`
- `collaborationInvites`
- `users/{uid}/songs`
- `users/{uid}/songLists`
- `users/{uid}/setlists`

### 4. Verify Health and Invite Flow

1. Check backend health:
   ```bash
   curl https://YOUR_DOMAIN/api/health/firebase
   ```
2. Create a band in the app.
3. Invite another user to the band.
4. Share a song/setlist/songlist with another user.
5. Copy a personal songlist to a band songlist from the songlist header action.
6. Copy a personal setlist to a band setlist from the setlist header action.
7. Sign in as the recipient and accept from `/profile/invites`.

### 5. Optional but Recommended Hardening

- Avoid exposing fallback header-based auth (`x-folio-user-id`) in production unless protected by an upstream trusted proxy.
- Rotate Firebase keys periodically.
