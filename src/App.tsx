import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SongPage from './pages/SongPage';
import AddSongPage from './pages/AddSongPage';
import LoginPage from './pages/LoginPage';
import { SongsProvider } from './context/SongsContext';
import { AuthProvider, useAuth } from './context/AuthContext';

function AuthGate() {
  const { user, loading, authEnabled } = useAuth();

  if (loading) {
    return <div className="app-status">Loading Songbook…</div>;
  }

  if (authEnabled && !user) return <LoginPage />;

  return (
    <SongsProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/songs/:id" element={<SongPage />} />
            <Route path="/add" element={<AddSongPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
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
