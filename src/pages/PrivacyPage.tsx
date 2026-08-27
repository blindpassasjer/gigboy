import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useInstanceConfig } from '../hooks/useInstanceConfig';

const LAST_UPDATED = 'July 16, 2026';

export default function PrivacyPage() {
  useDocumentTitle('Privacy Policy');
  const config = useInstanceConfig();

  const contact = config?.operatorContactEmail?.trim()
    || 'the contact address published by the operator of this instance';

  return (
    <section className="legal-page">
      <Link to="/" className="back-link">← Back</Link>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

      <p>
        This Privacy Policy explains what data this Gigboy deployment ("we", "us")
        collects when you use the Service, and how it's used.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li>Account data: email address, username, display name, chosen avatar.</li>
        <li>Content you create: songs, chord charts, setlists, songlists, band data,
          press kits, technical riders, and in-browser recordings you make.</li>
      </ul>

      <h2>2. How we use it</h2>
      <p>
        To provide the Service (store and display your songs and setlists), authenticate
        you, and — if you contact us — respond to support requests. We don't sell your
        data.
      </p>

      <h2>3. Where your data lives</h2>
      <p>
        Gigboy is self-hosted: account data and your song/setlist content are stored in
        this deployment's own database and file storage, run by whoever operates this
        instance — not by a third-party SaaS provider.
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
        object to or restrict certain processing — contact {contact} to
        exercise these rights beyond what's self-service in the app.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We retain your account and content for as long as your account is active.
        Deleted songs/setlists move to a trash folder before permanent removal;
        deleting your account removes your data outright.
      </p>

      <h2>7. Children</h2>
      <p>The Service is not directed at children under 16.</p>

      <h2>8. Changes to this policy</h2>
      <p>We may update this policy from time to time; material changes will be noted here.</p>

      <h2>9. Contact</h2>
      <p>Questions about this policy or your data: {contact}.</p>
    </section>
  );
}
