import { createBrowserRouter, RouterProvider, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Theme } from '@radix-ui/themes';
import { useMemo } from 'react';
import { useBands } from './context/BandsContext';
import { DarkModeProvider, useDarkModeContext } from './context/DarkModeContext';

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

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import UsernameSetupPage from './pages/UsernameSetupPage';
import AddSongPage from './pages/AddSongPage';
import BandSetlistConcertPage from './pages/BandSetlistConcertPage';
import BandDetailPage from './pages/BandDetailPage';
import BandSettingsPage from './pages/BandSettingsPage';
import BandMembersPage from './pages/BandMembersPage';
import SongPage from './pages/SongPage';
import EditSongPage from './pages/EditSongPage';
import ProfileInvitesPage from './pages/ProfileInvitesPage';
import ProfilePage from './pages/ProfilePage';
import PricingPage from './pages/PricingPage';
import CheckoutResultPage from './pages/CheckoutResultPage';
import PublicBandSetlistPage from './pages/PublicBandSetlistPage';
import PublicBandStageplotPage from './pages/PublicBandStageplotPage';
import PublicBandTechnicalRiderPage from './pages/PublicBandTechnicalRiderPage';
import PublicBandPressKitPage from './pages/PublicBandPressKitPage';
import { SongsProvider } from './context/SongsContext';
import { SongListsProvider } from './context/SongListsContext';
import { SetlistsProvider } from './context/SetlistsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BandsProvider } from './context/BandsContext';
import { TechnicalRidersProvider } from './context/TechnicalRidersContext';
import { StageplotsProvider } from './context/StageplotsContext';

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
          <StageplotsProvider>
            <TechnicalRidersProvider>
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
            </TechnicalRidersProvider>
          </StageplotsProvider>
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
  { path: '/public/bands/:bandId/:bandName/stageplots/:stageplotId', element: <PublicBandStageplotPage /> },
  { path: '/public/bands/:bandId/stageplots/:stageplotId', element: <PublicBandStageplotPage /> },
  { path: '/public/bands/:bandId/:bandName/riders/:riderId', element: <PublicBandTechnicalRiderPage /> },
  { path: '/public/bands/:bandId/riders/:riderId', element: <PublicBandTechnicalRiderPage /> },
  { path: '/public/press-kit/:token', element: <PublicBandPressKitPage /> },
  { path: '/pricing', element: <PricingRoute /> },
  { path: '/checkout-result', element: <CheckoutResultPage /> },
  { path: '*', element: <AuthenticatedApp /> },
]);

function AppContent() {
  const { dark } = useDarkModeContext();
  const appTree = useMemo(() => (
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
    <RouterProvider router={router} />
  </AuthProvider>
  ), []);

  return (
    <Theme
      appearance={dark ? 'dark' : 'light'}
      accentColor="blue"
      grayColor="sand"
      radius="medium"
      hasBackground={false}
    >
      {appTree}
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
