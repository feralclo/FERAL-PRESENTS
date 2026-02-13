"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChevronLeft,
  Upload,
  X as XIcon,
  AlertTriangle,
  SendHorizonal,
  CheckCircle2,
} from "lucide-react";

/* ── Logo image compression ── */

function compressLogoImage(file: File, maxWidth: number, quality: number): Promise<string | null> {
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
          if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/png", quality));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function processLogoFile(file: File): Promise<string | null> {
  if (file.size > 5 * 1024 * 1024) { alert("Image too large. Maximum is 5MB."); return null; }
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

/* ── Email preview ── */
function EmailPreview({ settings }: { settings: EmailSettings }) {
  const accent = settings.accent_color || "#ff0033";
  const previewSubject = settings.order_confirmation_subject
    .replace("{{event_name}}", "FERAL Liverpool").replace("{{order_number}}", "FERAL-00042");
  const previewHeading = settings.order_confirmation_heading
    .replace("{{customer_name}}", "Alex").replace("{{event_name}}", "FERAL Liverpool");
  const previewMessage = settings.order_confirmation_message
    .replace("{{customer_name}}", "Alex").replace("{{event_name}}", "FERAL Liverpool")
    .replace("{{venue_name}}", "Invisible Wind Factory").replace("{{event_date}}", "Thursday 27 March 2026")
    .replace("{{order_number}}", "FERAL-00042").replace("{{ticket_count}}", "2");

  return (
    <Card className="overflow-hidden">
      {/* Email client chrome */}
      <div className="px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider w-14">From</span>
            <span className="text-xs text-foreground">{settings.from_name} &lt;{settings.from_email}&gt;</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider w-14">Subject</span>
            <span className="text-xs text-foreground font-medium">{previewSubject}</span>
          </div>
        </div>
      </div>

      {/* Email body */}
      <div className="p-6" style={{ background: "#f4f4f5" }}>
        <div className="mx-auto max-w-[520px] rounded-lg overflow-hidden shadow-md" style={{ background: "#fff" }}>
          <div style={{ height: 4, backgroundColor: accent }} />
          <div className={`py-6 px-8 text-center ${settings.logo_url ? "" : ""}`} style={{ background: settings.logo_url ? "#0e0e0e" : undefined }}>
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="Logo" style={{ height: 36, display: "inline-block" }} />
            ) : (
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#111" }}>
                {settings.from_name}
              </div>
            )}
          </div>
          <div className="px-8 pt-0 pb-2 text-center">
            <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: "#111", letterSpacing: 1, margin: 0 }}>{previewHeading}</h1>
          </div>
          <div className="px-8 pb-6 text-center">
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#555", margin: 0 }}>{previewMessage}</p>
          </div>
          <div className="px-8"><div style={{ height: 1, background: "#eee" }} /></div>
          <div className="px-8 py-5">
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>Event</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#111", marginBottom: 4 }}>FERAL Liverpool</div>
            <div style={{ fontSize: 14, color: "#666" }}>Thursday 27 March 2026 · Invisible Wind Factory</div>
          </div>
          <div className="px-8"><div style={{ height: 1, background: "#eee" }} /></div>
          <div className="px-8 py-5">
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 12 }}>Order Details</div>
            <div className="flex justify-between" style={{ fontSize: 14, color: "#666", padding: "4px 0" }}><span>Order</span><span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "#111" }}>FERAL-00042</span></div>
            <div className="flex justify-between" style={{ fontSize: 14, color: "#666", padding: "4px 0" }}><span>Tickets</span><span style={{ color: "#111" }}>2</span></div>
            <div className="flex justify-between" style={{ fontSize: 14, padding: "4px 0", borderTop: "1px solid #eee", marginTop: 4, paddingTop: 8 }}><span style={{ color: "#666" }}>Total</span><span style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: "#111" }}>£52.92</span></div>
          </div>
          <div className="px-8"><div style={{ height: 1, background: "#eee" }} /></div>
          <div className="px-8 pt-5 pb-2">
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>Your Tickets</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Your PDF tickets with QR codes are attached to this email.</div>
          </div>
          <div className="px-8 pb-6">
            <div style={{ background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 13, color: "#666" }}>General Release</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, letterSpacing: 1, color: accent }}>FERAL-A1B2C3D4</div>
              </div>
              <div style={{ padding: "12px 16px" }}>
                <div style={{ fontSize: 13, color: "#666" }}>General Release</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, letterSpacing: 1, color: accent }}>FERAL-E5F6G7H8</div>
              </div>
            </div>
          </div>
          <div style={{ padding: "20px 32px", background: "#fafafa", borderTop: "1px solid #f0f0f0", textAlign: "center" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", marginBottom: 4 }}>{settings.footer_text || settings.from_name}</div>
            <div style={{ fontSize: 11, color: "#bbb" }}>This is an automated order confirmation. Please do not reply directly to this email.</div>
          </div>
        </div>
      </div>
    </Card>
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
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoDragging, setLogoDragging] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [resendStatus, setResendStatus] = useState<{ configured: boolean; verified: boolean; loading: boolean }>({ configured: false, verified: false, loading: true });

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) { setLoading(false); return; }
        const { data } = await supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", "feral_email").single();
        if (data?.data && typeof data.data === "object") setSettings((prev) => ({ ...prev, ...(data.data as Partial<EmailSettings>) }));
      } catch { /* defaults are fine */ }
      setLoading(false);
    })();
    fetch("/api/email/status").then((r) => r.json()).then((json) => setResendStatus({ ...json, loading: false })).catch(() => setResendStatus({ configured: false, verified: false, loading: false }));
  }, []);

  const update = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => { setSettings((prev) => ({ ...prev, [key]: value })); setStatus(""); };

  const handleSave = useCallback(async () => {
    setSaving(true); setStatus("");
    try {
      const supabase = getSupabaseClient();
      if (!supabase) { setStatus("Error: Database not configured"); setSaving(false); return; }
      const { error } = await supabase.from(TABLES.SITE_SETTINGS).upsert({ key: "feral_email", data: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
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
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageData: compressed, key: "email-logo" }) });
      const json = await res.json();
      if (res.ok && json.url) update("logo_url", json.url);
    } catch { /* upload failed */ }
    setLogoProcessing(false);
  }, []);

  const handleSendTest = useCallback(async () => {
    if (!testEmail) { setTestStatus("Enter an email address"); return; }
    setTestSending(true); setTestStatus("");
    try {
      const res = await fetch("/api/email/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testEmail }) });
      const json = await res.json();
      setTestStatus(res.ok ? "Test email sent — check your inbox" : json.error || "Failed to send");
    } catch { setTestStatus("Network error"); }
    setTestSending(false);
  }, [testEmail]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="font-mono text-xs tracking-[2px] text-muted-foreground uppercase">Loading...</span>
    </div>
  );

  return (
    <div>
      {/* Breadcrumb + title + switch */}
      <div className="mb-8">
        <Link href="/admin/communications/" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground">
          <ChevronLeft size={14} />
          Communications
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-mono text-sm font-semibold tracking-[2px] text-foreground uppercase">Order Confirmation</h1>
            <p className="mt-1 text-sm text-muted-foreground">Email sent after a successful purchase with PDF tickets attached.</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Badge variant={settings.order_confirmation_enabled ? "success" : "secondary"} className="text-[10px] font-semibold">
              {settings.order_confirmation_enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Switch
              checked={settings.order_confirmation_enabled}
              onCheckedChange={(v) => update("order_confirmation_enabled", v)}
            />
          </div>
        </div>
      </div>

      {/* Connection warning */}
      {!resendStatus.loading && !resendStatus.verified && (
        <Card className="mb-6 border-warning/20 bg-warning/5">
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {resendStatus.configured ? "Domain not verified" : "Email not configured"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {resendStatus.configured
                  ? "Verify your domain in Resend to start sending emails."
                  : <>Add <code className="text-foreground bg-muted px-1 py-0.5 rounded text-xs">RESEND_API_KEY</code> to environment variables and redeploy.</>}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="settings">
        <TabsList className="mb-6">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
            {/* Left — form */}
            <div className="space-y-6">
              {/* Sender Identity */}
              <Card>
                <CardHeader>
                  <CardTitle>Sender Identity</CardTitle>
                  <CardDescription>How your emails appear in customer inboxes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>From Name</Label>
                    <Input value={settings.from_name} onChange={(e) => update("from_name", e.target.value)} placeholder="FERAL PRESENTS" className="max-w-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>From Email</Label>
                    <Input type="email" value={settings.from_email} onChange={(e) => update("from_email", e.target.value)} placeholder="tickets@feralpresents.com" className="max-w-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>Reply-To Email</Label>
                    <Input type="email" value={settings.reply_to || ""} onChange={(e) => update("reply_to", e.target.value || undefined)} placeholder="support@feralpresents.com" className="max-w-sm" />
                    <p className="text-[11px] text-muted-foreground">Optional — where customer replies go</p>
                  </div>
                </CardContent>
              </Card>

              {/* Branding */}
              <Card>
                <CardHeader>
                  <CardTitle>Branding</CardTitle>
                  <CardDescription>Customise the visual identity of your emails</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Accent Color</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={settings.accent_color}
                        onChange={(e) => update("accent_color", e.target.value)}
                        className="w-9 h-9 rounded-lg border border-input bg-transparent cursor-pointer p-0.5"
                      />
                      <Input value={settings.accent_color} onChange={(e) => update("accent_color", e.target.value)} className="w-28 font-mono" />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Email Logo</Label>
                    {settings.logo_url && (
                      <div className="mb-2">
                        <div className="inline-block bg-muted border border-border p-4 rounded-lg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={settings.logo_url} alt="Logo" style={{ maxWidth: 200, maxHeight: 60, display: "block" }} />
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => update("logo_url", undefined)} className="mt-2 text-destructive hover:text-destructive">
                          <XIcon size={14} />
                          Remove
                        </Button>
                      </div>
                    )}
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all max-w-md ${
                        logoDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                      }`}
                      onClick={() => logoFileRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                      onDragLeave={() => setLogoDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setLogoDragging(false); const file = e.dataTransfer.files[0]; if (file) handleLogoFile(file); }}
                    >
                      <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        {logoProcessing ? "Uploading..." : "Drag & drop or click to upload"}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">PNG, JPG or WebP · Max 5MB</p>
                      <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoFile(file); e.target.value = ""; }} />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Footer Text</Label>
                    <Input value={settings.footer_text} onChange={(e) => update("footer_text", e.target.value)} placeholder="FERAL PRESENTS" className="max-w-sm" />
                  </div>
                </CardContent>
              </Card>

              {/* Template */}
              <Card>
                <CardHeader>
                  <CardTitle>Email Template</CardTitle>
                  <CardDescription>Customise the content of the order confirmation email</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Variable chips */}
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Available Variables</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARS.map((v) => (
                        <code key={v.var} title={v.desc} className="text-[11px] text-primary bg-primary/5 border border-primary/10 px-2 py-0.5 rounded-md cursor-help font-mono">{v.var}</code>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Subject Line</Label>
                    <Input value={settings.order_confirmation_subject} onChange={(e) => update("order_confirmation_subject", e.target.value)} placeholder="Your tickets for {{event_name}}" className="max-w-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label>Heading</Label>
                    <Input value={settings.order_confirmation_heading} onChange={(e) => update("order_confirmation_heading", e.target.value)} placeholder="You're in." className="max-w-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea
                      value={settings.order_confirmation_message}
                      onChange={(e) => update("order_confirmation_message", e.target.value)}
                      placeholder="Your order is confirmed and your tickets are attached..."
                      rows={3}
                      className="max-w-lg"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Save bar */}
              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
                {status && (
                  <span className={`text-xs font-medium flex items-center gap-1.5 ${status.includes("Error") ? "text-destructive" : "text-success"}`}>
                    {!status.includes("Error") && <CheckCircle2 size={14} />}
                    {status}
                  </span>
                )}
              </div>
            </div>

            {/* Right — test email */}
            <div>
              <Card className="sticky top-20">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <SendHorizonal size={14} className="text-primary" />
                    <CardTitle className="text-xs">Send Test Email</CardTitle>
                  </div>
                  <CardDescription>Send a test with sample data to preview in a real inbox</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={(e) => { setTestEmail(e.target.value); setTestStatus(""); }}
                    placeholder="your@email.com"
                  />
                  <Button variant="outline" onClick={handleSendTest} disabled={testSending || !resendStatus.verified} className="w-full">
                    {testSending ? "Sending..." : "Send Test"}
                  </Button>
                  {testStatus && (
                    <p className={`text-xs font-medium ${testStatus.includes("sent") ? "text-success" : "text-destructive"}`}>{testStatus}</p>
                  )}
                  {!resendStatus.verified && !resendStatus.loading && (
                    <p className="text-[11px] text-muted-foreground">Email provider must be connected to send tests.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <EmailPreview settings={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
