import { createBrowserRouter, RouterProvider, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SongPage from './pages/SongPage';
import AddSongPage from './pages/AddSongPage';
import EditSongPage from './pages/EditSongPage';
import LoginPage from './pages/LoginPage';
import UsernameSetupPage from './pages/UsernameSetupPage';
import SetlistConcertPage from './pages/SetlistConcertPage';
import BandsPage from './pages/BandsPage';
import BandDetailPage from './pages/BandDetailPage';
import BandMembersPage from './pages/BandMembersPage';
import ProfileInvitesPage from './pages/ProfileInvitesPage';
import ProfilePage from './pages/ProfilePage';
import TrashPage from './pages/TrashPage';
import PublicBandSetlistPage from './pages/PublicBandSetlistPage';
import PublicBandStageplotPage from './pages/PublicBandStageplotPage';
import PublicUserSetlistPage from './pages/PublicUserSetlistPage';
import PublicUserStageplotPage from './pages/PublicUserStageplotPage';
import PublicUserTechnicalRiderPage from './pages/PublicUserTechnicalRiderPage';
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
    return <div className="app-status">Loading Folio…</div>;
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
                    <Route path="/" element={<HomePage />} />
                    <Route path="/songs/:id" element={<SongPage />} />
                    <Route path="/songs/:id/edit" element={<EditSongPage />} />
                    <Route path="/add" element={<AddSongPage />} />
                    <Route path="/bands" element={<BandsPage />} />
                    <Route path="/bands/:id/members" element={<BandMembersPage />} />
                    <Route path="/bands/:id/*" element={<BandDetailPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/profile/invites" element={<ProfileInvitesPage />} />
                    <Route path="/trash" element={<TrashPage />} />
                    <Route path="/setlists/:id/concert" element={<SetlistConcertPage />} />
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
  { path: '/public/users/:userId/setlists/:setlistId', element: <PublicUserSetlistPage /> },
  { path: '/public/users/:userId/stageplots/:stageplotId', element: <PublicUserStageplotPage /> },
  { path: '/public/users/:userId/riders/:riderId', element: <PublicUserTechnicalRiderPage /> },
  { path: '*', element: <AuthenticatedApp /> },
]);

export default function App() {
  return (
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
  );
}
