# Graph Report - gigboy  (2026-07-25)

## Corpus Check
- 187 files · ~188,110 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1482 nodes · 3385 edges · 86 communities (75 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eda17fd1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 62 edges
2. `firebase-admin` - 59 edges
3. `SongsContext` - 57 edges
4. `useBands()` - 52 edges
5. `getFirestoreDocument()` - 47 edges
6. `setFirestoreDocument()` - 40 edges
7. `BandSetlistConcertPage` - 31 edges
8. `Song` - 30 edges
9. `InputList` - 25 edges
10. `useSongs()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `GIGBOY Documentation` --references--> `SongsContext`  [EXTRACTED]
  README.md → src/context/SongsContext.ts
- `GIGBOY Documentation` --references--> `chordParser`  [EXTRACTED]
  README.md → src/utils/chordParser.ts
- `Firebase Setup Guide` --references--> `firebase-admin`  [EXTRACTED]
  FIREBASE_SETUP.md → functions/_helpers/firebase-admin.ts
- `GIGBOY` --calls--> `Main Entry Point`  [EXTRACTED]
  index.html → src/main.tsx
- `GIGBOY Documentation` --references--> `useAudioRecorder`  [EXTRACTED]
  README.md → src/hooks/useAudioRecorder.ts

## Communities (86 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.15
Nodes (37): firebase-admin, Firebase Setup Guide, Firestore Rules, HealthPayload, onRequestGet(), base64UrlEncodeBytes(), base64UrlEncodeJson(), countFirestoreDocumentsByField() (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.17
Nodes (19): ShareMenuProps, ApiHeaders, acceptInvite(), createInvite(), getResourceCollection(), getSharedResourceRef(), inviteFromDoc(), isValidEmail() (+11 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (20): dependencies, @capacitor/android, @capacitor/core, dompurify, firebase, jszip, lucide-react, midi-writer-js (+12 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (20): devDependencies, @capacitor/cli, @cloudflare/workers-types, eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, jsdom, stripe (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (18): BLACK_PCS, ChordDiagram(), ChordModel, containsStandaloneNumber(), getFullIntervals(), getTriadIntervals(), inversionLabel(), normalizeForLookup() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (39): convertUGTabBlocks(), decodeHtmlEntities(), detectLikelySource(), extractChordValue(), extractFirstInteger(), extractMetadata(), getSectionType(), htmlToChordPro() (+31 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (43): BrandMarkProps, EquipmentTableEditorProps, Props, CUSTOM_ITEM_TEMPLATE, PALETTE_CATEGORIES, PaletteCategory, PaletteItem, StageplotEditor() (+35 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (24): Data, onRequestPost(), Data, onRequest(), onRequestPost(), Data, onRequest(), onRequestPost() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (30): Data, Env, onRequest(), RATE_LIMIT_RULES, onRequestPost(), b64urlDecode(), clearCookie(), fromHex() (+22 more)

### Community 9 - "Community 9"
Cohesion: 0.10
Nodes (37): readLocal(), canEditSongList(), compareBySortOrder(), ensureSongListsCategory(), findLastIndexByFolderId(), isSongListOwner(), normalizeSongLists(), readLocal() (+29 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (34): computeWaveformPeaks(), computeWaveformPeaksFromBlob(), downsampleBars(), formatDateTime(), formatFileSize(), formatTime(), Props, RecorderAvatar() (+26 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (18): formatStorageBytes(), InlineInputProps, PLAN_TIER_ICON, Props, Sidebar(), SidebarItemIcon(), useSongLists(), useSongs() (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (15): BandsProvider(), SongListsProvider(), CheckoutResultPage(), CONFETTI, AuthenticatedApp(), CheckoutResultPage, getRouteErrorMessage(), Layout (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (23): Data, onRequest(), onRequestPost(), Data, onRequestPost(), Data, onRequestPost(), Data (+15 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (25): BandsContext, BandsContextValue, BandTrashItem, hasMigrationMarker(), migrationMarkerKey(), normalizeBand(), normalizeBandSetlist(), normalizeBandSong() (+17 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (29): BASE_MEMBER_LIMIT, getStripeClient(), mapStripeStatus(), planAndExtraMembersFromSubscription(), PlanTier, planTierFromPriceId(), STORAGE_QUOTA, SubscriptionStatus (+21 more)

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (6): chordproField, { container }, initialSong, onSave, randomUuidSpy, router

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.07
Nodes (36): Props, TabDisplay(), CellValue, Grid, makeEmptyGrid(), Props, STRING_LABELS, tabLinesToGrid() (+28 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (27): chordParser, DiagramInstrument, LineRenderer(), LineRendererProps, Props, SECTION_LABELS, Props, ActiveChord (+19 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (9): canEditSetlist(), getRole(), setlistFromDoc(), SetlistsContext, SetlistsContextValue, parseSetlistTrashRecord(), PublicSongEntry, TrashedSetlist (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (29): 1. Enable Firebase Authentication, 1. Get Your Firebase Service Account Key, 2. Publish Firestore Rules, 2. Set Up Local Environment Variables, 3. Confirm Required Collections Exist, 3. Verify Setup Locally, 4. Verify Health and Invite Flow, 5. Optional but Recommended Hardening (+21 more)

### Community 22 - "Community 22"
Cohesion: 0.16
Nodes (25): BAND_SUBCOLLECTIONS, Data, deleteBandCollectionWithNested(), deleteCollectionDocs(), deleteUserLegacyCollections(), onRequest(), onRequestPost(), USER_LEGACY_SUBCOLLECTIONS (+17 more)

### Community 23 - "Community 23"
Cohesion: 0.32
Nodes (9): BandManagementPanel(), BandManagementPanelProps, ShareMenu(), useAuth(), useBands(), SetlistsProvider(), BandMembersPage(), BandsPage() (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.24
Nodes (15): GitHubIcon(), AuthContext, AuthContextValue, AuthProvider(), isValidAvatar(), changeUsername(), claimUsername(), loadUserProfile() (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.21
Nodes (16): useOptionalBands(), ApiHeaders, buildHeaders(), createCheckoutSession(), createPortalSession(), postJson(), BillingCycle, FeatureBullet (+8 more)

### Community 26 - "Community 26"
Cohesion: 0.14
Nodes (17): PlanGate(), Props, Props, computeBandPlan(), isBandPlanActive(), isPlanActive(), PLAN_ORDER, bandCanUse() (+9 more)

### Community 27 - "Community 27"
Cohesion: 0.16
Nodes (13): createTrashPayload(), createTrashTimestamps(), omitUndefinedFields(), parseAttachmentTrashRecord(), parseBandLogoTrashRecord(), parseInputListTrashRecord(), parsePressKitImageTrashRecord(), parsePressKitTrashRecord() (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.05
Nodes (54): PressKitImageAsset, PressKitView(), Props, buildHeaders(), ActivePressKitShare, ApiHeaders, buildHeaders(), createPressKitShare() (+46 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (14): Props, insertAtCursor(), insertSection(), Props, Section, SECTIONS, insertChordAtSelection(), diatonicChords() (+6 more)

### Community 30 - "Community 30"
Cohesion: 0.08
Nodes (23): BLACK_PCS, ChordFinderProps, DEFAULT_GUITAR_STRINGS, DEFAULT_STRINGS, DEFAULT_UKE_STRINGS, GUITAR_PC_LOOKUP, GuitarFretboardProps, identifyByIntervals() (+15 more)

### Community 31 - "Community 31"
Cohesion: 0.07
Nodes (28): Adding songs, Before going public, ChordPro format, Cloudflare Pages (recommended when using `/api/*`), Cloudflare Workers (static-only), code:bash (npm install), code:block10 (src/), code:block2 (VITE_FIREBASE_API_KEY=) (+20 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (25): ActiveChord, ConcertModeView(), Props, AttachmentRow(), AttachmentRowProps, formatFileSize(), Props, SongAttachments() (+17 more)

### Community 33 - "Community 33"
Cohesion: 0.28
Nodes (12): getPostLoginDestination(), GitHubIcon(), GoogleIcon(), LOGIN_FEATURES, LoginBackdrop(), LoginHero(), LoginPage(), MusicNotesBg() (+4 more)

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (10): app, configuredAuthDomain, configuredProjectId, firebaseEnvConfig, hasAnyFirebaseEnvOverride, hasFirebaseHostedAuthDomain, missingEnvOverrideKeys, missingFirebaseEnv (+2 more)

### Community 35 - "Community 35"
Cohesion: 0.24
Nodes (11): displayNameForUser(), deleteSongHandNote(), normalizeLineAnchor(), normalizeTextNote(), saveSongHandNote(), songHandNotesCollectionRef(), songHandNotesDocRef(), SongHandNotesScope (+3 more)

### Community 36 - "Community 36"
Cohesion: 0.21
Nodes (10): Props, BaseSongMedia, normalizeUrl(), parseSongMedia(), parseSpotify(), parseYoutube(), SongMedia, SongMediaProvider (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.16
Nodes (16): CHUNK_FAILURE_PATTERNS, clearStaleServiceWorkerState(), forceReloadAfterChunkFailure(), getErrorMessage(), isDynamicImportFailure(), recoverFromDynamicImportFailure(), reloadWithClearedState(), withTimeout() (+8 more)

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (10): ALLOWED_STATUSES, buildSnapshot(), createCredential(), extractBandItems(), findSubscriptionForBand(), isActive(), main(), mapStatus() (+2 more)

### Community 39 - "Community 39"
Cohesion: 0.15
Nodes (17): ActiveStrokeState, drawStroke(), Props, TwoFingerScrollState, DragPosition, PendingNew, Props, anchorFromClientPoint() (+9 more)

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (17): Props, SongFormValues, LanguageBadge(), Props, getSongPreview(), normalizeEmojiIcon(), Props, SORT_OPTIONS (+9 more)

### Community 41 - "Community 41"
Cohesion: 0.14
Nodes (16): AnchoredToastOptions, dismissOnNextInteraction(), showAnchoredToast(), toast, toastCardStyle, anchorFromElement(), ensureAnchorListeners(), getActiveToastAnchor() (+8 more)

### Community 42 - "Community 42"
Cohesion: 0.47
Nodes (10): averageRgb(), buildSongSurfaceStyle(), buildSongSurfaceStyleFromPalette(), contrastTextRgb(), hexToRgb(), mixChannel(), mixRgb(), normalizeHex() (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.36
Nodes (8): BAND_COLOR_OPTIONS, BandSettingsPage(), formatPeriodEnd(), formatSubscriptionStatus(), inferImageExtension(), LogoAsset, triggerBlobDownload(), BandSettingsPage

### Community 44 - "Community 44"
Cohesion: 0.22
Nodes (8): background_color, description, display, icons, name, short_name, start_url, theme_color

### Community 45 - "Community 45"
Cohesion: 0.18
Nodes (16): InviteNotificationsState, AcceptedInviteNotification, getDismissedAcceptedInviteIds(), getDismissedAcceptedInviteIdsFromCache(), getDismissedAcceptedInviteKey(), getSeenAcceptedInviteIds(), getSeenAcceptedInviteKey(), inviteNotificationsPrefDocRef() (+8 more)

### Community 46 - "Community 46"
Cohesion: 0.20
Nodes (17): Params, attachmentDocRef(), attachmentsCollectionRef(), AttachmentsScope, deleteSongAttachmentPermanently(), loadSongAttachments(), loadTrashedSongAttachments(), moveSongAttachmentToTrash() (+9 more)

### Community 47 - "Community 47"
Cohesion: 0.15
Nodes (11): BandTechRiderPanel(), Props, Props, TrashListItem, BandDetailPage(), BandDetailPage, Stageplot, BandPublicResourceType (+3 more)

### Community 48 - "Community 48"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (12): fallbackInitial(), UserAvatar(), UserAvatarProps, AVATAR_OPTIONS, AvatarOption, triggerSongbookExportDownload(), BAND_PLAN_ORDER, formatPeriodEnd() (+4 more)

### Community 50 - "Community 50"
Cohesion: 0.18
Nodes (12): Layout(), Props, useDarkModeContext(), declineBandInvite(), isValidEmail(), mergeInvites(), normalizeEmail(), loadPendingInvites() (+4 more)

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (9): Props, SetlistsView(), useSetlists(), AVATAR_ICON_OPTIONS, PRESSKIT_ICON_OPTIONS, SETLIST_ICON_OPTIONS, SONGLIST_ICON_OPTIONS, TECH_RIDER_ICON_OPTIONS (+1 more)

### Community 52 - "Community 52"
Cohesion: 0.48
Nodes (6): Data, isValidEmail(), isValidUsername(), normalizeEmail(), onRequestPost(), resourceCollectionForType()

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (14): scripts, backfill:presskit-thumbs, build, build:pages, deploy, deploy:pages, deploy:workers, dev (+6 more)

### Community 55 - "Community 55"
Cohesion: 0.26
Nodes (9): collectCandidates(), createCredential(), inferBucketFromDownloadUrl(), listBandIds(), main(), mapWithConcurrency(), parseArgs(), printHelp() (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.17
Nodes (10): __dirname, generateIcons(), publicDir, sizes, svgPath, sharp, buildThumbnail(), publicDir (+2 more)

### Community 57 - "Community 57"
Cohesion: 0.47
Nodes (4): resolveAllowedHostFromProxyUri(), resolveDevBaseFromProxyUri(), resolveProxyUri(), VENDOR_CHUNK_RULES

### Community 58 - "Community 58"
Cohesion: 0.60
Nodes (5): createCredential(), main(), parseArgs(), readDefaultProjectFromFirebaserc(), toTargetPath()

### Community 59 - "Community 59"
Cohesion: 0.40
Nodes (5): GIGBOY, Main Entry Point, Offline Page, GIGBOY Documentation, useAudioRecorder

### Community 60 - "Community 60"
Cohesion: 0.43
Nodes (5): DarkModeContext, DarkModeContextValue, DarkModeProvider(), getInitial(), useDarkMode()

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (4): DEMO_SONG_IDS, DEMO_SONGS, DemoSong, seedDemoData()

### Community 62 - "Community 62"
Cohesion: 0.11
Nodes (14): ActiveStrokeState, Props, StrokeForRendering, TwoFingerScrollState, ActiveChord, Props, SongPageState, baseSong (+6 more)

### Community 64 - "Community 64"
Cohesion: 0.50
Nodes (4): firestore, rules, storage, rules

### Community 77 - "Community 77"
Cohesion: 0.24
Nodes (5): Props, GUITAR_CHORDS, ALL_CHORD_NAMES, extractRecentChords(), suggestChordNames()

### Community 78 - "Community 78"
Cohesion: 0.43
Nodes (7): useInviteNotifications(), acceptBandInviteOnServer(), declineInvite(), emitInviteNotificationsChanged(), ProfileInvitesPage(), ProfileInvitesPage, CollaborationInvite

### Community 79 - "Community 79"
Cohesion: 0.29
Nodes (6): engines, node, name, private, type, version

### Community 80 - "Community 80"
Cohesion: 0.47
Nodes (4): Data, normalize(), onRequest(), onRequestPost()

### Community 81 - "Community 81"
Cohesion: 0.60
Nodes (5): createCredential(), main(), normalizeText(), parseArgs(), readDefaultProjectFromFirebaserc()

### Community 82 - "Community 82"
Cohesion: 0.60
Nodes (5): createCredential(), main(), normalizeEmail(), parseArgs(), readDefaultProjectFromFirebaserc()

## Knowledge Gaps
- **413 isolated node(s):** `name`, `private`, `version`, `type`, `node` (+408 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuth()` connect `Community 23` to `Community 1`, `Community 9`, `Community 11`, `Community 12`, `Community 14`, `Community 20`, `Community 24`, `Community 25`, `Community 26`, `Community 32`, `Community 33`, `Community 43`, `Community 45`, `Community 47`, `Community 49`, `Community 50`, `Community 51`, `Community 62`, `Community 78`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `firebase-admin` connect `Community 0` to `Community 3`, `Community 7`, `Community 8`, `Community 13`, `Community 15`, `Community 80`, `Community 52`, `Community 22`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 3` to `Community 56`, `Community 0`, `Community 79`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _413 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.145748987854251 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._