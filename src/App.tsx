import { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Theme } from '@radix-ui/themes';
import { useBands } from './context/BandsContext';
import { DarkModeProvider, useDarkModeContext } from './context/DarkModeContext';
import { SongsProvider } from './context/SongsContext';
import { SongListsProvider } from './context/SongListsContext';
import { SetlistsProvider } from './context/SetlistsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BandsProvider } from './context/BandsContext';

const Layout = lazy(() => import('./components/Layout'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const UsernameSetupPage = lazy(() => import('./pages/UsernameSetupPage'));
const AddSongPage = lazy(() => import('./pages/AddSongPage'));
const BandSetlistConcertPage = lazy(() => import('./pages/BandSetlistConcertPage'));
const BandDetailPage = lazy(() => import('./pages/BandDetailPage'));
const BandSettingsPage = lazy(() => import('./pages/BandSettingsPage'));
const BandMembersPage = lazy(() => import('./pages/BandMembersPage'));
const SongPage = lazy(() => import('./pages/SongPage'));
const EditSongPage = lazy(() => import('./pages/EditSongPage'));
const ProfileInvitesPage = lazy(() => import('./pages/ProfileInvitesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const CheckoutResultPage = lazy(() => import('./pages/CheckoutResultPage'));
const PublicBandSetlistPage = lazy(() => import('./pages/PublicBandSetlistPage'));
const PublicBandRiderPage = lazy(() => import('./pages/PublicBandRiderPage'));
const PublicBandPressKitPage = lazy(() => import('./pages/PublicBandPressKitPage'));

/** Redirects to the last active band's library, or profile if no active band. */
function RootRedirect() {
  const { bands, loading } = useBands();

  if (loading) {
    return <div className="app-status">Loading Gigboy…</div>;
  }

  try {
    const lastBandId = window.localStorage.getItem('gigboy-active-band-id')?.trim();
    if (lastBandId && bands.some((band) => band.id === lastBandId)) {
      return <Navigate to={`/bands/${lastBandId}/library`} replace state={{ bandId: lastBandId }} />;
    }
  } catch {
    // Ignore localStorage failures and fall back to profile.
  }

  return <Navigate to="/profile" replace />;
}

function AuthenticatedApp() {
  const { user, loading, authEnabled } = useAuth();

  if (loading) {
    return <div className="app-status">Loading Gigboy…</div>;
  }

  if (authEnabled && !user) return <LoginPage />;
  if (authEnabled && user && !user.username && !user.isAnonymous) return <UsernameSetupPage />;

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
  { path: '/public/bands/:bandId/:bandName/setlists/:setlistId', element: <PublicBandSetlistPage /> },
  { path: '/public/bands/:bandId/setlists/:setlistId', element: <PublicBandSetlistPage /> },
  { path: '/public/bands/:bandId/:bandName/riders/:riderId', element: <PublicBandRiderPage /> },
  { path: '/public/bands/:bandId/riders/:riderId', element: <PublicBandRiderPage /> },
  { path: '/public/press-kit/:token', element: <PublicBandPressKitPage /> },
  { path: '/pricing', element: <PricingRoute /> },
  { path: '/checkout-result', element: <CheckoutResultPage /> },
  { path: '*', element: <AuthenticatedApp /> },
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
