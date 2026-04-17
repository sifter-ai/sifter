import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  Server,
  Shield,
  Users,
  ClipboardList,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";

const FEATURES = [
  { icon: <Shield />, title: "SSO (SAML / SCIM)", desc: "Enterprise identity provider integration and automated user provisioning." },
  { icon: <ClipboardList />, title: "Audit log", desc: "Append-only log of all resource mutations — who changed what and when." },
  { icon: <Users />, title: "Role-based access control", desc: "Folder-level read/write permissions per user or group." },
  { icon: <KeyRound />, title: "BYOK LLM", desc: "Bring your own Azure OpenAI or any OpenAI-compatible endpoint. Your data never leaves your infrastructure." },
  { icon: <Server />, title: "On-premises or dedicated cloud", desc: "Deploy on your own infrastructure or a dedicated cloud environment in your region." },
  { icon: <Lock />, title: "Custom SLA and support", desc: "Dedicated support channel, guaranteed response times, and a named account contact." },
];

const USE_CASES = [
  { value: "invoices", label: "Invoice processing" },
  { value: "contracts", label: "Contract review" },
  { value: "receipts", label: "Receipt / expense management" },
  { value: "compliance", label: "Compliance reporting" },
  { value: "other", label: "Other" },
];

const API_BASE = "";  // Vite proxies /api/* to the backend in dev; empty in prod (same origin)

export default function EnterprisePage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", use_case: "", message: "", _honeypot: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/enterprise/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Request failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again or email us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="Sifter" className="h-7 w-7" />
            <span className="text-primary font-bold text-lg tracking-tight">Sifter</span>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Enterprise document intelligence</h1>
          <p className="text-muted-foreground mt-3 text-lg max-w-2xl leading-relaxed">
            Everything in Sifter, plus the security and deployment controls enterprise teams require.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-16">
          {/* Features */}
          <div>
            <h2 className="text-lg font-semibold mb-6">What's included</h2>
            <div className="flex flex-col gap-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-4">
                  <div className="bg-primary/10 text-primary rounded-lg p-2 h-fit shrink-0">
                    {React.cloneElement(f.icon as React.ReactElement, { className: "h-4 w-4" })}
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{f.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Contact form */}
          <div>
            <h2 className="text-lg font-semibold mb-6">Get in touch</h2>

            {submitted ? (
              <div className="border rounded-xl p-8 bg-card flex flex-col items-center gap-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-primary" />
                <div>
                  <h3 className="font-semibold">Message received</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    We'll be in touch within one business day.
                  </p>
                </div>
                <Link to="/" className="text-sm text-primary hover:underline">Back to Sifter</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Honeypot — hidden from real users */}
                <input type="text" name="_honeypot" value={form._honeypot} onChange={handleChange} className="hidden" tabIndex={-1} autoComplete="off" />

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" value={form.name} onChange={handleChange} required placeholder="Jane Smith" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="jane@acme.com" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" name="company" value={form.company} onChange={handleChange} required placeholder="Acme Corp" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="use_case">Primary use case</Label>
                  <select
                    id="use_case"
                    name="use_case"
                    value={form.use_case}
                    onChange={handleChange}
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="" disabled>Select one…</option>
                    {USE_CASES.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="message">Message (optional)</Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Tell us about your document volumes, team size, or any specific requirements."
                    rows={4}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Sending…" : "Get in touch"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  We'll respond within one business day.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
