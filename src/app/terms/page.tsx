import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Entry",
  description: "Terms of Service for Entry — the events ticketing and rep platform.",
};

const EFFECTIVE_DATE = "26 April 2026";

export default function TermsPage() {
  return (
    <main style={pageStyle}>
      <article style={articleStyle}>
        <h1 style={h1Style}>Terms of Service</h1>
        <p style={metaStyle}>Effective {EFFECTIVE_DATE}</p>

        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Entry
          (the &ldquo;Service&rdquo;), provided by Entry Limited (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, &ldquo;our&rdquo;). By creating an account, buying a
          ticket, or otherwise using the Service, you agree to these Terms. If
          you do not agree, do not use the Service.
        </p>

        <h2 style={h2Style}>1. The Service</h2>
        <p>
          Entry is a white-label events platform. Promoters use Entry to sell
          tickets, manage merchandise, and run a representative
          (&ldquo;rep&rdquo;) ambassador programme. Ticket buyers use Entry to
          purchase tickets and access events. Reps use Entry to promote events
          to their networks in exchange for points, perks, and (where offered)
          monetary rewards.
        </p>

        <h2 style={h2Style}>2. Accounts</h2>
        <p>
          You must be at least 16 years old (or the age of digital consent in
          your country) to create an account. You are responsible for the
          accuracy of your account information and for keeping your password
          secure. You are responsible for all activity under your account.
        </p>
        <p>
          We may suspend or terminate accounts that violate these Terms,
          attempt to defraud the Service, or post abusive or unlawful content.
        </p>

        <h2 style={h2Style}>3. Tickets and Purchases</h2>
        <p>
          Tickets are sold on behalf of the event promoter (the
          &ldquo;Promoter&rdquo;). The Promoter is the merchant of record for
          the transaction. Refunds, exchanges, and event-specific terms are
          set by the Promoter and shown at point of sale.
        </p>
        <p>
          Entry processes payments through Stripe. By purchasing a ticket you
          also agree to Stripe&apos;s applicable terms.
        </p>

        <h2 style={h2Style}>4. Rep Programme</h2>
        <p>
          Reps may earn experience points (&ldquo;XP&rdquo;), platform credits
          (&ldquo;EP&rdquo;), and other rewards by completing quests, sharing
          discount codes, and driving ticket sales. Rewards are governed by
          the rules of the issuing Promoter and these Terms.
        </p>
        <p>
          You may not artificially inflate sales or quest completions, use
          automated tools, create multiple accounts, or otherwise attempt to
          game the rep economy. Doing so is grounds for forfeiture of
          accumulated rewards and account termination.
        </p>

        <h2 style={h2Style}>5. User Content</h2>
        <p>
          You may post content to Entry, including stories, profile photos,
          quest submissions, and messages. You retain ownership of your
          content. By posting it, you grant Entry and the Promoter you are
          associated with a non-exclusive, worldwide, royalty-free licence to
          host, display, reproduce, and distribute that content within the
          Service for the purpose of operating it.
        </p>
        <p>
          You may not post content that is unlawful, harassing, defamatory,
          obscene, infringing, or that promotes hate, violence, or
          discrimination. Entry reserves the right to remove any content and
          to disable accounts that repeatedly post such content.
        </p>

        <h2 style={h2Style}>6. Reporting and Moderation</h2>
        <p>
          Every user-generated surface in the Service includes a means to
          report objectionable content or abusive behaviour. Reports are
          reviewed by Entry and the relevant Promoter. Confirmed violations
          result in content removal and may result in account termination. We
          aim to act on reports within 24 hours.
        </p>

        <h2 style={h2Style}>7. Privacy</h2>
        <p>
          Your use of Entry is also governed by our{" "}
          <a href="/privacy" style={linkStyle}>Privacy Policy</a>, which
          explains what data we collect, how we use it, and the choices you
          have.
        </p>

        <h2 style={h2Style}>8. Intellectual Property</h2>
        <p>
          The Service, including its software, design, and trademarks, is
          owned by Entry. Promoter brands shown in the Service are owned by
          their respective Promoters. You may not copy, reverse-engineer, or
          create derivative works of the Service.
        </p>

        <h2 style={h2Style}>9. Disclaimers</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of
          any kind. Entry is not the organiser of any event listed on the
          Service and is not responsible for an event being cancelled,
          postponed, or otherwise altered by its Promoter.
        </p>

        <h2 style={h2Style}>10. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, Entry&apos;s total liability
          arising out of or relating to these Terms or your use of the Service
          will not exceed the greater of (a) the amount you paid Entry in the
          12 months before the event giving rise to the claim, or (b) GBP 100.
        </p>

        <h2 style={h2Style}>11. Termination</h2>
        <p>
          You may close your account at any time from within the app
          (Settings &rarr; Delete account). Account deletion removes your
          personal data per our Privacy Policy and ends your access to the
          Service. Already-issued tickets remain valid; the Promoter retains
          the records required for event entry and statutory accounting.
        </p>

        <h2 style={h2Style}>12. Changes</h2>
        <p>
          We may update these Terms from time to time. Material changes will
          be communicated through the app or by email at least 14 days before
          they take effect. Continued use of the Service after the effective
          date constitutes acceptance.
        </p>

        <h2 style={h2Style}>13. Contact</h2>
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:hello@entry.events" style={linkStyle}>
            hello@entry.events
          </a>
          .
        </p>

        <h2 style={h2Style}>14. Governing Law</h2>
        <p>
          These Terms are governed by the laws of England and Wales. Disputes
          will be heard in the courts of England and Wales, except where
          mandatory consumer-protection law in your country of residence
          applies.
        </p>
      </article>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0a0a0a",
  color: "#e6e6e6",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "48px 24px",
  lineHeight: 1.6,
};

const articleStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
};

const h1Style: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  marginBottom: 8,
};

const h2Style: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  marginTop: 32,
  marginBottom: 12,
};

const metaStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#888",
  marginBottom: 32,
};

const linkStyle: React.CSSProperties = {
  color: "#a78bfa",
  textDecoration: "underline",
};
