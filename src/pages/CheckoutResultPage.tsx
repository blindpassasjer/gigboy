import { Link, useSearchParams } from 'react-router-dom';

export default function CheckoutResultPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const success = status === 'success';

  return (
    <section className="checkout-result-page">
      <div className="checkout-result-card">
        <h1>{success ? 'Subscription updated' : 'Checkout canceled'}</h1>
        <p>
          {success
            ? 'Your billing change was accepted. If the updated plan does not appear immediately, refresh in a moment while the webhook finishes syncing.'
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