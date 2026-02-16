"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { saveSettings } from "@/lib/settings";
import {
  ChevronLeft,
  ShoppingCart,
  Clock,
  Tag,
  MailWarning,
  TrendingUp,
  DollarSign,
  ExternalLink,
  Send,
  Flame,
  Zap,
  Check,
  PartyPopper,
  CircleDot,
  Power,
  Timer,
  Mail,
  Percent,
  AlertTriangle,
  ChevronDown,
  Eye,
  Sparkles,
  Target,
  ArrowRight,
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
  include_discount: boolean;
  discount_code: string;
  discount_percent: number;
  icon: typeof Send;
  color: string;
  glowColor: string;
}

interface AutomationSettings {
  enabled: boolean;
  steps: EmailStep[];
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
    include_discount: false,
    discount_code: "",
    discount_percent: 0,
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
    subject: "Tickets selling fast — don't miss out",
    preview_text: "Your cart items are still available, but not for long",
    include_discount: false,
    discount_code: "",
    discount_percent: 0,
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
    subject: "Last chance — your cart expires soon",
    preview_text: "This is your final reminder before your cart expires",
    include_discount: true,
    discount_code: "COMEBACK10",
    discount_percent: 10,
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

/* ── Helpers ── */
function formatCurrency(amount: number) {
  return `£${Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
          {/* Power icon with glow */}
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

        {/* Toggle switch */}
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

      {/* Decorative gradient orbs */}
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
   RECOVERY PIPELINE — visual flow of email steps
   ═══════════════════════════════════════════════════════════ */
function RecoveryPipeline({
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
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CircleDot size={15} className="text-primary" />
            Recovery Pipeline
          </CardTitle>
          <div className="flex items-center gap-2">
            {steps.filter((s) => s.enabled).length > 0 && (
              <Badge variant="info" className="text-[9px] font-bold uppercase">
                {steps.filter((s) => s.enabled).length} of {steps.length} active
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {/* Pipeline visual */}
        <div className="relative space-y-0">
          {/* Cart abandoned — origin node */}
          <div className="relative flex items-start gap-4">
            {/* Connecting line */}
            <div
              className="absolute left-[15px] top-[32px] w-0.5"
              style={{
                height: "calc(100% - 8px)",
                background: automationEnabled
                  ? "linear-gradient(to bottom, #f59e0b, #8B5CF6)"
                  : "rgba(255,255,255,0.06)",
              }}
            />
            <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300"
                style={{
                  backgroundColor: "rgba(245,158,11,0.15)",
                  boxShadow: "inset 0 0 0 1.5px rgba(245,158,11,0.5)",
                }}
              >
                <ShoppingCart size={13} style={{ color: "#f59e0b" }} />
              </div>
            </div>
            <div className="min-w-0 flex-1 pb-5">
              <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                Cart Abandoned
              </span>
              <p className="mt-0.5 text-[11px] text-muted-foreground/50">
                Customer leaves checkout without completing purchase
              </p>
            </div>
          </div>

          {/* Email steps */}
          {steps.map((step, i) => {
            const StepIcon = step.icon;
            const isLast = i === steps.length - 1;
            const isSelected = activeStepId === step.id;
            const isDisabled = !automationEnabled;

            return (
              <div key={step.id} className="relative flex items-start gap-4">
                {/* Connecting line to next */}
                {!isLast && (
                  <div
                    className="absolute left-[15px] top-[32px] w-0.5"
                    style={{
                      height: "calc(100% - 8px)",
                      background: step.enabled && automationEnabled
                        ? `linear-gradient(to bottom, ${step.color}, ${steps[i + 1]?.color || step.color})`
                        : "rgba(255,255,255,0.06)",
                    }}
                  />
                )}
                {isLast && (
                  <div
                    className="absolute left-[15px] top-[32px] w-0.5"
                    style={{
                      height: "calc(100% - 8px)",
                      background: step.enabled && automationEnabled
                        ? `linear-gradient(to bottom, ${step.color}, #10b981)`
                        : "rgba(255,255,255,0.06)",
                    }}
                  />
                )}

                {/* Step node */}
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: step.enabled && automationEnabled ? `${step.color}18` : "rgba(255,255,255,0.04)",
                      boxShadow: isSelected && step.enabled && automationEnabled
                        ? `0 0 16px ${step.glowColor}, inset 0 0 0 1.5px ${step.color}`
                        : step.enabled && automationEnabled
                          ? `inset 0 0 0 1.5px ${step.color}60`
                          : "none",
                    }}
                  >
                    {step.enabled && automationEnabled ? (
                      <Check size={12} style={{ color: step.color }} />
                    ) : (
                      <StepIcon size={13} style={{ color: isDisabled ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.25)" }} />
                    )}
                  </div>
                  {isSelected && step.enabled && automationEnabled && (
                    <span className="absolute inset-0 animate-ping rounded-full opacity-15" style={{ backgroundColor: step.color }} />
                  )}
                </div>

                {/* Step content — clickable */}
                <button
                  type="button"
                  onClick={() => onSelectStep(step.id)}
                  className={`group min-w-0 flex-1 rounded-lg border px-4 py-3 text-left transition-all duration-300 ${
                    isLast ? "mb-0" : "mb-3"
                  } ${
                    isSelected
                      ? ""
                      : "border-transparent hover:border-border/40 hover:bg-muted/20"
                  }`}
                  style={isSelected ? {
                    borderColor: step.enabled && automationEnabled ? `${step.color}30` : "var(--color-border)",
                    backgroundColor: step.enabled && automationEnabled ? `${step.color}06` : "rgba(255,255,255,0.02)",
                  } : {}}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[12px] font-semibold uppercase tracking-wider transition-colors"
                        style={{
                          color: step.enabled && automationEnabled ? step.color : "rgba(255,255,255,0.3)",
                        }}
                      >
                        {step.label}
                      </span>
                      {step.include_discount && step.enabled && (
                        <Badge variant="warning" className="text-[8px] font-bold uppercase">
                          <Percent size={7} /> {step.discount_percent}% off
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-muted-foreground/40">
                        <Timer size={10} className="mr-1 inline" />
                        {step.delay_label}
                      </span>
                      <Switch
                        size="sm"
                        checked={step.enabled}
                        onCheckedChange={() => onToggleStep(step.id)}
                        disabled={!automationEnabled}
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground/50">
                    {step.description}
                  </p>
                  {isSelected && (
                    <div className="mt-2 flex items-center gap-1 text-[10px]" style={{ color: step.color }}>
                      <Eye size={10} />
                      <span>Click to configure below</span>
                    </div>
                  )}
                </button>
              </div>
            );
          })}

          {/* Recovery outcome node */}
          <div className="relative flex items-start gap-4">
            <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300"
                style={{
                  backgroundColor: automationEnabled ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
                  boxShadow: automationEnabled ? "inset 0 0 0 1.5px rgba(16,185,129,0.5)" : "none",
                }}
              >
                <PartyPopper size={13} style={{ color: automationEnabled ? "#10b981" : "rgba(255,255,255,0.15)" }} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="text-[12px] font-semibold uppercase tracking-wider"
                style={{ color: automationEnabled ? "#10b981" : "rgba(255,255,255,0.3)" }}
              >
                Cart Recovered
              </span>
              <p className="mt-0.5 text-[11px] text-muted-foreground/50">
                Customer completes their purchase
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   STEP EDITOR — configure individual email step
   ═══════════════════════════════════════════════════════════ */
