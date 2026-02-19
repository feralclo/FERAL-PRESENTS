"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { saveSettings } from "@/lib/settings";
import {
  ChevronLeft,
  ShoppingCart,
  Clock,
  MailWarning,
  TrendingUp,
  DollarSign,
  ExternalLink,
  Send,
  Flame,
  Zap,
  PartyPopper,
  Power,
  Timer,
  Mail,
  Percent,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Plus,
  Loader2,
  CheckCircle2,
  Monitor,
  Smartphone,
  ImageIcon,
  Pencil,
  Trash2,
  Palette,
} from "lucide-react";

/* ── Types ── */
interface AbandonedCartStats {
  total: number;
  abandoned: number;
  recovered: number;
  total_value: number;
  recovered_value: number;
}

interface EmailStep {
  id: string;
  label: string;
  description: string;
  delay_label: string;
  delay_minutes: number;
  enabled: boolean;
  subject: string;
  preview_text: string;
  greeting: string;
  body_message: string;
  cta_text: string;
  include_discount: boolean;
  discount_code: string;
  discount_percent: number;
  discount_label: string;
  icon: typeof Send;
  color: string;
  glowColor: string;
}

interface AutomationSettings {
  enabled: boolean;
  steps: EmailStep[];
}

interface EmailBrandingState {
  logo_url: string;
  logo_height: number;
  logo_aspect_ratio?: number;
  accent_color: string;
  from_name: string;
}

/* ── Defaults ── */
const DEFAULT_STEPS: EmailStep[] = [
  {
    id: "email_1",
    label: "Gentle Nudge",
    description: "A friendly reminder about their abandoned cart",
    delay_label: "30 minutes",
    delay_minutes: 30,
    enabled: true,
    subject: "You left something behind...",
    preview_text: "Your tickets are still waiting for you",
    greeting: "Your order is on hold",
    body_message: "We\u2019re holding your spot \u2014 but not forever. Complete your order before availability changes.",
    cta_text: "Complete Your Order",
    include_discount: false,
    discount_code: "",
    discount_percent: 0,
    discount_label: "Your exclusive offer",
    icon: Send,
    color: "#8B5CF6",
    glowColor: "rgba(139,92,246,0.3)",
  },
  {
    id: "email_2",
    label: "Urgency Boost",
    description: "Create urgency with scarcity messaging",
    delay_label: "24 hours",
    delay_minutes: 1440,
    enabled: true,
    subject: "Tickets selling fast \u2014 don\u2019t miss out",
    preview_text: "Your tickets are still available, but not for long",
    greeting: "Tickets are going fast",
    body_message: "The event you were looking at is selling quickly. Don\u2019t let someone else take your spot.",
    cta_text: "Complete Your Order",
    include_discount: false,
    discount_code: "",
    discount_percent: 0,
    discount_label: "Your exclusive offer",
    icon: Zap,
    color: "#f97316",
    glowColor: "rgba(249,115,22,0.3)",
  },
  {
    id: "email_3",
    label: "Final Chance",
    description: "Last attempt with an optional discount incentive",
    delay_label: "48 hours",
    delay_minutes: 2880,
    enabled: true,
    subject: "Last chance \u2014 your order expires soon",
    preview_text: "This is your final reminder before your order expires",
    greeting: "This is your last chance",
    body_message: "Your order is about to expire. We\u2019ve saved a special offer just for you \u2014 use it before it\u2019s gone.",
    cta_text: "Complete Your Order",
    include_discount: true,
    discount_code: "COMEBACK10",
    discount_percent: 10,
    discount_label: "Your exclusive offer",
    icon: Flame,
    color: "#ef4444",
    glowColor: "rgba(239,68,68,0.3)",
  },
];

const DEFAULT_SETTINGS: AutomationSettings = {
  enabled: false,
  steps: DEFAULT_STEPS,
};

const SETTINGS_KEY = "feral_abandoned_cart_automation";

