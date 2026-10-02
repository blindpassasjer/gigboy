import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useBands } from '../context/BandsContext';
import { clearPendingBandInvite } from '../lib/pendingBandInvite';
import { dataClient } from '../lib/dataClient';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * Landing page for band invite links. Served at `/band-invite/:inviteId`, and at the legacy
 * `/profile/invites?bandInvite=<id>` shape that earlier versions put in generated links.
 */
export default function AcceptBandInvitePage() {
  useDocumentTitle('Join band');
  const { inviteId: paramId } = useParams<{ inviteId: string }>();
  const [searchParams] = useSearchParams();
  const inviteId = paramId ?? searchParams.get('bandInvite') ?? '';
  const navigate = useNavigate();
  const { refreshBands } = useBands();
  // Once the user is here the stashed invite is consumed; don't bounce them back on later visits.
  useEffect(() => {
    clearPendingBandInvite();
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    setBusy(true);
    setError('');
    try {
      const band = await dataClient.bands.acceptInvite(inviteId);
      // The band list is cached in BandsContext; reload it so the band page can find the new band.
      await refreshBands();
      try {
        window.localStorage.setItem('gigboy-active-band-id', band.id);
      } catch {
        // Ignore localStorage failures.
      }
      navigate(`/bands/${band.id}/library`, { replace: true, state: { bandId: band.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite.');
      setBusy(false);
    }
  }

  if (!inviteId) {
    return (
      <div className="app-status" role="alert">
        <h1>Invite unavailable</h1>
        <p>This invite link is missing its invite ID.</p>
        <Link to="/" className="btn btn--primary" style={{ marginTop: '1rem' }}>
          Go to Gigboy
        </Link>
      </div>
    );
  }

  return (
    <div className="app-status">
      <h1>You've been invited to join a band</h1>
      <p>Accepting adds you as an editor of the band.</p>
      {error && <p className="login-error" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', justifyContent: 'center' }}>
        <Button variant="primary" onClick={handleAccept} disabled={busy}>
          {busy ? 'Joining...' : 'Join band'}
        </Button>
        <Button onClick={() => navigate('/', { replace: true })} disabled={busy}>
          Not now
        </Button>
      </div>
    </div>
  );
}
