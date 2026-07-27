import { Suspense, lazy, useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useRouteError } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Theme } from '@radix-ui/themes';
import { useBands } from './context/BandsContext';
import { DarkModeProvider, useDarkModeContext } from './context/DarkModeContext';
import { SongsProvider } from './context/SongsContext';
import { SongListsProvider } from './context/SongListsContext';
import { SetlistsProvider } from './context/SetlistsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BandsProvider } from './context/BandsContext';
import { isDynamicImportFailure, recoverFromDynamicImportFailure, forceReloadAfterChunkFailure } from './lib/chunkRecovery';

const Layout = lazy(() => import('./components/Layout'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const UsernameSetupPage = lazy(() => import('./pages/UsernameSetupPage'));
const AddSongPage = lazy(() => import('./pages/AddSongPage'));
const BandSetlistConcertPage = lazy(() => import('./pages/BandSetlistConcertPage'));
const BandDetailPage = lazy(() => import('./pages/BandDetailPage'));
const BandSettingsPage = lazy(() => import('./pages/BandSettingsPage'));
const BandMembersPage = lazy(() => import('./pages/BandMembersPage'));
const SongPage = lazy(() => import('./pages/SongPage'));
const SongConcertPage = lazy(() => import('./pages/SongConcertPage'));
const EditSongPage = lazy(() => import('./pages/EditSongPage'));
const ProfileInvitesPage = lazy(() => import('./pages/ProfileInvitesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const ShowcasePage = lazy(() => import('./pages/ShowcasePage'));
const Showcase2Page = lazy(() => import('./pages/Showcase2Page'));
const CheckoutResultPage = lazy(() => import('./pages/CheckoutResultPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const PublicBandSetlistPage = lazy(() => import('./pages/PublicBandSetlistPage'));
const PublicBandRiderPage = lazy(() => import('./pages/PublicBandRiderPage'));
const PublicBandPressKitPage = lazy(() => import('./pages/PublicBandPressKitPage'));

function getRouteErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }

  return '';
}

function RouterErrorFallback() {
  const routeError = useRouteError();
  const chunkFailure = isDynamicImportFailure(routeError);
  const errorMessage = getRouteErrorMessage(routeError);

  useEffect(() => {
    if (chunkFailure) {
      recoverFromDynamicImportFailure();
    }
  }, [chunkFailure]);

  const handleReload = () => {
    if (chunkFailure) {
      forceReloadAfterChunkFailure();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="app-status" role="alert" style={{ textAlign: 'left' }}>
      <h2 style={{ marginBottom: '0.5rem', color: 'var(--text)' }}>We hit a loading problem</h2>
      <p>
        {chunkFailure
          ? 'A new version was deployed while this tab was open. Reload to sync the latest app files.'
          : 'Something went wrong while opening this page. Try reloading the app.'}
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" onClick={handleReload}>
          Reload app
        </button>
        <button type="button" className="btn-secondary" onClick={() => window.location.assign('/profile')}>
          Go to profile
        </button>
      </div>
      {!chunkFailure && errorMessage && (
        <p style={{ marginTop: '0.9rem', fontSize: '0.88rem', opacity: 0.9 }}>{errorMessage}</p>
      )}
    </div>
  );
}

const routerErrorElement = <RouterErrorFallback />;

/** Redirects to the last active band's library, or profile if no active band. */
function RootRedirect() {
  const { bands, loading } = useBands();

  if (loading) {
    return <div className="app-status">Loading Gigboy…</div>;
  }

  let targetBandId: string | null = null;

  try {
    const lastBandId = window.localStorage.getItem('gigboy-active-band-id')?.trim();
    if (lastBandId && bands.some((band) => band.id === lastBandId)) {
      targetBandId = lastBandId;
    }
  } catch {
    // Ignore localStorage failures.
  }

  if (!targetBandId && bands.length > 0) {
    targetBandId = bands[0].id;
  }

  if (targetBandId) {
    return <Navigate to={`/bands/${targetBandId}/library`} replace state={{ bandId: targetBandId }} />;
  }

  return <Navigate to="/profile" replace />;
}

function AuthenticatedApp() {
  const { user, loading, authEnabled, isDeletingAccount } = useAuth();

  if (loading) {
    return <div className="app-status">Loading Gigboy…</div>;
  }

  if (authEnabled && !user) return <LoginPage />;
  if (authEnabled && user && !user.username && !isDeletingAccount) return <UsernameSetupPage />;

  return (
    <SongsProvider>
      <SongListsProvider>
        <SetlistsProvider>
            <BandsProvider>
                <Layout>
                  <Routes>
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/bands" element={<RootRedirect />} />
                    <Route path="/songs/new" element={<AddSongPage />} />
                    <Route path="/songs/:id" element={<SongPage />} />
                    <Route path="/songs/:id/concert" element={<SongConcertPage />} />
                    <Route path="/songs/:id/edit" element={<EditSongPage />} />
                    <Route path="/bands/:bandId/setlists/:setlistId/concert" element={<BandSetlistConcertPage />} />
                    <Route path="/bands/:id/settings" element={<BandSettingsPage />} />
                    <Route path="/bands/:id/members" element={<BandMembersPage />} />
                    <Route path="/bands/:id/*" element={<BandDetailPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/checkout-result" element={<CheckoutResultPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/profile/invites" element={<ProfileInvitesPage />} />
                    <Route path="*" element={<Navigate to="/profile" replace />} />
                  </Routes>
                </Layout>
              </BandsProvider>
          </SetlistsProvider>
      </SongListsProvider>
    </SongsProvider>
  );
}

function PricingRoute() {
  return (
    <BandsProvider>
      <PricingPage />
    </BandsProvider>
  );
}

const router = createBrowserRouter([
  { path: '/public/bands/:bandId/:bandName/setlists/:setlistId', element: <PublicBandSetlistPage />, errorElement: routerErrorElement },
  { path: '/public/bands/:bandId/setlists/:setlistId', element: <PublicBandSetlistPage />, errorElement: routerErrorElement },
  { path: '/public/bands/:bandId/:bandName/riders/:riderId', element: <PublicBandRiderPage />, errorElement: routerErrorElement },
  { path: '/public/bands/:bandId/riders/:riderId', element: <PublicBandRiderPage />, errorElement: routerErrorElement },
  { path: '/public/press-kit/:token', element: <PublicBandPressKitPage />, errorElement: routerErrorElement },
  { path: '/pricing', element: <PricingRoute />, errorElement: routerErrorElement },
  { path: '/showcase', element: <ShowcasePage />, errorElement: routerErrorElement },
  { path: '/showcase2', element: <Showcase2Page />, errorElement: routerErrorElement },
  { path: '/checkout-result', element: <CheckoutResultPage />, errorElement: routerErrorElement },
  { path: '/terms', element: <TermsPage />, errorElement: routerErrorElement },
  { path: '/privacy', element: <PrivacyPage />, errorElement: routerErrorElement },
  { path: '*', element: <AuthenticatedApp />, errorElement: routerErrorElement },
]);

function AppContent() {
  const { dark } = useDarkModeContext();

  return (
    <Theme
      appearance={dark ? 'dark' : 'light'}
      accentColor="blue"
      grayColor="sand"
      radius="medium"
      hasBackground={false}
    >
      <AuthProvider>
        <Toaster
          toastOptions={{
            style: {
              border: '1px solid var(--border)',
              borderRadius: '10px',
              background: 'var(--surface)',
              color: 'var(--text)',
              boxShadow: 'var(--shadow)',
              padding: '0.7rem 0.8rem',
              minWidth: '280px',
              maxWidth: '420px',
            },
          }}
          position="top-center"
        />
        <Suspense fallback={<div className="app-status">Loading Gigboy…</div>}>
          <RouterProvider router={router} />
        </Suspense>
      </AuthProvider>
    </Theme>
  );
}

export default function App() {
  return (
    <DarkModeProvider>
      <AppContent />
    </DarkModeProvider>
  );
}