/* ── Save Toast — floating notification ── */
function SaveToast({ saving, status }: { saving: boolean; status: "idle" | "saved" | "error" }) {
  const [visible, setVisible] = useState(false);
  const [displayState, setDisplayState] = useState<"saving" | "saved" | "error">("saving");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saving) {
      setDisplayState("saving");
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    }
  }, [saving]);

  useEffect(() => {
    if (status === "saved") {
      setDisplayState("saved");
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 2200);
    } else if (status === "error") {
      setDisplayState("error");
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 4000);
    }
  }, [status]);

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-0 right-0 z-50 flex justify-center"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)", transition: "opacity 0.25s ease, transform 0.25s ease" }}
    >
      <div
        className="pointer-events-auto flex items-center gap-2.5 rounded-full border px-5 py-2.5"
        style={{
          backgroundColor: displayState === "saving"
            ? "rgba(17,17,23,0.95)"
            : displayState === "saved"
            ? "rgba(17,17,23,0.95)"
            : "rgba(17,17,23,0.95)",
          borderColor: displayState === "saving"
            ? "rgba(139,92,246,0.25)"
            : displayState === "saved"
            ? "rgba(16,185,129,0.25)"
            : "rgba(239,68,68,0.25)",
          boxShadow: displayState === "saving"
            ? "0 4px 24px rgba(139,92,246,0.15)"
            : displayState === "saved"
            ? "0 4px 24px rgba(16,185,129,0.15)"
            : "0 4px 24px rgba(239,68,68,0.15)",
          backdropFilter: "blur(12px)",
        }}
      >
        {displayState === "saving" ? (
          <>
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <span className="text-[12px] font-medium text-white/70">Saving changes...</span>
          </>
        ) : displayState === "saved" ? (
          <>
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-[12px] font-medium text-white/70">Update saved</span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} className="text-red-400" />
            <span className="text-[12px] font-medium text-white/70">Save failed</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */
function formatCurrency(amount: number) {
  return `£${Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

/* ═══════════════════════════════════════════════════════════
   MASTER TOGGLE — big glowing power switch
   ═══════════════════════════════════════════════════════════ */
function MasterToggle({
  enabled,
  onToggle,
  stats,
}: {
  enabled: boolean;
  onToggle: (val: boolean) => void;
  stats: AbandonedCartStats | null;
}) {
  const potentialRevenue = stats ? stats.total_value - stats.recovered_value : 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl border p-6 transition-all duration-500"
      style={{
        borderColor: enabled ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.15)",
        background: enabled
          ? "linear-gradient(135deg, rgba(16,185,129,0.06), rgba(52,211,153,0.03))"
          : "linear-gradient(135deg, rgba(239,68,68,0.04), rgba(245,158,11,0.02))",
        boxShadow: enabled ? "0 0 30px rgba(16,185,129,0.08)" : "none",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full transition-all duration-500"
              style={{
                backgroundColor: enabled ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.08)",
                boxShadow: enabled
                  ? "0 0 20px rgba(16,185,129,0.25), inset 0 0 0 2px rgba(16,185,129,0.3)"
                  : "inset 0 0 0 2px rgba(255,255,255,0.06)",
              }}
            >
              <Power
                size={20}
                style={{ color: enabled ? "#10b981" : "#71717a" }}
                className="transition-colors duration-300"
              />
            </div>
            {enabled && (
              <span
                className="absolute inset-0 animate-ping rounded-full opacity-15"
                style={{ backgroundColor: "#10b981" }}
              />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                Email Automation
              </h2>
              <Badge
                variant={enabled ? "success" : "destructive"}
                className="text-[9px] font-bold uppercase"
              >
                {enabled ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {enabled
                ? "Recovery emails are being sent automatically"
                : potentialRevenue > 0
                  ? `Turn on to start recovering ${formatCurrency(potentialRevenue)} in lost revenue`
                  : "Turn on to start recovering abandoned carts automatically"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {enabled ? "On" : "Off"}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
          />
        </div>
      </div>

      {enabled && (
        <>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-500/5" />
          <div className="absolute -bottom-2 -right-8 h-16 w-16 rounded-full bg-emerald-500/3" />
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   RECOVERY FLOW — horizontal sequence of email steps
   ═══════════════════════════════════════════════════════════ */
function RecoveryFlow({
  steps,
  automationEnabled,
  onToggleStep,
  activeStepId,
  onSelectStep,
}: {
  steps: EmailStep[];
  automationEnabled: boolean;
  onToggleStep: (id: string) => void;
  activeStepId: string | null;
  onSelectStep: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Select an email to edit
        </h3>
        <span className="text-[10px] text-muted-foreground/50">
          {steps.filter((s) => s.enabled).length} of {steps.length} emails active
        </span>
      </div>
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {steps.map((step, i) => {
          const isSelected = activeStepId === step.id;
          const stepActive = step.enabled && automationEnabled;
          const StepIcon = step.icon;

          return (
            <React.Fragment key={step.id}>
            <button
              type="button"
              onClick={() => onSelectStep(step.id)}
              className={`group relative cursor-pointer overflow-hidden rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                isSelected
                  ? "ring-1"
                  : "border-transparent hover:border-border"
              }`}
              style={{
                borderColor: isSelected
                  ? stepActive ? step.color : "var(--color-border)"
                  : undefined,
                backgroundColor: isSelected
                  ? stepActive ? `${step.color}08` : "rgba(255,255,255,0.02)"
                  : "var(--color-card)",
                boxShadow: isSelected && stepActive
                  ? `0 0 20px ${step.glowColor}, inset 0 1px 0 ${step.color}15`
                  : "none",
                outline: isSelected
                  ? stepActive ? `1px solid ${step.color}30` : "1px solid var(--color-border)"
                  : "none",
                outlineOffset: "-1px",
              }}
            >
              {/* Step number + selected indicator */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200"
                    style={{
                      backgroundColor: isSelected
                        ? stepActive ? `${step.color}20` : "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.04)",
                      boxShadow: isSelected && stepActive
                        ? `inset 0 0 0 1.5px ${step.color}50`
                        : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                    }}
                  >
                    <StepIcon
                      size={15}
                      style={{
                        color: isSelected
                          ? stepActive ? step.color : "var(--color-foreground)"
                          : "var(--color-muted-foreground)",
                      }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                        Email {i + 1}
                      </span>
                      {isSelected && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white"
                          style={{ backgroundColor: stepActive ? step.color : "#71717a" }}
                        >
                          Editing
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[13px] font-semibold transition-colors"
                      style={{
                        color: isSelected
                          ? stepActive ? step.color : "var(--color-foreground)"
                          : "var(--color-foreground)",
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                </div>
                <Switch
                  size="sm"
                  checked={step.enabled}
                  onCheckedChange={() => onToggleStep(step.id)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={!automationEnabled}
                />
              </div>

              {/* Metadata badges */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[8px] font-medium">
                  <Timer size={7} className="mr-0.5" />
                  {step.delay_label}
                </Badge>
                {step.include_discount && step.enabled && (
                  <Badge variant="warning" className="text-[8px] font-bold uppercase">
                    <Percent size={7} className="mr-0.5" /> {step.discount_percent}%
                  </Badge>
                )}
                {!step.enabled && (
                  <Badge variant="secondary" className="text-[8px] text-muted-foreground/40">
                    Disabled
                  </Badge>
                )}
              </div>

              {/* Left accent bar when selected */}
              {isSelected && (
                <div
                  className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
                  style={{ backgroundColor: stepActive ? step.color : "#71717a" }}
                />
              )}
            </button>

            {/* Timeline arrow connector (between cards) */}
            {i < steps.length - 1 && (
              <div className="hidden items-center justify-center px-2 sm:flex">
                <ArrowRight size={16} className="text-muted-foreground/20" />
              </div>
            )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EMAIL PREVIEW — live rendered iframe of the actual email
   ═══════════════════════════════════════════════════════════ */
function EmailPreview({
  step,
  previewVersion,
}: {
  step: EmailStep | null;
  previewVersion: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(true);

  const previewUrl = useMemo(() => {
    if (!step) return null;
    const params = new URLSearchParams();
    params.set("subject", step.subject);
    params.set("preview_text", step.preview_text);
    if (step.greeting) params.set("greeting", step.greeting);
    if (step.body_message) params.set("body_message", step.body_message);
    if (step.cta_text) params.set("cta_text", step.cta_text);
    if (step.include_discount && step.discount_code) {
      params.set("discount_code", step.discount_code);
      params.set("discount_percent", String(step.discount_percent));
      if (step.discount_label) params.set("discount_label", step.discount_label);
    }
    params.set("use_real_event", "1");
    params.set("t", String(previewVersion));
    return `/api/abandoned-carts/preview-email?${params.toString()}`;
  }, [step, previewVersion]);

  useEffect(() => {
    setLoading(true);
  }, [previewUrl]);

  if (!step) {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="py-16 text-center">
          <Mail size={28} className="mx-auto text-muted-foreground/20" />
          <p className="mt-3 text-sm text-muted-foreground">
            Select a step to preview the email
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="shrink-0 border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Mail size={15} className="text-primary" />
            Email Preview
          </CardTitle>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setPreviewMode("desktop")}
              className={`rounded-md px-2 py-1 transition-all ${
                previewMode === "desktop"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor size={13} />
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("mobile")}
              className={`rounded-md px-2 py-1 transition-all ${
                previewMode === "mobile"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone size={13} />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative flex-1 p-4" style={{ minHeight: "600px" }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Rendering preview...</span>
            </div>
          </div>
        )}
        <div
          className="mx-auto h-full overflow-hidden rounded-lg border border-border/50 bg-white transition-all duration-300"
          style={{ width: previewMode === "mobile" ? "375px" : "100%" }}
        >
          {previewUrl && (
            <iframe
              ref={iframeRef}
              src={previewUrl}
              title="Email Preview"
              className="h-full w-full border-0"
              sandbox="allow-same-origin"
              onLoad={() => setLoading(false)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE DISCOUNT INLINE — create a discount code from editor
   ═══════════════════════════════════════════════════════════ */
function CreateDiscountInline({
  onCreated,
}: {
  onCreated: (code: string, percent: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCreate = async () => {
    if (!code.trim()) {
      setError("Enter a discount code");
      return;
    }
    if (percent < 1 || percent > 100) {
      setError("Percentage must be 1–100");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          description: `Abandoned cart recovery discount (${percent}% off)`,
          type: "percentage",
          value: percent,
          status: "active",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to create discount");
        setCreating(false);
        return;
      }

      setSuccess(true);
      onCreated(code.trim().toUpperCase(), percent);

      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
        setCode("");
        setPercent(10);
      }, 1200);
    } catch {
      setError("Network error");
    }
    setCreating(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-[11px] font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
      >
        <Plus size={12} />
        Create New Discount Code
      </button>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border transition-all"
      style={{
        borderColor: success ? "rgba(16,185,129,0.3)" : "rgba(139,92,246,0.2)",
        background: success
          ? "rgba(16,185,129,0.04)"
          : "rgba(139,92,246,0.04)",
      }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
            {success ? "Discount Created" : "New Discount Code"}
          </span>
          {!success && (
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>

        {success ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={14} />
            <span className="font-mono font-bold">{code.toUpperCase()}</span> — {percent}% off
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-5 gap-3">
              <div className="col-span-3">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Code
                </Label>
                <Input
                  className="mt-1 font-mono text-xs"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                  placeholder="COMEBACK10"
                  disabled={creating}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Discount %
                </Label>
                <Input
                  className="mt-1 font-mono text-xs"
                  type="number"
                  min={1}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  disabled={creating}
                />
              </div>
            </div>
            {error && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-red-400">
                <AlertTriangle size={10} />
                {error}
              </p>
            )}
            <Button
              size="sm"
              className="mt-3 w-full gap-1.5 text-xs"
              onClick={handleCreate}
              disabled={creating || !code.trim()}
            >
              {creating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              {creating ? "Creating..." : "Create & Apply"}
            </Button>
            <p className="mt-2 text-[10px] text-muted-foreground/40">
              Creates a percentage discount in the Discounts system and auto-fills it above
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   STEP SETTINGS — timing, incentive, and branding (compact)
   ═══════════════════════════════════════════════════════════ */
function StepSettings({
  step,
  automationEnabled,
  onUpdate,
  branding,
  onBrandingChange,
}: {
  step: EmailStep;
  automationEnabled: boolean;
  onUpdate: (id: string, updates: Partial<EmailStep>) => void;
  branding: EmailBrandingState;
  onBrandingChange: (updates: Partial<EmailBrandingState>) => void;
}) {
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const [displayLogoUrl, setDisplayLogoUrl] = useState<string | null>(null);

  const StepIcon = step.icon;
  const isActive = automationEnabled && step.enabled;

  const handleLogoFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setLogoProcessing(true);
    const compressed = await processLogoFile(file);
    if (!compressed) { setLogoProcessing(false); return; }
    setDisplayLogoUrl(compressed);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: compressed, key: "email-logo" }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        const aspectImg = new Image();
        aspectImg.onload = () => {
          const ratio = aspectImg.width / aspectImg.height;
          onBrandingChange({ logo_url: json.url, logo_aspect_ratio: ratio });
          setDisplayLogoUrl(null);
        };
        aspectImg.onerror = () => {
          onBrandingChange({ logo_url: json.url });
          setDisplayLogoUrl(null);
        };
        aspectImg.src = compressed;
      }
    } catch { /* upload failed */ }
    setLogoProcessing(false);
  }, [onBrandingChange]);

  const logoSrc = displayLogoUrl || branding.logo_url;

  return (
    <Card
      className="overflow-hidden transition-all duration-300"
      style={{
        borderColor: isActive ? `${step.color}20` : undefined,
      }}
    >
      {/* Step header */}
      <div
        className="relative border-b px-5 py-3"
        style={{
          borderColor: isActive ? `${step.color}15` : "var(--color-border)",
          background: isActive
            ? `linear-gradient(135deg, ${step.color}08, transparent)`
            : "transparent",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all"
            style={{
              backgroundColor: isActive ? `${step.color}15` : "rgba(255,255,255,0.04)",
              boxShadow: isActive ? `inset 0 0 0 1.5px ${step.color}40` : "none",
            }}
          >
            <StepIcon size={14} style={{ color: isActive ? step.color : "#71717a" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                className="text-[12px] font-bold uppercase tracking-wider"
                style={{ color: isActive ? step.color : "#71717a" }}
              >
                {step.label}
              </h3>
              <Badge
                variant={isActive ? "success" : "secondary"}
                className="text-[8px] font-bold uppercase"
              >
                {isActive ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground/50">
              Sent {step.delay_label} after abandonment
            </p>
          </div>
        </div>
      </div>

      <CardContent className="space-y-4 p-4">
        {/* ── CONTENT ── */}
        <div>
          <Label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Pencil size={10} />
            Content
          </Label>
          <div className="mt-2 space-y-2.5">
            <div>
              <Label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Subject Line
              </Label>
              <Input
                className="mt-1 text-xs"
                value={step.subject}
                onChange={(e) => onUpdate(step.id, { subject: e.target.value })}
                placeholder="Email subject..."
              />
            </div>
            <div>
              <Label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Preview Text
              </Label>
              <Input
                className="mt-1 text-xs"
                value={step.preview_text}
                onChange={(e) => onUpdate(step.id, { preview_text: e.target.value })}
                placeholder="Inbox preview..."
              />
            </div>
            <div>
              <Label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Heading
              </Label>
              <Input
                className="mt-1 text-xs"
                value={step.greeting}
                onChange={(e) => onUpdate(step.id, { greeting: e.target.value })}
                placeholder="Greeting headline..."
              />
            </div>
            <div>
              <Label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Body Message
              </Label>
              <Textarea
                className="mt-1 text-xs"
                value={step.body_message}
                onChange={(e) => onUpdate(step.id, { body_message: e.target.value })}
                placeholder="Email body text..."
                rows={2}
              />
            </div>
            <div>
              <Label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Button Text
              </Label>
              <Input
                className="mt-1 text-xs"
                value={step.cta_text}
                onChange={(e) => onUpdate(step.id, { cta_text: e.target.value })}
                placeholder="Complete Your Order"
              />
            </div>
          </div>
        </div>

        {/* ── TIMING ── */}
        <div>
          <Label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock size={10} />
            Timing
          </Label>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {step.id === "email_1" && [
              { label: "15 min", minutes: 15 },
              { label: "30 min", minutes: 30 },
              { label: "1 hour", minutes: 60 },
            ].map((opt) => (
              <button
                key={opt.minutes}
                type="button"
                onClick={() => onUpdate(step.id, { delay_minutes: opt.minutes, delay_label: opt.label })}
                className={`rounded-lg border px-2.5 py-2 font-mono text-[10px] font-semibold transition-all ${
                  step.delay_minutes === opt.minutes
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-transparent text-muted-foreground hover:bg-card"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {step.id === "email_2" && [
              { label: "12 hours", minutes: 720 },
              { label: "24 hours", minutes: 1440 },
              { label: "36 hours", minutes: 2160 },
            ].map((opt) => (
              <button
                key={opt.minutes}
                type="button"
                onClick={() => onUpdate(step.id, { delay_minutes: opt.minutes, delay_label: opt.label })}
                className={`rounded-lg border px-2.5 py-2 font-mono text-[10px] font-semibold transition-all ${
                  step.delay_minutes === opt.minutes
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-transparent text-muted-foreground hover:bg-card"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {step.id === "email_3" && [
              { label: "48 hours", minutes: 2880 },
              { label: "72 hours", minutes: 4320 },
              { label: "5 days", minutes: 7200 },
            ].map((opt) => (
              <button
                key={opt.minutes}
                type="button"
                onClick={() => onUpdate(step.id, { delay_minutes: opt.minutes, delay_label: opt.label })}
                className={`rounded-lg border px-2.5 py-2 font-mono text-[10px] font-semibold transition-all ${
                  step.delay_minutes === opt.minutes
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-transparent text-muted-foreground hover:bg-card"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── INCENTIVE ── */}
        <div>
          <div
            className="flex items-center justify-between rounded-lg border px-3 py-2.5 transition-all"
            style={{
              borderColor: step.include_discount
                ? "rgba(245,158,11,0.2)"
                : "var(--color-border)",
              background: step.include_discount
                ? "rgba(245,158,11,0.04)"
                : "transparent",
            }}
          >
            <div className="flex items-center gap-2">
              <Percent size={12} style={{ color: step.include_discount ? "#f59e0b" : "#71717a" }} />
              <span className="text-[11px] font-medium text-foreground">Include Discount</span>
            </div>
            <Switch
              size="sm"
              checked={step.include_discount}
              onCheckedChange={(val) => onUpdate(step.id, { include_discount: val })}
            />
          </div>

          {step.include_discount && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-3">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Code
                  </Label>
                  <Input
                    className="mt-1 font-mono text-xs"
                    value={step.discount_code}
                    onChange={(e) => onUpdate(step.id, { discount_code: e.target.value.toUpperCase() })}
                    placeholder="COMEBACK10"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Discount %
                  </Label>
                  <Input
                    className="mt-1 font-mono text-xs"
                    type="number"
                    min={1}
                    max={100}
                    value={step.discount_percent}
                    onChange={(e) => onUpdate(step.id, { discount_percent: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Heading Text
                </Label>
                <Input
                  className="mt-1 text-xs"
                  value={step.discount_label}
                  onChange={(e) => onUpdate(step.id, { discount_label: e.target.value })}
                  placeholder="Your exclusive offer"
                />
                <p className="mt-1.5 text-[9px] text-muted-foreground/40">
                  Appears above the code in the email. The code and percentage are shown automatically.
                </p>
              </div>

              <CreateDiscountInline
                onCreated={(newCode, newPercent) => {
                  onUpdate(step.id, {
                    discount_code: newCode,
                    discount_percent: newPercent,
                  });
                }}
              />
            </div>
          )}
        </div>

        {/* ── BRANDING ── */}
        <div>
          <Label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Palette size={10} />
            Email Branding
          </Label>
          <div className="mt-2 flex items-start gap-4">
            {/* Logo */}
            <div className="shrink-0">
              {logoSrc ? (
                <div
                  className="group relative cursor-pointer rounded-lg border border-border bg-[#08080c] p-3"
                  onClick={() => logoFileRef.current?.click()}
                >
                  <img
                    src={logoSrc}
                    alt="Logo"
                    style={{ height: 28, width: "auto", maxWidth: 120, objectFit: "contain" }}
                  />
                  <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); logoFileRef.current?.click(); }}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-primary/80"
                    >
                      <Pencil size={9} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onBrandingChange({ logo_url: "", logo_aspect_ratio: undefined }); setDisplayLogoUrl(null); }}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-red-500/80"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoFile(file); }}
                  />
                </div>
              ) : (
                <div
                  className={`cursor-pointer rounded-lg border-2 border-dashed p-3 text-center transition-all ${
                    logoDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                  }`}
                  style={{ minWidth: "80px" }}
                  onClick={() => logoFileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setLogoDragging(true); }}
                  onDragLeave={() => setLogoDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setLogoDragging(false); const file = e.dataTransfer.files[0]; if (file) handleLogoFile(file); }}
                >
                  <ImageIcon size={14} className="mx-auto text-muted-foreground/40" />
                  <p className="mt-1 text-[9px] text-muted-foreground/50">
                    {logoProcessing ? "..." : "Logo"}
                  </p>
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoFile(file); }}
                  />
                </div>
              )}
            </div>

            {/* Accent color */}
            <div>
              <ColorPicker
                value={branding.accent_color}
                onChange={(v) => onBrandingChange({ accent_color: v })}
              />
              <p className="mt-1 text-[9px] text-muted-foreground/40">
                Accent color
              </p>
            </div>
          </div>
          <p className="mt-2 text-[9px] text-muted-foreground/30">
            Shared with all email types
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   PERFORMANCE CARDS — gamified stat cards with urgency colors
   ═══════════════════════════════════════════════════════════ */
