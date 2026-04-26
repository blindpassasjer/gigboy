import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SongPage from './pages/SongPage';
import AddSongPage from './pages/AddSongPage';
import EditSongPage from './pages/EditSongPage';
import LoginPage from './pages/LoginPage';
import { SongsProvider } from './context/SongsContext';
import { SongListsProvider } from './context/SongListsContext';
import { SetlistsProvider } from './context/SetlistsContext';
import { AuthProvider, useAuth } from './context/AuthContext';

function AuthGate() {
  const { user, loading, authEnabled } = useAuth();

  if (loading) {
    return <div className="app-status">Loading Scorebook…</div>;
  }

  if (authEnabled && !user) return <LoginPage />;

  return (
    <SongsProvider>
      <SongListsProvider>
        <SetlistsProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/songs/:id" element={<SongPage />} />
                <Route path="/songs/:id/edit" element={<EditSongPage />} />
                <Route path="/add" element={<AddSongPage />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </SetlistsProvider>
      </SongListsProvider>
    </SongsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
