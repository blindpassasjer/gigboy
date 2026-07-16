import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from '../utils/anchoredToast';

export default function VerifyEmailBanner() {
  const { user, resendVerificationEmail, refreshEmailVerification } = useAuth();
  const [busy, setBusy] = useState<'resend' | 'refresh' | null>(null);

  if (!user || user.emailVerified) return null;

  const handleResend = async () => {
    setBusy('resend');
    const error = await resendVerificationEmail();
    setBusy(null);
    if (error) toast.error(error);
    else toast.success(`Verification email sent to ${user.email}.`);
  };

  const handleRefresh = async () => {
    setBusy('refresh');
    await refreshEmailVerification();
    setBusy(null);
  };

  return (
    <div className="verify-email-banner" role="status">
      <span>
        Verify your email ({user.email}) to create songs, setlists, and bands.
      </span>
      <div className="verify-email-banner-actions">
        <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void handleResend()}>
          {busy === 'resend' ? 'Sending…' : 'Resend email'}
        </button>
        <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void handleRefresh()}>
          {busy === 'refresh' ? 'Checking…' : "I've verified"}
        </button>
      </div>
    </div>
  );
}
