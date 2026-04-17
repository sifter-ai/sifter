import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.svg";

const LAST_UPDATED = "April 17, 2026";
const COMPANY = "Sifter AI";
const CONTACT_EMAIL = "privacy@sifter.run";
const COMPANY_ADDRESS = "Sifter AI, Italy";

export default function PrivacyPolicyPage() {
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
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mt-3">Last updated: {LAST_UPDATED}</p>
        </header>

        <article className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">
          <Section title="1. Who we are">
            <p>
              Sifter ("Sifter", "we", "us") is operated by {COMPANY}. This Privacy Policy explains
              how we collect, use, store, and share information about you when you use the Sifter
              service at sifter.run and related products.
            </p>
          </Section>

          <Section title="2. Information we collect">
            <h3 className="font-medium mt-4 mb-2">Account information</h3>
            <p>
              When you register, we collect your email address, full name, and hashed password. If
              you sign in through Google, we additionally receive your Google account email, name,
              and profile picture.
            </p>

            <h3 className="font-medium mt-4 mb-2">Documents and extracted data</h3>
            <p>
              We process the documents you upload, send to an inbound email address, or authorize
              us to fetch from Gmail or Google Drive. We store the original file, extracted text,
              structured fields, and metadata needed to render and query your data.
            </p>

            <h3 className="font-medium mt-4 mb-2">Google user data (Gmail + Drive connectors)</h3>
            <p>
              If you connect Gmail or Google Drive, we request OAuth scopes that let us read messages
              under a specific label (Gmail) or files inside a specific folder (Drive). We store an
              encrypted refresh token so that synchronization can continue. We never read other parts
              of your mailbox or drive, never send email on your behalf, and never modify or delete
              your Google data.
            </p>
            <p>
              Our use of information received from Google APIs adheres to the{" "}
              <a
                className="text-primary hover:underline"
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>

            <h3 className="font-medium mt-4 mb-2">Billing information</h3>
            <p>
              Payments are processed by Stripe. We receive only a customer identifier, the active
              subscription plan, and the last four digits of your card. We never store full card
              numbers on our servers.
            </p>

            <h3 className="font-medium mt-4 mb-2">Usage and diagnostic data</h3>
            <p>
              We log requests, IP address, user agent, and timestamps for security, rate limiting,
              and debugging purposes. We record aggregate usage counters (documents processed,
              storage used) to enforce plan limits.
            </p>
          </Section>

          <Section title="3. How we use your information">
            <ul className="list-disc pl-6 space-y-1.5">
              <li>To operate the service: store documents, extract fields, return query results.</li>
              <li>To authenticate you and protect your account.</li>
              <li>To send transactional emails (invitations, billing, security alerts).</li>
              <li>To enforce plan limits and bill for paid usage.</li>
              <li>To investigate abuse, fraud, or violations of our Terms of Service.</li>
              <li>To comply with applicable law.</li>
            </ul>
            <p className="mt-3">
              <strong>We do not sell your personal data.</strong> We do not use the contents of your
              documents or Google user data to train generic AI models.
            </p>
          </Section>

          <Section title="4. How your documents are processed">
            <p>
              Field extraction is performed by large language models. We send document text to Google
              Vertex AI (Gemini family models) under a data processing agreement. Inference outputs
              are stored in your account; prompts and documents are not retained by the model
              provider for training, per our configuration.
            </p>
          </Section>

          <Section title="5. Subprocessors">
            <p>We rely on the following subprocessors to provide the service:</p>
            <ul className="list-disc pl-6 space-y-1.5 mt-2">
              <li>
                <strong>Google Cloud Platform</strong> — application hosting (Cloud Run), object
                storage (Cloud Storage), LLM inference (Vertex AI). Region: europe-west1.
              </li>
              <li>
                <strong>MongoDB Atlas</strong> — primary database for metadata and extracted fields.
              </li>
              <li>
                <strong>Stripe</strong> — subscription billing and payment processing.
              </li>
              <li>
                <strong>Brevo</strong> (or Resend) — transactional email delivery.
              </li>
            </ul>
          </Section>

          <Section title="6. Data retention">
            <p>
              Documents and extracted data are retained for as long as your account is active. You
              may delete individual documents, folders, or sifts at any time; deletions are
              propagated to object storage within 7 days. If you close your account, we delete your
              data within 30 days, except where we are required to retain it by law (for example,
              invoicing records for tax purposes, retained up to 10 years).
            </p>
          </Section>

          <Section title="7. Security">
            <p>
              Data is encrypted in transit (TLS 1.2+) and at rest (GCS, MongoDB Atlas). Google
              refresh tokens are additionally encrypted at the application layer using Fernet
              (AES-128-CBC + HMAC-SHA256). Access to production systems is restricted to authorized
              personnel and logged.
            </p>
          </Section>

          <Section title="8. Your rights">
            <p>
              If you are in the European Economic Area, the United Kingdom, or another jurisdiction
              that grants data subject rights, you may request access to, correction of, deletion of,
              or export of your personal data. To exercise these rights, email us at{" "}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . You may also disconnect the Gmail or Drive connectors at any time from Settings →
              Connectors, or revoke Sifter's access at{" "}
              <a
                className="text-primary hover:underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                myaccount.google.com/permissions
              </a>
              .
            </p>
          </Section>

          <Section title="9. International data transfers">
            <p>
              Sifter is hosted in the European Union (europe-west1). If you access the service from
              outside the EU, your data will be transferred to and processed in the EU. Transfers
              outside the EU to subprocessors (e.g. Stripe in the US) are covered by Standard
              Contractual Clauses.
            </p>
          </Section>

          <Section title="10. Children">
            <p>
              Sifter is not directed to children under 16 and we do not knowingly collect personal
              data from them. If you believe a child has provided us data, contact us and we will
              delete it.
            </p>
          </Section>

          <Section title="11. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              announced by email or in-app notice at least 30 days before taking effect. The "Last
              updated" date above reflects the current version.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions about this policy or your data? Email{" "}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <p className="text-muted-foreground mt-2">{COMPANY_ADDRESS}</p>
          </Section>
        </article>

        <footer className="mt-16 pt-8 border-t flex items-center justify-between text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">
            Sifter
          </Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Terms of Service →
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
