"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";

/* ── Logo image compression ── */

function compressLogoImage(
  file: File,
  maxWidth: number,
  quality: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          let w = img.width;
          let h = img.height;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png", quality));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function processLogoFile(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) {
    alert("Image too large. Maximum is 5MB.");
    return null;
  }
  const result = await compressLogoImage(file, 400, 0.9);
  if (!result) alert("Failed to process image. Try a smaller file.");
  return result;
}

/* ── Template variables ── */
const TEMPLATE_VARS = [
  { var: "{{customer_name}}", desc: "Customer's first name" },
  { var: "{{event_name}}", desc: "Event name" },
  { var: "{{venue_name}}", desc: "Venue name" },
  { var: "{{event_date}}", desc: "Event date" },
  { var: "{{order_number}}", desc: "Order number" },
  { var: "{{ticket_count}}", desc: "Number of tickets" },
];

/* ── Section component ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="font-mono text-[0.65rem] font-bold uppercase tracking-[2px] text-muted-foreground mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

/* ── Input field ── */
function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full max-w-md px-3 py-2.5 bg-background border border-border rounded-md text-sm text-foreground outline-none transition-colors focus:border-primary font-[Inter,sans-serif]"
      />
      {hint && <p className="text-[0.7rem] text-muted-foreground/60 mt-1">{hint}</p>}
    </div>
  );
}

