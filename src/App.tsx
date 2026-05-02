import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { SongsProvider } from './context/SongsContext';
import { SongListsProvider } from './context/SongListsContext';
import { SetlistsProvider } from './context/SetlistsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BandsProvider } from './context/BandsContext';

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
                <Route path="/setlists/:id/concert" element={<SetlistConcertPage />} />
              </Routes>
            </Layout>
          </BandsProvider>
        </SetlistsProvider>
      </SongListsProvider>
    </SongsProvider>
  );
}

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
          },
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<AuthenticatedApp />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