function PerformanceCards({ stats }: { stats: AbandonedCartStats }) {
  const recoveryRate = stats.total > 0
    ? ((stats.recovered / stats.total) * 100)
    : 0;
  const lostRevenue = stats.total_value - stats.recovered_value;

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {/* Revenue at Risk */}
      <div
        className="relative overflow-hidden rounded-xl border p-5"
        style={{
          borderColor: stats.abandoned > 0 ? "rgba(239,68,68,0.2)" : "var(--color-border)",
          background: stats.abandoned > 0
            ? "linear-gradient(135deg, rgba(239,68,68,0.04), rgba(245,158,11,0.02))"
            : "var(--color-card)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
            <DollarSign size={14} className="text-red-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Revenue at Risk</span>
        </div>
        <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-red-400">{formatCurrency(lostRevenue)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">{stats.abandoned} abandoned cart{stats.abandoned !== 1 ? "s" : ""}</p>
        {stats.abandoned > 0 && (
          <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-red-500/5" />
        )}
      </div>

      {/* Recovered */}
      <div
        className="relative overflow-hidden rounded-xl border p-5"
        style={{
          borderColor: stats.recovered > 0 ? "rgba(16,185,129,0.2)" : "var(--color-border)",
          background: stats.recovered > 0
            ? "linear-gradient(135deg, rgba(16,185,129,0.04), rgba(52,211,153,0.02))"
            : "var(--color-card)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
            <PartyPopper size={14} className="text-emerald-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Recovered</span>
        </div>
        <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-emerald-400">{formatCurrency(stats.recovered_value)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">{stats.recovered} cart{stats.recovered !== 1 ? "s" : ""} saved</p>
      </div>

      {/* Recovery Rate with progress bar */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp size={14} className="text-primary" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Recovery Rate</span>
        </div>
        <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">{recoveryRate.toFixed(0)}%</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(recoveryRate, 100)}%`,
              background: recoveryRate >= 30 ? "#10b981" : recoveryRate >= 15 ? "#f59e0b" : "#ef4444",
            }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground/60">{stats.recovered} of {stats.total} total</p>
      </div>

      {/* Awaiting Email */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
            <MailWarning size={14} className="text-amber-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Awaiting Email</span>
        </div>
        <p className="mt-3 font-mono text-2xl font-bold tabular-nums text-foreground">{stats.abandoned}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">Ready for recovery outreach</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HOW IT WORKS — gamified onboarding flow
   ═══════════════════════════════════════════════════════════ */
function HowItWorks() {
  const steps = [
    {
      icon: ShoppingCart,
      label: "Cart Captured",
      detail: "When a customer enters their email at checkout but doesn't complete the purchase, we capture their cart details",
      color: "#f59e0b",
    },
    {
      icon: Sparkles,
      label: "Automation Triggers",
      detail: "Your configured email sequence begins — each step fires automatically at the delay you set",
      color: "#8B5CF6",
    },
    {
      icon: Mail,
      label: "Emails Delivered",
      detail: "Personalized recovery emails with cart contents, event details, and optional discount codes",
      color: "#f97316",
    },
    {
      icon: PartyPopper,
      label: "Revenue Recovered",
      detail: "Customer returns to complete their purchase — cart is marked as recovered automatically",
      color: "#10b981",
    },
  ];

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles size={15} className="text-primary" />
          How It Works
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => {
            const StepIcon = step.icon;
            return (
              <div key={step.label} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: `${step.color}12`,
                        boxShadow: `inset 0 0 0 1.5px ${step.color}40`,
                      }}
                    >
                      <StepIcon size={18} style={{ color: step.color }} />
                    </div>
                    <span
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ backgroundColor: step.color }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-foreground">
                    {step.label}
                  </h4>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/60">
                    {step.detail}
                  </p>
                </div>

                {i < steps.length - 1 && (
                  <ArrowRight
                    size={14}
                    className="absolute -right-3 top-6 hidden text-muted-foreground/15 lg:block"
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   ABANDONED CART EMAIL AUTOMATION PAGE
   ════════════════════════════════════════════════════════════ */
export default function AbandonedCartPage() {
  const [stats, setStats] = useState<AbandonedCartStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [activeStepId, setActiveStepId] = useState<string | null>("email_1");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Email branding state (loaded from feral_email settings)
  const [branding, setBranding] = useState<EmailBrandingState>({
    logo_url: "",
    logo_height: 48,
    accent_color: "#ff0033",
    from_name: "FERAL PRESENTS",
  });
  // Preview version counter — increment to force iframe reload when branding changes
  const [previewVersion, setPreviewVersion] = useState(0);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/abandoned-carts?limit=1");
      const json = await res.json();
      if (json.stats) setStats(json.stats);
    } catch {
      // Silent fail
    }
  }, []);

  // Load settings (automation + email branding in parallel)
  const loadSettings = useCallback(async () => {
    try {
      const [automationRes, emailRes] = await Promise.all([
        fetch(`/api/settings?key=${SETTINGS_KEY}`),
        fetch(`/api/settings?key=feral_email`),
      ]);
      const automationJson = await automationRes.json();
      const emailJson = await emailRes.json();

      if (automationJson?.data) {
        const loaded = automationJson.data as AutomationSettings;
        setSettings({
          enabled: loaded.enabled ?? false,
          steps: DEFAULT_STEPS.map((def) => {
            const saved = loaded.steps?.find((s: EmailStep) => s.id === def.id);
            return saved ? { ...def, ...saved, icon: def.icon } : def;
          }),
        });
      }

      if (emailJson?.data) {
        const e = emailJson.data as Record<string, unknown>;
        setBranding({
          logo_url: (e.logo_url as string) || "",
          logo_height: (e.logo_height as number) || 48,
          logo_aspect_ratio: e.logo_aspect_ratio as number | undefined,
          accent_color: (e.accent_color as string) || "#ff0033",
          from_name: (e.from_name as string) || "FERAL PRESENTS",
        });
      }
    } catch {
      // Use defaults
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
    loadSettings();
  }, [loadStats, loadSettings]);

  // Auto-save automation settings with debounce
  const persistSettings = useCallback(async (newSettings: AutomationSettings) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    // Reset to idle so the next saved/error transition always fires the useEffect
    setSaveStatus("idle");

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      const toSave = {
        ...newSettings,
        steps: newSettings.steps.map(({ icon, ...rest }) => rest),
      };
      const { error } = await saveSettings(SETTINGS_KEY, toSave as unknown as Record<string, unknown>);
      setSaving(false);
      if (error) {
        setSaveStatus("error");
      } else {
        setSaveStatus("saved");
      }
    }, 600);
  }, []);

  // Save email branding settings (separate settings key)
  const persistBranding = useCallback(async (updated: EmailBrandingState) => {
    // Load existing email settings, merge, and save
    try {
      const res = await fetch("/api/settings?key=feral_email");
      const json = await res.json();
      const existing = json?.data || {};
      const merged = { ...existing, ...updated };
      await saveSettings("feral_email", merged as unknown as Record<string, unknown>);
      // Bump preview version to force iframe reload
      setPreviewVersion((v) => v + 1);
    } catch {
      // Silent fail
    }
  }, []);

  // Handle branding changes
  const handleBrandingChange = useCallback((updates: Partial<EmailBrandingState>) => {
    setBranding((prev) => {
      const updated = { ...prev, ...updates };
      persistBranding(updated);
      return updated;
    });
  }, [persistBranding]);

  // Toggle master automation (functional update prevents stale closure)
  const handleToggleAutomation = useCallback((val: boolean) => {
    setSettings((prev) => {
      const updated = { ...prev, enabled: val };
      persistSettings(updated);
      return updated;
    });
  }, [persistSettings]);

  // Toggle individual step (functional update prevents stale closure)
  const handleToggleStep = useCallback((id: string) => {
    setSettings((prev) => {
      const updated = {
        ...prev,
        steps: prev.steps.map((s) =>
          s.id === id ? { ...s, enabled: !s.enabled } : s
        ),
      };
      persistSettings(updated);
      return updated;
    });
  }, [persistSettings]);

  // Update step fields (functional update prevents stale closure)
  const handleUpdateStep = useCallback((id: string, updates: Partial<EmailStep>) => {
    setSettings((prev) => {
      const updated = {
        ...prev,
        steps: prev.steps.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        ),
      };
      persistSettings(updated);
      return updated;
    });
  }, [persistSettings]);

  const activeStep = settings.steps.find((s) => s.id === activeStepId) || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading automation settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb + Header */}
      <div className="mb-6">
        <Link
          href="/admin/communications/marketing/"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground no-underline"
        >
          <ChevronLeft size={14} />
          Marketing
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-foreground">
                Abandoned Cart Recovery
              </h1>
              {settings.enabled && (
                <Badge variant="success" className="gap-1 text-[9px] font-bold uppercase">
                  <Power size={8} /> Live
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatically email customers who left items in their cart to recover lost revenue.
            </p>
          </div>

        </div>
      </div>

      {/* Performance stats */}
      {stats && stats.total > 0 && (
        <div className="mb-6">
          <PerformanceCards stats={stats} />
          <Link
            href="/admin/abandoned-carts/"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            View all abandoned carts
            <ExternalLink size={11} />
          </Link>
        </div>
      )}

      {/* Master toggle */}
      <div className="mb-6">
        <MasterToggle
          enabled={settings.enabled}
          onToggle={handleToggleAutomation}
          stats={stats}
        />
      </div>

      {/* Disabled overlay hint */}
      {!settings.enabled && stats && stats.abandoned > 0 && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/4 px-5 py-4">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
            <MailWarning size={18} className="text-amber-400" />
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-500 opacity-15" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {stats.abandoned} cart{stats.abandoned !== 1 ? "s" : ""} waiting to be recovered
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatCurrency(stats.total_value - stats.recovered_value)} in potential revenue. Enable automation above to start recovering sales.
            </p>
          </div>
          <Badge variant="warning" className="shrink-0 text-[10px] font-semibold uppercase">
            Action needed
          </Badge>
        </div>
      )}

      {/* Row 1: Recovery Flow (full width, horizontal strip) */}
      <div className="mb-6">
        <RecoveryFlow
          steps={settings.steps}
          automationEnabled={settings.enabled}
          onToggleStep={handleToggleStep}
          activeStepId={activeStepId}
          onSelectStep={setActiveStepId}
        />
      </div>

      {/* Row 2: Step Settings (4/12) | Email Editor (8/12) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-4">
          {activeStep ? (
            <StepSettings
              step={activeStep}
              automationEnabled={settings.enabled}
              onUpdate={handleUpdateStep}
              branding={branding}
              onBrandingChange={handleBrandingChange}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Mail size={28} className="text-muted-foreground/20" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Select a step to configure
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="xl:col-span-8" style={{ minHeight: "700px" }}>
          <EmailPreview
            step={activeStep}
            previewVersion={previewVersion}
          />
        </div>
      </div>

      {/* How It Works */}
      <div className="mt-6">
        <HowItWorks />
      </div>

      {/* Floating save toast */}
      <SaveToast saving={saving} status={saveStatus} />
    </div>
  );
}
