import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SongPage from './pages/SongPage';
import AddSongPage from './pages/AddSongPage';
import { SongsProvider } from './context/SongsContext';

export default function App() {
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
