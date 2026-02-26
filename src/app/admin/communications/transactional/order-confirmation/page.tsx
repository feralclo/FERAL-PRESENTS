"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES, emailKey } from "@/lib/constants";
import { useOrgId } from "@/components/OrgProvider";
import type { EmailSettings } from "@/types/email";
import { DEFAULT_EMAIL_SETTINGS } from "@/types/email";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/ui/color-picker";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChevronLeft,
  AlertTriangle,
  SendHorizonal,
  CheckCircle2,
  ImageIcon,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";

/* ── Logo processing: auto-trim transparent pixels + resize ── */

function trimAndResizeLogo(file: File, maxWidth: number): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const src = document.createElement("canvas");
          const sCtx = src.getContext("2d")!;
          src.width = img.width;
          src.height = img.height;
          sCtx.drawImage(img, 0, 0);

          const pixels = sCtx.getImageData(0, 0, src.width, src.height).data;
          let top = src.height, bottom = 0, left = src.width, right = 0;
          for (let y = 0; y < src.height; y++) {
            for (let x = 0; x < src.width; x++) {
              if (pixels[(y * src.width + x) * 4 + 3] > 10) {
                if (y < top) top = y;
                if (y > bottom) bottom = y;
                if (x < left) left = x;
                if (x > right) right = x;
              }
            }
          }

          if (top > bottom || left > right) {
            top = 0; bottom = src.height - 1;
            left = 0; right = src.width - 1;
          }

          top = Math.max(0, top - 2);
          left = Math.max(0, left - 2);
          bottom = Math.min(src.height - 1, bottom + 2);
          right = Math.min(src.width - 1, right + 2);

          const cropW = right - left + 1;
          const cropH = bottom - top + 1;

          let outW = cropW, outH = cropH;
          if (outW > maxWidth) {
            outH = Math.round((outH * maxWidth) / outW);
            outW = maxWidth;
          }

          const out = document.createElement("canvas");
          out.width = outW;
          out.height = outH;
          out.getContext("2d")!.drawImage(src, left, top, cropW, cropH, 0, 0, outW, outH);
          resolve(out.toDataURL("image/png"));
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
  const result = await trimAndResizeLogo(file, 400);
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
type PreviewMode = "tickets" | "bundle" | "merch_preorder";
function EmailPreview({ settings, showMerch, previewMode = "tickets" }: { settings: EmailSettings; showMerch?: boolean; previewMode?: PreviewMode }) {
  const isMerchPreorder = previewMode === "merch_preorder";
  const showMerchInfo = showMerch || isMerchPreorder;
  const accent = settings.accent_color || "#8B5CF6";
  const logoH = Math.min(settings.logo_height || 48, 100);

  const previewSubject = settings.order_confirmation_subject
    .replace("{{event_name}}", "Summer Festival").replace("{{order_number}}", "DEMO-00042");
  const previewHeading = settings.order_confirmation_heading
    .replace("{{customer_name}}", "Alex").replace("{{event_name}}", "Summer Festival");
  const previewMessage = settings.order_confirmation_message
    .replace("{{customer_name}}", "Alex").replace("{{event_name}}", "Summer Festival")
    .replace("{{venue_name}}", "Invisible Wind Factory").replace("{{event_date}}", "Thursday 27 March 2026")
    .replace("{{order_number}}", "DEMO-00042").replace("{{ticket_count}}", "2");

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="overflow-hidden">
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

        {/* Email body — subtle gradient from card bg into light email bg */}
        <div className="p-6 rounded-b-lg" style={{ background: "linear-gradient(to bottom, #111117 0%, #e8e8ea 8%, #f4f4f5 16%)" }}>
          <div className="mx-auto max-w-[520px] rounded-lg overflow-hidden shadow-lg" style={{ background: "#fff" }}>
            <div style={{ height: 4, backgroundColor: accent }} />
            {/* Header — fixed 120px, logo scales inside, container never changes */}
            <div className="flex items-center justify-center" style={{ height: 120, padding: "0 32px", background: settings.logo_url ? "#08080c" : undefined }}>
              {settings.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logo_url} alt="Logo" style={{ height: logoH, width: "auto", maxWidth: 280, objectFit: "contain" }} />
              ) : (
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#111" }}>
                  {settings.from_name}
                </div>
              )}
            </div>
            {/* Heading — matches actual email HTML: padding 20px top + 8px bottom */}
            <div style={{ padding: "20px 32px 8px", textAlign: "center" }}>
              <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: "#111", letterSpacing: 1, margin: 0 }}>{previewHeading}</h1>
            </div>
            <div className="px-8 pb-6 text-center">
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "#55557a", margin: 0 }}>{previewMessage}</p>
            </div>
            <div className="px-8"><div style={{ height: 1, background: "#eee" }} /></div>
            <div className="px-8 py-5">
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>Event</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "#111", marginBottom: 4 }}>Summer Festival</div>
              <div style={{ fontSize: 14, color: "#6666a0" }}>Thursday 27 March 2026 · Invisible Wind Factory</div>
            </div>
            <div className="px-8"><div style={{ height: 1, background: "#eee" }} /></div>
            <div className="px-8 py-5">
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 12 }}>Order Details</div>
              <div className="flex justify-between" style={{ fontSize: 14, color: "#6666a0", padding: "4px 0" }}><span>Order</span><span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "#111" }}>DEMO-00042</span></div>
              <div className="flex justify-between" style={{ fontSize: 14, color: "#6666a0", padding: "4px 0" }}><span>{isMerchPreorder ? "Items" : "Tickets"}</span><span style={{ color: "#111" }}>{isMerchPreorder ? "1" : "2"}</span></div>
              <div className="flex justify-between" style={{ fontSize: 14, padding: "4px 0", borderTop: "1px solid #eee", marginTop: 4, paddingTop: 8 }}><span style={{ color: "#6666a0" }}>Total</span><span style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: "#111" }}>£52.92</span></div>
            </div>
            <div className="px-8"><div style={{ height: 1, background: "#eee" }} /></div>
            <div className="px-8 pt-5 pb-2">
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>{isMerchPreorder ? "Your Collection QR Codes" : "Your Tickets"}</div>
              <div style={{ fontSize: 13, color: "#8888a0", marginBottom: 16 }}>{isMerchPreorder ? "Your QR codes for collecting your merch are attached to this email as a PDF." : "Your PDF tickets with QR codes are attached to this email."}</div>
            </div>
            <div className="px-8 pb-6">
              <div style={{ background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0" }}>
                {isMerchPreorder ? (
                  /* Merch pre-order: show merch item with QR */
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ fontSize: 13, color: "#6666a0" }}>Event Tee</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, letterSpacing: 1, color: accent }}>DEMO-A1B2C3D4</div>
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #e8e8e8" }}>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: accent, marginBottom: 2 }}>MERCH PRE-ORDER</div>
                      <div style={{ fontSize: 12, color: "#6666a0" }}>Event Tee · Size M</div>
                    </div>
                  </div>
                ) : (
                  /* Regular tickets (with optional bundle merch) */
                  <>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ fontSize: 13, color: "#6666a0" }}>{showMerchInfo ? "GA + Tee" : "General Release"}</div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, letterSpacing: 1, color: accent }}>DEMO-A1B2C3D4</div>
                      {showMerchInfo && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #e8e8e8" }}>
                          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: accent, marginBottom: 2 }}>INCLUDES MERCH</div>
                          <div style={{ fontSize: 12, color: "#6666a0" }}>Event Tee · Size M</div>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "12px 16px" }}>
                      <div style={{ fontSize: 13, color: "#6666a0" }}>General Release</div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, letterSpacing: 1, color: accent }}>DEMO-E5F6G7H8</div>
                    </div>
                  </>
                )}
              </div>
            </div>
            {isMerchPreorder && (
              <div className="px-8 pb-6">
                <div style={{ fontSize: 12, lineHeight: 1.5, color: "#8888a0", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0", padding: "12px 16px" }}>
                  <strong style={{ color: "#6666a0" }}>How to collect your merch</strong> — Present your QR code at the merch stand at the event. This is a merch pre-order only — you will need a separate event ticket to attend.
                </div>
              </div>
            )}
            {!isMerchPreorder && showMerchInfo && (
              <div className="px-8 pb-6">
                <div style={{ fontSize: 12, lineHeight: 1.5, color: "#8888a0", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0", padding: "12px 16px" }}>
                  <strong style={{ color: "#6666a0" }}>Merch collection</strong> — Your ticket includes merch. Present the same QR code at the merch stand to collect your items.
                </div>
              </div>
            )}
            <div style={{ padding: "20px 32px", background: "#fafafa", borderTop: "1px solid #f0f0f0", textAlign: "center" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", marginBottom: 4 }}>{settings.footer_text || settings.from_name}</div>
              <div style={{ fontSize: 11, color: "#bbb" }}>This is an automated order confirmation. Please do not reply directly to this email.</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════ */

export default function OrderConfirmationPage() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const logoFileRef = useRef<HTMLInputElement>(null);
  const autoTrimDoneRef = useRef(false);
  const [displayLogoUrl, setDisplayLogoUrl] = useState<string | null>(null);
  const [logoDragging, setLogoDragging] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("tickets");
  const previewMerch = previewMode === "bundle";
  const [resendStatus, setResendStatus] = useState<{ configured: boolean; verified: boolean; loading: boolean }>({ configured: false, verified: false, loading: true });
  const [globalLogoUrl, setGlobalLogoUrl] = useState<string | null>(null);
  const [logoOverride, setLogoOverride] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) { setLoading(false); return; }
        const { data } = await supabase.from(TABLES.SITE_SETTINGS).select("data").eq("key", emailKey(orgId)).single();
        if (data?.data && typeof data.data === "object") {
          const emailData = data.data as Partial<EmailSettings> & { logo_override?: boolean };
          setSettings((prev) => ({ ...prev, ...emailData }));
          if (emailData.logo_override) setLogoOverride(true);
        }
      } catch { /* defaults are fine */ }
      // Fetch global branding logo
      try {
        const brandingRes = await fetch("/api/branding");
        if (brandingRes.ok) {
          const { data: branding } = await brandingRes.json();
          if (branding?.logo_url) setGlobalLogoUrl(branding.logo_url);
        }
      } catch { /* branding not available */ }
      setLoading(false);
    })();
    fetch("/api/email/status").then((r) => r.json()).then((json) => setResendStatus({ ...json, loading: false })).catch(() => setResendStatus({ configured: false, verified: false, loading: false }));
  }, []);

  // Display-time trim: always show the logo with transparent padding removed.
  // Also re-uploads the trimmed version once so the stored image is clean.
  useEffect(() => {
    const url = settings.logo_url;
    if (!url) { setDisplayLogoUrl(null); return; }

    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d")!;
        c.width = img.width; c.height = img.height;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let t = c.height, b = 0, l = c.width, r = 0;
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++)
            if (d[(y * c.width + x) * 4 + 3] > 10) {
              if (y < t) t = y; if (y > b) b = y;
              if (x < l) l = x; if (x > r) r = x;
            }
        if (t > b || l > r) {
          setDisplayLogoUrl(url);
          // Backfill aspect ratio for logos uploaded before this field existed
          if (!settings.logo_aspect_ratio) setSettings(prev => prev.logo_aspect_ratio ? prev : { ...prev, logo_aspect_ratio: img.width / img.height });
          return;
        }

        const needsTrim = t > 4 || l > 4 || (c.width - r - 1) > 4 || (c.height - b - 1) > 4;
        if (!needsTrim) {
          setDisplayLogoUrl(url);
          if (!settings.logo_aspect_ratio) setSettings(prev => prev.logo_aspect_ratio ? prev : { ...prev, logo_aspect_ratio: img.width / img.height });
          return;
        }

        t = Math.max(0, t - 2); l = Math.max(0, l - 2);
        b = Math.min(c.height - 1, b + 2); r = Math.min(c.width - 1, r + 2);
        const cW = r - l + 1, cH = b - t + 1;
        let oW = cW, oH = cH;
        if (oW > 400) { oH = Math.round((oH * 400) / oW); oW = 400; }
        const out = document.createElement("canvas");
        out.width = oW; out.height = oH;
        out.getContext("2d")!.drawImage(c, l, t, cW, cH, 0, 0, oW, oH);
        const trimmedDataUrl = out.toDataURL("image/png");

        // Instantly show the trimmed version in the preview
        setDisplayLogoUrl(trimmedDataUrl);

        // Backfill aspect ratio from trimmed dimensions
        if (!settings.logo_aspect_ratio) setSettings(prev => prev.logo_aspect_ratio ? prev : { ...prev, logo_aspect_ratio: oW / oH });

        // Also re-upload the trimmed version to fix the stored image (one-time)
        if (!autoTrimDoneRef.current) {
          autoTrimDoneRef.current = true;
          fetch("/api/upload", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageData: trimmedDataUrl, key: "email-logo" }),
          }).then(r => r.json()).then(json => {
            if (json.url) setSettings(prev => ({ ...prev, logo_url: json.url }));
          }).catch(() => {});
        }
      } catch { setDisplayLogoUrl(url); }
    };
    img.onerror = () => setDisplayLogoUrl(url);
    img.src = url;
  }, [settings.logo_url]);

  const update = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => { setSettings((prev) => ({ ...prev, [key]: value })); setStatus(""); };

  const handleSave = useCallback(async () => {
    setSaving(true); setStatus("");
    try {
      const supabase = getSupabaseClient();
      if (!supabase) { setStatus("Error: Database not configured"); setSaving(false); return; }
      const dataToSave = {
        ...settings,
        logo_override: logoOverride,
        // When override is OFF, clear the email-specific logo so it falls back to branding
        ...(!logoOverride ? { logo_url: undefined } : {}),
      };
      const { error } = await supabase.from(TABLES.SITE_SETTINGS).upsert({ key: emailKey(orgId), data: dataToSave, updated_at: new Date().toISOString() }, { onConflict: "key" });
      setStatus(error ? `Error: ${error.message}` : "Settings saved");
    } catch { setStatus("Error: Failed to save"); }
    setSaving(false);
  }, [settings, logoOverride]);

  const handleLogoFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setLogoProcessing(true);
    const compressed = await processLogoFile(file);
    if (!compressed) { setLogoProcessing(false); return; }
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageData: compressed, key: "email-logo" }) });
      const json = await res.json();
      if (res.ok && json.url) {
        // Measure the processed image to store its aspect ratio for exact email sizing
        const aspectImg = new Image();
        aspectImg.onload = () => {
          const ratio = aspectImg.width / aspectImg.height;
          setSettings(prev => ({ ...prev, logo_url: json.url, logo_aspect_ratio: ratio }));
          setStatus("");
        };
        aspectImg.onerror = () => update("logo_url", json.url);
        aspectImg.src = compressed;
      }
    } catch { /* upload failed */ }
    setLogoProcessing(false);
  }, []);

  const handleSendTest = useCallback(async () => {
    if (!testEmail) { setTestStatus("Enter an email address"); return; }
    setTestSending(true); setTestStatus("");
    try {
      const res = await fetch("/api/email/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testEmail, includeMerch: previewMerch, orderType: previewMode === "merch_preorder" ? "merch_preorder" : undefined }) });
      const json = await res.json();
      setTestStatus(res.ok ? "Test email sent — check your inbox" : json.error || "Failed to send");
    } catch { setTestStatus("Network error"); }
    setTestSending(false);
  }, [testEmail, previewMerch, previewMode]);

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
        <div className="flex items-center justify-between border-b border-border mb-6">
          <TabsList variant="line">
            <TabsTrigger value="settings" className="text-sm">Settings</TabsTrigger>
            <TabsTrigger value="preview" className="text-sm">Preview</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 pb-1">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            {status && (
              <span className={`text-xs font-medium flex items-center gap-1 ${status.includes("Error") ? "text-destructive" : "text-success"}`}>
                {!status.includes("Error") && <CheckCircle2 size={12} />}
                {status}
              </span>
            )}
          </div>
        </div>

        <TabsContent value="settings">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
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
                    <Input value={settings.from_name} onChange={(e) => update("from_name", e.target.value)} placeholder="Your Brand Name" className="max-w-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>From Email</Label>
                    <Input type="email" value={settings.from_email} onChange={(e) => update("from_email", e.target.value)} placeholder="tickets@entry.events" className="max-w-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>Reply-To Email</Label>
                    <Input type="email" value={settings.reply_to || ""} onChange={(e) => update("reply_to", e.target.value || undefined)} placeholder="support@entry.events" className="max-w-sm" />
                    <p className="text-[11px] text-muted-foreground">Where customer replies go</p>
                  </div>
                </CardContent>
              </Card>

              {/* Branding */}
              <Card>
                <CardHeader>
                  <CardTitle>Branding</CardTitle>
                  <CardDescription>Customise the visual identity of your emails</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Accent Color</Label>
                    <ColorPicker value={settings.accent_color} onChange={(v) => update("accent_color", v)} />
                  </div>

                  <Separator />

                  {/* Email Logo — global branding default + override */}
                  <div className="space-y-3">
                    <Label>Email Logo</Label>

                    {/* Global branding logo (default) */}
                    {!logoOverride && (
                      <div className="space-y-3">
                        {globalLogoUrl ? (
                          <div className="inline-block rounded-lg border border-border bg-[#08080c] p-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={globalLogoUrl}
                              alt="Global logo"
                              style={{ height: 40, width: "auto", maxWidth: 200, objectFit: "contain" }}
                            />
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-4 max-w-xs">
                            <p className="text-xs text-muted-foreground">No global logo configured</p>
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Using global logo from{" "}
                          <Link href="/admin/settings/branding/" className="text-primary hover:underline inline-flex items-center gap-1">
                            Brand Settings <ExternalLink size={10} />
                          </Link>
                        </p>
                      </div>
                    )}

                    {/* Override toggle */}
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <Switch checked={logoOverride} onCheckedChange={(v) => { setLogoOverride(v); setStatus(""); }} />
                      <div>
                        <Label className="text-xs cursor-pointer" onClick={() => { setLogoOverride(v => !v); setStatus(""); }}>
                          Use custom logo for this email
                        </Label>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Override the global branding logo for order confirmations only
                        </p>
                      </div>
                    </div>

                    {/* Custom logo upload — only shown when override is ON */}
                    {logoOverride && (
                      <div className="space-y-3 pl-1">
                        {settings.logo_url ? (
                          <div
                            className="group relative inline-block cursor-pointer rounded-lg border border-border bg-[#08080c] p-4"
                            onClick={() => logoFileRef.current?.click()}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={displayLogoUrl || settings.logo_url}
                              alt="Logo"
                              style={{ height: 40, width: "auto", maxWidth: 200, objectFit: "contain" }}
                            />
                            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); logoFileRef.current?.click(); }}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); update("logo_url", undefined); }}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-red-500/30 hover:text-red-400"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                            <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoFile(file); e.target.value = ""; }} />
                          </div>
                        ) : (
                          <div
                            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all max-w-xs ${
                              logoDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                            }`}
                            onClick={() => logoFileRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                            onDragLeave={() => setLogoDragging(false)}
                            onDrop={(e) => { e.preventDefault(); setLogoDragging(false); const file = e.dataTransfer.files[0]; if (file) handleLogoFile(file); }}
                          >
                            <ImageIcon size={16} className="mx-auto mb-1.5 text-muted-foreground/50" />
                            <p className="text-xs text-muted-foreground">{logoProcessing ? "Processing..." : "Drop image or click to upload"}</p>
                            <p className="text-[10px] text-muted-foreground/40 mt-0.5">PNG, JPG or WebP</p>
                            <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoFile(file); e.target.value = ""; }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Logo Size slider — only show when override is on and a logo is set */}
                  {logoOverride && settings.logo_url && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <Label>Logo Size</Label>
                        <Slider
                          min={20}
                          max={100}
                          step={2}
                          value={[Math.min(settings.logo_height || 48, 100)]}
                          onValueChange={([v]) => update("logo_height", v)}
                        />
                        <div className="flex justify-between">
                          <span className="text-[10px] text-muted-foreground">Small</span>
                          <span className="text-[10px] text-muted-foreground">Large</span>
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <Label>Footer Text</Label>
                    <Input value={settings.footer_text} onChange={(e) => update("footer_text", e.target.value)} placeholder="Your Brand Name" className="max-w-sm" />
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
            </div>

            {/* Right — test email */}
            <div>
              <Card className="sticky top-20">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <SendHorizonal size={14} className="text-primary" />
                    <CardTitle className="text-xs">Send Test Email</CardTitle>
                  </div>
                  <CardDescription>Preview in a real inbox with sample data and PDF ticket attachment</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={(e) => { setTestEmail(e.target.value); setTestStatus(""); }}
                    placeholder="your@email.com"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Preview as:</span>
                    {(["tickets", "bundle", "merch_preorder"] as PreviewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPreviewMode(mode)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                          previewMode === mode
                            ? "bg-primary/10 text-primary border border-primary/30"
                            : "text-muted-foreground border border-border hover:border-primary/20"
                        }`}
                      >
                        {mode === "tickets" ? "Tickets Only" : mode === "bundle" ? "Ticket + Merch" : "Merch Pre-order"}
                      </button>
                    ))}
                  </div>
                  <Button onClick={handleSendTest} disabled={testSending || !resendStatus.verified} className="w-full">
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
          <div className="flex flex-col items-center gap-4">
            <EmailPreview settings={logoOverride ? settings : { ...settings, logo_url: globalLogoUrl || settings.logo_url }} showMerch={previewMerch} previewMode={previewMode} />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Preview as:</span>
              {(["tickets", "bundle", "merch_preorder"] as PreviewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPreviewMode(mode)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                    previewMode === mode
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground border border-border hover:border-primary/20"
                  }`}
                >
                  {mode === "tickets" ? "Tickets Only" : mode === "bundle" ? "Ticket + Merch" : "Merch Pre-order"}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
