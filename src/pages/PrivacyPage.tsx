import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <section className="legal-page">
      <Link to="/" className="back-link">← Back</Link>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: draft, not yet reviewed by counsel</p>

      <div className="legal-draft-notice">
        This is a starting template, not finished legal copy. Confirm the list of
        subprocessors below matches what's actually configured for this deployment,
        fill in the bracketed placeholders, and have this reviewed (GDPR applies if
        you have users in the EU/EEA) before treating it as binding.
      </div>

      <p>
        This Privacy Policy explains what data GIGBOY ("we", "us") collects when you
        use the Service, and how it's used.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li>Account data: email address, username, display name, chosen avatar.</li>
        <li>Content you create: songs, chord charts, setlists, songlists, band data,
          press kits, technical riders, and in-browser recordings you make.</li>
        <li>Billing data: handled by Stripe on our behalf — we store your Stripe
          customer ID and subscription status, not your card details.</li>
        <li>Basic usage/analytics data collected via Cloudflare's web analytics,
          which does not use cookies or track you across sites.</li>
      </ul>

      <h2>2. How we use it</h2>
      <p>
        To provide the Service (store and display your songs and setlists), process
        payments for paid plans, authenticate you, and — if you contact us — respond
        to support requests. We don't sell your data.
      </p>

      <h2>3. Where your data lives</h2>
      <p>
        Account data and your song/setlist content are stored with Firebase
        (Google Cloud). The web app and its serverless functions run on Cloudflare.
        Payments are processed by Stripe. Each of these providers acts as a data
        processor on our behalf under their own data processing terms.
      </p>
      <p>
        Some content (like a downloaded ChordPro export, or recordings before they
        sync) is stored locally in your browser via <code>localStorage</code> and, for
        offline/PWA support, in your browser's cache storage — this stays on your
        device.
      </p>

      <h2>4. Sharing</h2>
      <p>
        Content is only visible to you and, for band resources, other members of that
        band. If you generate a public share link (for a setlist, press kit, rider, or
        stage plot), anyone with that link can view the shared content — you control
        when links are created and can revoke access from within the app.
      </p>

      <h2>5. Your rights</h2>
      <p>
        You can export your entire songbook at any time from your account settings.
        You can delete your account at any time, which permanently removes your
        profile and any bands you own. If you're in the EU/EEA/UK, you also have the
        right to access, correct, or request erasure of your personal data, and to
        object to or restrict certain processing — contact us at [support email] to
        exercise these rights beyond what's self-service in the app.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We retain your account and content for as long as your account is active.
        Deleted songs/setlists move to a trash folder before permanent removal;
        deleting your account removes your data outright, subject to what our
        subprocessors (Firebase, Stripe) retain for their own legal/billing
        obligations.
      </p>

      <h2>7. Children</h2>
      <p>The Service is not directed at children under 16.</p>

      <h2>8. Changes to this policy</h2>
      <p>We may update this policy from time to time; material changes will be noted here.</p>

      <h2>9. Contact</h2>
      <p>Questions about this policy or your data: [support email].</p>
    </section>
  );
}
