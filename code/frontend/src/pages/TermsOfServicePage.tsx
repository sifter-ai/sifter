import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.svg";

const LAST_UPDATED = "April 17, 2026";
const COMPANY = "Sifter AI";
const CONTACT_EMAIL = "support@sifter.run";
const GOVERNING_LAW = "Italy";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="Sifter" className="h-7 w-7" />
            <span className="text-primary font-bold text-lg tracking-tight">Sifter</span>
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mt-3">Last updated: {LAST_UPDATED}</p>
        </header>

        <article className="space-y-8 text-sm leading-relaxed">
          <Section title="1. Agreement">
            <p>
              These Terms of Service ("Terms") govern your access to and use of Sifter, a document
              extraction service operated by {COMPANY} ("Sifter", "we", "us"). By creating an
              account, accessing the API, or otherwise using the service you agree to these Terms.
              If you are entering into these Terms on behalf of an organization, you represent that
              you have authority to bind that organization.
            </p>
          </Section>

          <Section title="2. The service">
            <p>
              Sifter lets you upload documents, extract structured fields via AI, and query the
              results through the web app, API, CLI, or MCP server. A free tier is offered with
              reduced limits; paid tiers unlock higher quotas and additional features as described
              on our pricing page.
            </p>
            <p>
              The open-source core of Sifter is published under the Apache 2.0 License and may be
              self-hosted. These Terms apply to the hosted service at sifter.run; self-hosted
              deployments are governed by the open-source license alone.
            </p>
          </Section>

          <Section title="3. Accounts">
            <p>
              You must provide accurate registration information and keep your credentials
              confidential. You are responsible for all activity under your account, including
              actions taken by team members you invite. Notify us promptly of any unauthorized use.
            </p>
            <p>
              You must be at least 16 years old to use Sifter. The service is not intended for
              children.
            </p>
          </Section>

          <Section title="4. Your content">
            <p>
              You retain all rights to the documents you upload and the data extracted from them
              ("Your Content"). You grant us a limited, worldwide, royalty-free licence to host,
              process, and transmit Your Content solely to operate the service, provide support, and
              perform the extractions you request.
            </p>
            <p>
              You represent that you own or have the right to upload Your Content and that doing so
              does not violate any third-party rights or applicable law. You are responsible for
              obtaining any consents required when you upload personal data about others.
            </p>
          </Section>

          <Section title="5. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2 text-muted-foreground">
              <li>Upload content that is illegal, infringing, defamatory, or that you have no right to share.</li>
              <li>Upload malware, attempt to compromise the service, or probe for vulnerabilities without written permission.</li>
              <li>Circumvent quotas, rate limits, or authentication mechanisms.</li>
              <li>Use the service to generate or store CSAM or other content prohibited by law.</li>
              <li>Resell, sublicense, or white-label the hosted service without a separate written agreement.</li>
              <li>Use the service to train a competing product or to reverse-engineer the LLM prompts.</li>
            </ul>
            <p className="mt-3">
              We may suspend or terminate accounts that violate this section, with or without notice
              depending on the severity of the violation.
            </p>
          </Section>

          <Section title="6. Google API services">
            <p>
              If you connect Gmail or Google Drive, your use of those integrations is additionally
              subject to{" "}
              <a
                className="text-primary hover:underline"
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google's Terms of Service
              </a>
              . Sifter's use of information received from Google APIs adheres to the{" "}
              <a
                className="text-primary hover:underline"
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including Limited Use requirements.
            </p>
          </Section>

          <Section title="7. Subscriptions, billing, and refunds">
            <p>
              Paid plans are billed monthly in advance via Stripe. Subscriptions renew automatically
              until cancelled. You can upgrade, downgrade, or cancel at any time from Settings →
              Billing. Downgrades and cancellations take effect at the end of the current billing
              period; we do not issue prorated refunds for the remainder of a paid period except
              where required by law.
            </p>
            <p>
              If your payment fails, we will retry and may suspend paid features until payment is
              received. Taxes are your responsibility unless expressly included in the price.
            </p>
            <p>
              We may change pricing with at least 30 days' notice. New pricing applies at the start
              of your next billing period.
            </p>
          </Section>

          <Section title="8. Plan limits and fair use">
            <p>
              Each plan includes monthly document and storage limits, as disclosed on the pricing
              page and enforced programmatically. If you exceed your limits you may be asked to
              upgrade or your ingestion may be temporarily paused. Enterprise customers may
              negotiate custom limits.
            </p>
          </Section>

          <Section title="9. Availability and support">
            <p>
              We strive for high availability but the service is provided on an "as is" basis
              without uptime guarantees, except where a separate written SLA applies (Enterprise
              plans). Support is provided by email at{" "}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{" "}
              on best-effort terms for Free, Starter, and Pro plans.
            </p>
          </Section>

          <Section title="10. Intellectual property">
            <p>
              The Sifter name, logo, and hosted service are owned by {COMPANY}. The open-source code
              is licenced under Apache 2.0 and available on GitHub. Nothing in these Terms transfers
              any of our intellectual property to you, other than the limited right to use the
              service as described here.
            </p>
          </Section>

          <Section title="11. Privacy">
            <p>
              Our{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              explains how we collect and handle your personal data and forms part of these Terms.
            </p>
          </Section>

          <Section title="12. Warranties and disclaimer">
            <p className="uppercase text-xs tracking-wide">
              The service is provided "as is" and "as available", without warranties of any kind,
              whether express, implied, or statutory, including warranties of merchantability,
              fitness for a particular purpose, non-infringement, or that the extraction results
              will be accurate or error-free.
            </p>
            <p>
              AI-generated extractions may contain mistakes. You are responsible for reviewing
              results before relying on them for legal, financial, medical, or other consequential
              decisions.
            </p>
          </Section>

          <Section title="13. Limitation of liability">
            <p className="uppercase text-xs tracking-wide">
              To the maximum extent permitted by law, Sifter's aggregate liability arising out of or
              relating to these Terms or the service shall not exceed the greater of (a) the amounts
              you paid us in the 12 months preceding the event giving rise to the claim, or (b) one
              hundred euros. We shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, including loss of profits, revenue, goodwill, or
              data.
            </p>
          </Section>

          <Section title="14. Indemnity">
            <p>
              You agree to indemnify and hold {COMPANY} harmless from any claim, loss, or demand
              (including reasonable legal fees) arising from Your Content, your use of the service,
              or your breach of these Terms.
            </p>
          </Section>

          <Section title="15. Termination">
            <p>
              You may cancel your account at any time. We may suspend or terminate your account for
              material breach of these Terms, non-payment, or if we stop offering the service.
              Sections that by their nature should survive termination (including 4, 5, 10, 12, 13,
              14, and 17) will survive.
            </p>
          </Section>

          <Section title="16. Changes to these Terms">
            <p>
              We may update these Terms from time to time. For material changes we will give at
              least 30 days' notice by email or in-app notice. Continued use of the service after
              the effective date constitutes acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="17. Governing law and disputes">
            <p>
              These Terms are governed by the laws of {GOVERNING_LAW}. Any disputes shall be
              submitted to the exclusive jurisdiction of the competent courts of {GOVERNING_LAW},
              except where mandatory consumer protection law grants you the right to bring
              proceedings in another forum.
            </p>
          </Section>

          <Section title="18. Contact">
            <p>
              For questions about these Terms, write to{" "}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </article>

        <footer className="mt-16 pt-8 border-t flex items-center justify-between text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            ← Privacy Policy
          </Link>
          <Link to="/" className="hover:text-foreground transition-colors">
            Sifter
          </Link>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold tracking-tight mb-3">{title}</h2>
      <div className="text-muted-foreground space-y-3">{children}</div>
    </section>
  );
}
