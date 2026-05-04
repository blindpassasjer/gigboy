import { createBrowserRouter, RouterProvider, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Theme } from '@radix-ui/themes';
import { useEffect, useState } from 'react';

/** Observes data-theme on <html> so Radix Theme stays in sync with our dark mode toggle. */
function useHtmlDark() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );
  useEffect(() => {
    const el = document.documentElement;
    const ob = new MutationObserver(() => {
      setDark(el.getAttribute('data-theme') === 'dark');
    });
    ob.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => ob.disconnect();
  }, []);
  return dark;
}
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import UsernameSetupPage from './pages/UsernameSetupPage';
import AddSongPage from './pages/AddSongPage';
import BandSetlistConcertPage from './pages/BandSetlistConcertPage';
import BandDetailPage from './pages/BandDetailPage';
import BandCustomizePage from './pages/BandCustomizePage';
import BandMembersPage from './pages/BandMembersPage';
import SongPage from './pages/SongPage';
import EditSongPage from './pages/EditSongPage';
import ProfileInvitesPage from './pages/ProfileInvitesPage';
import ProfilePage from './pages/ProfilePage';
import PublicBandSetlistPage from './pages/PublicBandSetlistPage';
import PublicBandStageplotPage from './pages/PublicBandStageplotPage';
import PublicBandTechnicalRiderPage from './pages/PublicBandTechnicalRiderPage';
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
    return <div className="app-status">Loading Gigboi…</div>;
  }

  if (authEnabled && !user) return <LoginPage />;
  if (authEnabled && user && !user.username) return <UsernameSetupPage />;

  return (
    <SongsProvider>
      <SongListsProvider>
        <SetlistsProvider>
          <StageplotsProvider>
            <TechnicalRidersProvider>
              <BandsProvider>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/profile" replace />} />
                    <Route path="/bands" element={<Navigate to="/profile" replace />} />
                    <Route path="/songs/new" element={<AddSongPage />} />
                    <Route path="/songs/:id" element={<SongPage />} />
                    <Route path="/songs/:id/edit" element={<EditSongPage />} />
                    <Route path="/bands/:bandId/setlists/:setlistId/concert" element={<BandSetlistConcertPage />} />
                    <Route path="/bands/:id/customize" element={<BandCustomizePage />} />
                    <Route path="/bands/:id/members" element={<BandMembersPage />} />
                    <Route path="/bands/:id/*" element={<BandDetailPage />} />
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

const router = createBrowserRouter([
  { path: '/public/bands/:bandId/setlists/:setlistId', element: <PublicBandSetlistPage /> },
  { path: '/public/bands/:bandId/stageplots/:stageplotId', element: <PublicBandStageplotPage /> },
  { path: '/public/bands/:bandId/riders/:riderId', element: <PublicBandTechnicalRiderPage /> },
  { path: '*', element: <AuthenticatedApp /> },
]);

export default function App() {
  const dark = useHtmlDark();
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
      <RouterProvider router={router} />
    </AuthProvider>
    </Theme>
  );
}