function StepEditor({
  step,
  automationEnabled,
  onUpdate,
}: {
  step: EmailStep;
  automationEnabled: boolean;
  onUpdate: (id: string, updates: Partial<EmailStep>) => void;
}) {
  const isDisabled = !automationEnabled || !step.enabled;
  const StepIcon = step.icon;

  return (
    <Card
      className="overflow-hidden transition-all duration-300"
      style={{
        borderColor: !isDisabled ? `${step.color}20` : undefined,
      }}
    >
      {/* Step header with color accent */}
      <div
        className="relative border-b px-5 py-4"
        style={{
          borderColor: !isDisabled ? `${step.color}15` : "var(--color-border)",
          background: !isDisabled
            ? `linear-gradient(135deg, ${step.color}08, transparent)`
            : "transparent",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full transition-all"
              style={{
                backgroundColor: !isDisabled ? `${step.color}15` : "rgba(255,255,255,0.04)",
                boxShadow: !isDisabled ? `inset 0 0 0 1.5px ${step.color}40` : "none",
              }}
            >
              <StepIcon size={15} style={{ color: !isDisabled ? step.color : "#71717a" }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className="font-mono text-[13px] font-bold uppercase tracking-wider"
                  style={{ color: !isDisabled ? step.color : "#71717a" }}
                >
                  {step.label}
                </h3>
                <Badge
                  variant={step.enabled && automationEnabled ? "success" : "secondary"}
                  className="text-[8px] font-bold uppercase"
                >
                  {step.enabled && automationEnabled ? "Active" : "Disabled"}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground/50">
                Sent {step.delay_label} after cart abandoned
              </p>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 p-5">
        <Tabs defaultValue="content">
          <TabsList variant="line" className="mb-4">
            <TabsTrigger value="content" className="text-xs">
              <Mail size={12} className="mr-1.5" />
              Content
            </TabsTrigger>
            <TabsTrigger value="incentive" className="text-xs">
              <Tag size={12} className="mr-1.5" />
              Incentive
            </TabsTrigger>
            <TabsTrigger value="timing" className="text-xs">
              <Clock size={12} className="mr-1.5" />
              Timing
            </TabsTrigger>
          </TabsList>

          {/* Content tab */}
          <TabsContent value="content" className="space-y-4">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Subject Line
              </Label>
              <Input
                className="mt-1.5"
                value={step.subject}
                onChange={(e) => onUpdate(step.id, { subject: e.target.value })}
                placeholder="Email subject line..."
                disabled={isDisabled}
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Preview Text
              </Label>
              <Textarea
                className="mt-1.5"
                value={step.preview_text}
                onChange={(e) => onUpdate(step.id, { preview_text: e.target.value })}
                placeholder="Shows in email client preview..."
                rows={2}
                disabled={isDisabled}
              />
              <p className="mt-1 text-[10px] text-muted-foreground/40">
                Appears as preview text in the customer&apos;s inbox
              </p>
            </div>
          </TabsContent>

          {/* Incentive tab */}
          <TabsContent value="incentive" className="space-y-4">
            <div
              className="flex items-center justify-between rounded-lg border p-4 transition-all"
              style={{
                borderColor: step.include_discount && !isDisabled
                  ? "rgba(245,158,11,0.2)"
                  : "var(--color-border)",
                background: step.include_discount && !isDisabled
                  ? "rgba(245,158,11,0.04)"
                  : "transparent",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: step.include_discount && !isDisabled ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
                  }}
                >
                  <Percent size={14} style={{ color: step.include_discount && !isDisabled ? "#f59e0b" : "#71717a" }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Include Discount</p>
                  <p className="text-[11px] text-muted-foreground/50">
                    Add a discount code to incentivize purchase
                  </p>
                </div>
              </div>
              <Switch
                size="sm"
                checked={step.include_discount}
                onCheckedChange={(val) => onUpdate(step.id, { include_discount: val })}
                disabled={isDisabled}
              />
            </div>

            {step.include_discount && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Discount Code
                  </Label>
                  <Input
                    className="mt-1.5 font-mono"
                    value={step.discount_code}
                    onChange={(e) => onUpdate(step.id, { discount_code: e.target.value.toUpperCase() })}
                    placeholder="COMEBACK10"
                    disabled={isDisabled}
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Discount %
                  </Label>
                  <Input
                    className="mt-1.5 font-mono"
                    type="number"
                    min={1}
                    max={100}
                    value={step.discount_percent}
                    onChange={(e) => onUpdate(step.id, { discount_percent: Number(e.target.value) })}
                    disabled={isDisabled}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          {/* Timing tab */}
          <TabsContent value="timing" className="space-y-4">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Delay After Cart Abandoned
              </Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {step.id === "email_1" && [
                  { label: "15 min", minutes: 15 },
                  { label: "30 min", minutes: 30 },
                  { label: "1 hour", minutes: 60 },
                ].map((opt) => (
                  <button
                    key={opt.minutes}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => onUpdate(step.id, { delay_minutes: opt.minutes, delay_label: opt.label })}
                    className={`rounded-lg border px-3 py-2.5 font-mono text-[11px] font-semibold transition-all ${
                      step.delay_minutes === opt.minutes
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-transparent text-muted-foreground hover:border-border hover:bg-card"
                    } disabled:opacity-40`}
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
                    disabled={isDisabled}
                    onClick={() => onUpdate(step.id, { delay_minutes: opt.minutes, delay_label: opt.label })}
                    className={`rounded-lg border px-3 py-2.5 font-mono text-[11px] font-semibold transition-all ${
                      step.delay_minutes === opt.minutes
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-transparent text-muted-foreground hover:border-border hover:bg-card"
                    } disabled:opacity-40`}
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
                    disabled={isDisabled}
                    onClick={() => onUpdate(step.id, { delay_minutes: opt.minutes, delay_label: opt.label })}
                    className={`rounded-lg border px-3 py-2.5 font-mono text-[11px] font-semibold transition-all ${
                      step.delay_minutes === opt.minutes
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-transparent text-muted-foreground hover:border-border hover:bg-card"
                    } disabled:opacity-40`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground/40">
                Time between cart abandonment and when this email is sent
              </p>
            </div>
          </TabsContent>
        </Tabs>
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
      icon: Target,
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
                  {/* Step number + icon */}
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

                {/* Arrow connector */}
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

  // Load settings
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/settings?key=${SETTINGS_KEY}`);
      const json = await res.json();
      if (json?.data) {
        // Merge with defaults to handle missing fields
        const loaded = json.data as AutomationSettings;
        setSettings({
          enabled: loaded.enabled ?? false,
          steps: DEFAULT_STEPS.map((def) => {
            const saved = loaded.steps?.find((s: EmailStep) => s.id === def.id);
            return saved ? { ...def, ...saved, icon: def.icon } : def;
          }),
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

  // Auto-save with debounce
  const persistSettings = useCallback(async (newSettings: AutomationSettings) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      // Strip non-serializable icon references before saving
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
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 600);
  }, []);

  // Toggle master automation
  const handleToggleAutomation = useCallback((val: boolean) => {
    const updated = { ...settings, enabled: val };
    setSettings(updated);
    persistSettings(updated);
  }, [settings, persistSettings]);

  // Toggle individual step
  const handleToggleStep = useCallback((id: string) => {
    const updated = {
      ...settings,
      steps: settings.steps.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      ),
    };
    setSettings(updated);
    persistSettings(updated);
  }, [settings, persistSettings]);

  // Update step fields
  const handleUpdateStep = useCallback((id: string, updates: Partial<EmailStep>) => {
    const updated = {
      ...settings,
      steps: settings.steps.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    };
    setSettings(updated);
    persistSettings(updated);
  }, [settings, persistSettings]);

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

          {/* Save status indicator */}
          <div className="flex items-center gap-2">
            {saving && (
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <Check size={10} />
                Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1 text-[10px] text-red-400">
                <AlertTriangle size={10} />
                Save failed
              </span>
            )}
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

      {/* Pipeline + Step Editor — side by side on large screens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recovery Pipeline */}
        <div className="lg:col-span-2">
          <RecoveryPipeline
            steps={settings.steps}
            automationEnabled={settings.enabled}
            onToggleStep={handleToggleStep}
            activeStepId={activeStepId}
            onSelectStep={setActiveStepId}
          />
        </div>

        {/* Step Editor */}
        <div className="lg:col-span-3">
          {activeStep ? (
            <StepEditor
              step={activeStep}
              automationEnabled={settings.enabled}
              onUpdate={handleUpdateStep}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Mail size={28} className="text-muted-foreground/20" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Select a step from the pipeline to configure it
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* How It Works */}
      <div className="mt-6">
        <HowItWorks />
      </div>
    </div>
  );
}
