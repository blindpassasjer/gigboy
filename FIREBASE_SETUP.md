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
- The `FIREBASE_PRIVATE_KEY` must preserve newlines as `\n` (not actual line breaks)
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

**"Firebase credentials not fully configured"**
- Make sure all three env variables are set: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`

**"Invalid private key format"**
- Check that `FIREBASE_PRIVATE_KEY` preserves the `\n` characters as literal `\n`, not actual newlines

**"Permission denied"**
- Verify the service account has the necessary Firebase roles in Google Cloud Console
