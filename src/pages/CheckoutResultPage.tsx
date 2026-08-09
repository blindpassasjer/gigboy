import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const CONFETTI = ['🎉', '🎊', '⭐', '🎸', '🥁', '🎵', '🎶', '✨'];

export default function CheckoutResultPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const success = status === 'success';

  useDocumentTitle(success ? "You're all set!" : 'Checkout canceled');

  return (
    <section className="checkout-result-page">
      <div className={`checkout-result-card${success ? ' checkout-result-card--success' : ''}`}>
        {success && (
          <div className="checkout-result-confetti" aria-hidden="true">
            {CONFETTI.map((emoji, i) => (
              <span key={i} className={`checkout-result-confetti-piece checkout-result-confetti-piece--${i + 1}`}>{emoji}</span>
            ))}
          </div>
        )}
        <div className="checkout-result-icon" aria-hidden="true">
          {success ? '🎉' : '↩'}
        </div>
        <h1>{success ? "You're all set!" : 'Checkout canceled'}</h1>
        <p>
          {success
            ? "Your new plan is live — time to make some noise! If it doesn't appear straight away, give it a moment while the billing webhook catches up."
            : 'No billing changes were made. You can review plans again whenever you are ready.'}
        </p>
        <div className="checkout-result-actions">
          <Link to="/profile" className="setlist-action-btn">Back to account</Link>
          <Link to="/pricing" className="setlist-action-btn setlist-action-btn--secondary">View pricing</Link>
        </div>
      </div>
    </section>
  );
}