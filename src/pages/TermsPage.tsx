import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <section className="legal-page">
      <Link to="/" className="back-link">← Back</Link>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: July 16, 2026</p>

      <p>
        These Terms of Service ("Terms") govern your use of GIGBOY (the "Service"),
        operated by Sebastian Manriquez ("we", "us"). By creating an
        account or using the Service, you agree to these Terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        GIGBOY is a ChordPro-based songbook, setlist, and gig-preparation tool for
        musicians and bands. Free and paid ("Pro", "Crew") plans are described on our
        <Link to="/pricing"> Pricing page</Link>, including current limits on songs,
        setlists, and band members.
      </p>

      <h2>2. Your account</h2>
      <p>
        You're responsible for the activity on your account and for keeping your
        login credentials secure. You must be old enough to form a binding contract
        in your jurisdiction to create an account.
      </p>

      <h2>3. Your content and copyright</h2>
      <p>
        You keep ownership of the songs, lyrics, chord charts, recordings, and other
        material you upload ("Your Content"). By uploading it, you grant us a limited
        license to store, process, and display it back to you (and to collaborators
        you explicitly share it with) so the Service can work.
      </p>
      <p>
        Song lyrics and chord charts are frequently protected by copyright owned by
        songwriters and publishers, not by the person transcribing them. You are
        solely responsible for making sure your use of any song — including personal
        practice charts, band-shared charts, and anything made available via a public
        share link (setlists, press kits, riders) — complies with copyright law and
        any licenses that apply in your context (e.g. church/venue licensing). We may
        remove content in response to a valid copyright complaint.
      </p>

      <h2>4. Subscriptions and billing</h2>
      <p>
        Paid plans are billed in advance on a monthly or annual cycle through Stripe.
        You can view invoices and cancel anytime from the billing portal in your
        account settings; cancellation stops future renewals but does not retroactively
        refund the current billing period unless required by law in your jurisdiction.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        Don't use the Service to store or share content you don't have the right to
        use, to abuse other users or bands you're not a member of, or to attempt to
        disrupt or reverse-engineer the Service.
      </p>

      <h2>6. Termination</h2>
      <p>
        You can delete your account at any time from account settings; this removes
        your profile and any bands you own. We may suspend or terminate accounts that
        violate these Terms.
      </p>

      <h2>7. Disclaimer and liability</h2>
      <p>
        The Service is provided "as is" without warranties of any kind. To the extent
        permitted by law, we are not liable for indirect, incidental, or consequential
        damages arising from your use of the Service, including data loss — we
        recommend using the export tool in your account settings to keep your own
        backup of your songbook.
      </p>

      <h2>8. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service
        after changes take effect means you accept the updated Terms.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These Terms are governed by the laws of Norway, without
        regard to conflict-of-law principles.
      </p>

      <h2>10. Contact</h2>
      <p>Questions about these Terms: sebastian@manriquez.no.</p>
    </section>
  );
}