/* ── Toggle ── */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 group"
    >
      <div className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-primary" : "bg-[#333]"}`}>
        <div
          className={`absolute top-[3px] w-[18px] h-[18px] rounded-full transition-all ${
            checked ? "left-[23px] bg-white" : "left-[3px] bg-[#888]"
          }`}
        />
      </div>
      <span className={`font-mono text-xs tracking-wider uppercase transition-colors ${checked ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
    </button>
  );
}

/* ── Email preview (inline iframe-like rendering) ── */
function EmailPreview({ settings }: { settings: EmailSettings }) {
  const accent = settings.accent_color || "#ff0033";
  const previewSubject = settings.order_confirmation_subject
    .replace("{{event_name}}", "FERAL Liverpool")
    .replace("{{order_number}}", "FERAL-00042");
  const previewHeading = settings.order_confirmation_heading
    .replace("{{customer_name}}", "Alex")
    .replace("{{event_name}}", "FERAL Liverpool");
  const previewMessage = settings.order_confirmation_message
    .replace("{{customer_name}}", "Alex")
    .replace("{{event_name}}", "FERAL Liverpool")
    .replace("{{venue_name}}", "Invisible Wind Factory")
    .replace("{{event_date}}", "Thursday 27 March 2026")
    .replace("{{order_number}}", "FERAL-00042")
    .replace("{{ticket_count}}", "2");

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-[#f4f4f5]">
      {/* Email client chrome */}
      <div className="bg-card px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] font-mono text-muted-foreground uppercase tracking-wider w-16">From</span>
            <span className="text-xs text-foreground">{settings.from_name} &lt;{settings.from_email}&gt;</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] font-mono text-muted-foreground uppercase tracking-wider w-16">Subject</span>
            <span className="text-xs text-foreground font-medium">{previewSubject}</span>
          </div>
        </div>
      </div>

      {/* Email body preview */}
      <div className="p-6 flex justify-center">
        <div className="w-full max-w-[520px] bg-white rounded-lg overflow-hidden shadow-sm">
          {/* Accent bar */}
          <div style={{ height: 4, backgroundColor: accent }} />

          {/* Header */}
          <div className={`py-6 px-8 text-center ${settings.logo_url ? "bg-[#0e0e0e]" : ""}`}>
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="Logo" className="h-9 w-auto inline-block" />
            ) : (
              <div className="font-mono text-sm font-bold tracking-[3px] uppercase text-[#111]">
                {settings.from_name}
              </div>
            )}
          </div>

          {/* Heading */}
          <div className="px-8 pt-0 pb-2 text-center">
            <h1 className="font-mono text-2xl font-bold text-[#111] tracking-wider m-0">
              {previewHeading}
            </h1>
          </div>

          {/* Message */}
          <div className="px-8 pb-6 text-center">
            <p className="text-[15px] leading-relaxed text-[#555] m-0">
              {previewMessage}
            </p>
          </div>

          {/* Divider */}
          <div className="px-8"><div className="h-px bg-[#eee]" /></div>

          {/* Event details */}
          <div className="px-8 py-5">
            <div className="font-mono text-[10px] font-bold tracking-[2px] uppercase text-[#999] mb-2">Event</div>
            <div className="text-[17px] font-semibold text-[#111] mb-1">FERAL Liverpool</div>
            <div className="text-sm text-[#666]">Thursday 27 March 2026 · Invisible Wind Factory</div>
          </div>

          {/* Divider */}
          <div className="px-8"><div className="h-px bg-[#eee]" /></div>

          {/* Order details */}
          <div className="px-8 py-5">
            <div className="font-mono text-[10px] font-bold tracking-[2px] uppercase text-[#999] mb-3">Order Details</div>
            <div className="flex justify-between text-sm text-[#666] py-1">
              <span>Order</span>
              <span className="font-mono font-bold text-[#111]">FERAL-00042</span>
            </div>
            <div className="flex justify-between text-sm text-[#666] py-1">
              <span>Tickets</span>
              <span className="text-[#111]">2</span>
            </div>
            <div className="flex justify-between text-sm py-1 border-t border-[#eee] pt-2 mt-1">
              <span className="text-[#666]">Total</span>
              <span className="font-mono text-lg font-bold text-[#111]">£52.92</span>
            </div>
          </div>

          {/* Divider */}
          <div className="px-8"><div className="h-px bg-[#eee]" /></div>

          {/* Tickets */}
          <div className="px-8 pt-5 pb-2">
            <div className="font-mono text-[10px] font-bold tracking-[2px] uppercase text-[#999] mb-2">Your Tickets</div>
            <div className="text-[13px] text-[#888] mb-4">Your PDF tickets with QR codes are attached to this email.</div>
          </div>
          <div className="px-8 pb-6">
            <div className="bg-[#fafafa] rounded-md border border-[#f0f0f0] divide-y divide-[#f0f0f0]">
              <div className="px-4 py-3">
                <div className="text-[13px] text-[#666]">General Release</div>
                <div className="font-mono text-base font-bold tracking-wider" style={{ color: accent }}>FERAL-A1B2C3D4</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[13px] text-[#666]">General Release</div>
                <div className="font-mono text-base font-bold tracking-wider" style={{ color: accent }}>FERAL-E5F6G7H8</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-5 bg-[#fafafa] border-t border-[#f0f0f0] text-center">
            <div className="font-mono text-[10px] font-bold tracking-[2px] uppercase text-[#aaa] mb-1">
              {settings.footer_text || settings.from_name}
            </div>
            <div className="text-[11px] text-[#bbb]">
              This is an automated order confirmation. Please do not reply directly to this email.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════ */

export default function OrderConfirmationPage() {
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"settings" | "preview">("settings");

  // Logo upload
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoDragging, setLogoDragging] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);

  // Test email
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState("");

  // Resend status
  const [resendStatus, setResendStatus] = useState<{
    configured: boolean;
    verified: boolean;
    loading: boolean;
  }>({ configured: false, verified: false, loading: true });

  // Load settings + Resend status
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) { setLoading(false); return; }
        const { data } = await supabase
          .from(TABLES.SITE_SETTINGS)
          .select("data")
          .eq("key", "feral_email")
          .single();
        if (data?.data && typeof data.data === "object") {
          setSettings((prev) => ({ ...prev, ...(data.data as Partial<EmailSettings>) }));
        }
      } catch { /* defaults are fine */ }
      setLoading(false);
    })();

    fetch("/api/email/status")
      .then((r) => r.json())
      .then((json) => setResendStatus({ ...json, loading: false }))
      .catch(() => setResendStatus({ configured: false, verified: false, loading: false }));
  }, []);

  const update = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setStatus("");
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus("");
    try {
      const supabase = getSupabaseClient();
      if (!supabase) { setStatus("Error: Database not configured"); setSaving(false); return; }
      const { error } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .upsert({ key: "feral_email", data: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
      setStatus(error ? `Error: ${error.message}` : "Settings saved");
    } catch { setStatus("Error: Failed to save"); }
    setSaving(false);
  }, [settings]);

  const handleLogoFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setLogoProcessing(true);
    const compressed = await processLogoFile(file);
    if (!compressed) { setLogoProcessing(false); return; }
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: compressed, key: "email-logo" }),
      });
      const json = await res.json();
      if (res.ok && json.url) update("logo_url", json.url);
    } catch { /* upload failed */ }
    setLogoProcessing(false);
  }, []);

  const handleSendTest = useCallback(async () => {
    if (!testEmail) { setTestStatus("Enter an email address"); return; }
    setTestSending(true);
    setTestStatus("");
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      const json = await res.json();
      setTestStatus(res.ok ? "Test email sent — check your inbox" : json.error || "Failed to send");
    } catch { setTestStatus("Network error"); }
    setTestSending(false);
  }, [testEmail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-mono text-xs tracking-[2px] text-muted-foreground uppercase">Loading...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb + title */}
      <div className="mb-6">
        <Link
          href="/admin/communications/"
          className="inline-flex items-center gap-1 text-xs font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors no-underline mb-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Communications
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold tracking-[3px] text-foreground uppercase">
              Order Confirmation
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Email sent to customers after a successful purchase with their tickets attached as PDF.
            </p>
          </div>
          <Toggle
            checked={settings.order_confirmation_enabled}
            onChange={(v) => update("order_confirmation_enabled", v)}
            label={settings.order_confirmation_enabled ? "Enabled" : "Disabled"}
          />
        </div>
      </div>

      {/* Connection status */}
      {!resendStatus.loading && !resendStatus.verified && (
        <div className={`rounded-lg border p-4 mb-6 ${
          resendStatus.configured
            ? "border-warning/20 bg-warning/5"
            : "border-destructive/20 bg-destructive/5"
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${resendStatus.configured ? "bg-warning" : "bg-destructive"}`} />
            <span className="font-mono text-xs tracking-wider uppercase" style={{ color: resendStatus.configured ? "#ffc107" : "#ff0033" }}>
              {resendStatus.configured ? "Domain not verified" : "Email not configured"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-4">
            {resendStatus.configured
              ? "Verify your domain in Resend to start sending emails."
              : <>Add <code className="text-foreground">RESEND_API_KEY</code> to your environment variables and redeploy.</>}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 mb-6 border-b border-border">
        {(["settings", "preview"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 font-mono text-xs tracking-wider uppercase transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "text-primary border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            {tab === "settings" ? "Settings" : "Preview"}
          </button>
        ))}
      </div>

      {activeTab === "settings" ? (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          {/* Settings form */}
          <div className="space-y-0">
            <div className="rounded-lg border border-border bg-card p-6">
              {/* Sender Identity */}
              <Section title="Sender Identity">
                <Field label="From Name" value={settings.from_name} onChange={(v) => update("from_name", v)} placeholder="FERAL PRESENTS" />
                <Field label="From Email" type="email" value={settings.from_email} onChange={(v) => update("from_email", v)} placeholder="tickets@feralpresents.com" />
                <Field label="Reply-To Email" type="email" value={settings.reply_to || ""} onChange={(v) => update("reply_to", v || undefined)} placeholder="support@feralpresents.com" hint="Optional — where customer replies go" />
              </Section>

              {/* Branding */}
              <Section title="Branding">
                <div className="mb-3">
                  <label className="block text-xs text-muted-foreground mb-1.5">Accent Color</label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={settings.accent_color}
                      onChange={(e) => update("accent_color", e.target.value)}
                      className="w-10 h-9 border border-border bg-transparent cursor-pointer p-0.5 rounded"
                    />
                    <input
                      value={settings.accent_color}
                      onChange={(e) => update("accent_color", e.target.value)}
                      className="w-28 px-3 py-2.5 bg-background border border-border rounded-md text-sm text-foreground outline-none focus:border-primary font-mono"
                    />
                  </div>
                </div>

                {/* Logo upload */}
                <div className="mb-3">
                  <label className="block text-xs text-muted-foreground mb-1.5">Email Logo</label>
                  {settings.logo_url && (
                    <div className="mb-3">
                      <div className="inline-block bg-[#111] border border-border p-4 rounded">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={settings.logo_url} alt="Logo" className="max-w-[200px] max-h-[60px] block" />
                      </div>
                      <button
                        onClick={() => update("logo_url", undefined)}
                        className="block mt-2 px-3 py-1.5 text-[0.65rem] font-mono tracking-wider uppercase border border-primary text-primary bg-transparent cursor-pointer hover:bg-primary/10 transition-colors rounded"
                      >
                        Remove Logo
                      </button>
                    </div>
                  )}
                  <div
                    className={`border-2 border-dashed p-5 text-center cursor-pointer transition-colors max-w-md rounded ${
                      logoDragging ? "border-primary" : "border-border"
                    }`}
                    onClick={() => logoFileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                    onDragLeave={() => setLogoDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setLogoDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleLogoFile(file);
                    }}
                  >
                    <span className="text-xs text-muted-foreground">
                      {logoProcessing ? "Uploading..." : settings.logo_url
                        ? "Drag & drop to replace, or click to select"
                        : "Drag & drop your logo here, or click to select"}
                    </span>
                    <input
                      ref={logoFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoFile(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>

                <Field label="Footer Text" value={settings.footer_text} onChange={(v) => update("footer_text", v)} placeholder="FERAL PRESENTS" />
              </Section>

              {/* Template */}
              <Section title="Email Template">
                {/* Variable chips */}
                <div className="rounded border border-border/50 bg-background/30 p-3 mb-4">
                  <div className="font-mono text-[0.6rem] tracking-[1.5px] text-muted-foreground/60 uppercase mb-2">
                    Available Variables
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARS.map((v) => (
                      <span
                        key={v.var}
                        title={v.desc}
                        className="font-mono text-xs text-primary bg-primary/5 border border-primary/15 px-2 py-0.5 cursor-help rounded"
                      >
                        {v.var}
                      </span>
                    ))}
                  </div>
                </div>

                <Field label="Subject Line" value={settings.order_confirmation_subject} onChange={(v) => update("order_confirmation_subject", v)} placeholder="Your tickets for {{event_name}}" />
                <Field label="Heading" value={settings.order_confirmation_heading} onChange={(v) => update("order_confirmation_heading", v)} placeholder="You're in." />
                <div className="mb-3">
                  <label className="block text-xs text-muted-foreground mb-1.5">Message</label>
                  <textarea
                    value={settings.order_confirmation_message}
                    onChange={(e) => update("order_confirmation_message", e.target.value)}
                    placeholder="Your order is confirmed and your tickets are attached..."
                    rows={3}
                    className="w-full max-w-lg px-3 py-2.5 bg-background border border-border rounded-md text-sm text-foreground outline-none transition-colors focus:border-primary font-[Inter,sans-serif] resize-y min-h-[80px]"
                  />
                </div>
              </Section>

              {/* Save */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 bg-primary text-primary-foreground font-mono text-xs tracking-wider uppercase rounded-md hover:bg-primary/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
                {status && (
                  <span className={`text-xs font-mono ${status.includes("Error") ? "text-destructive" : "text-success"}`}>
                    {status}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Test email sidebar */}
          <div>
            <div className="rounded-lg border border-border bg-card p-5 sticky top-20">
              <h3 className="font-mono text-[0.65rem] font-bold uppercase tracking-[2px] text-muted-foreground mb-3">
                Send Test Email
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Send a test email with sample data to preview how it looks in a real inbox.
              </p>
              <div className="mb-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => { setTestEmail(e.target.value); setTestStatus(""); }}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-md text-sm text-foreground outline-none transition-colors focus:border-primary font-[Inter,sans-serif]"
                />
              </div>
              <button
                onClick={handleSendTest}
                disabled={testSending || !resendStatus.verified}
                className="w-full px-4 py-2.5 bg-transparent border border-primary text-primary font-mono text-xs tracking-wider uppercase rounded-md hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testSending ? "Sending..." : "Send Test"}
              </button>
              {testStatus && (
                <p className={`text-xs mt-2 font-mono ${testStatus.includes("sent") ? "text-success" : "text-destructive"}`}>
                  {testStatus}
                </p>
              )}
              {!resendStatus.verified && !resendStatus.loading && (
                <p className="text-[0.65rem] text-muted-foreground/60 mt-2">
                  Email provider must be connected to send tests.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Preview tab */
        <EmailPreview settings={settings} />
      )}
    </div>
  );
}
