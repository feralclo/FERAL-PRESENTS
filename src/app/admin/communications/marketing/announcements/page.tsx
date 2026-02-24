"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Mail,
  Clock,
  Zap,
  Bell,
  Eye,
  Save,
  Loader2,
  Users,
} from "lucide-react";
import { useOrgId } from "@/components/OrgProvider";
import { announcementAutomationKey } from "@/lib/constants";
import type { AnnouncementAutomationSettings } from "@/types/announcements";

const DEFAULT_SETTINGS: AnnouncementAutomationSettings = {
  enabled: true,
  step_1_enabled: true,
  step_2_enabled: true,
  step_3_enabled: true,
  step_4_enabled: true,
  step_4_delay_hours: 48,
};

interface StepConfig {
  step: 1 | 2 | 3 | 4;
  title: string;
  timing: string;
  description: string;
  icon: typeof Mail;
  enabledKey: keyof AnnouncementAutomationSettings;
  subjectKey: keyof AnnouncementAutomationSettings;
  headingKey: keyof AnnouncementAutomationSettings;
  bodyKey: keyof AnnouncementAutomationSettings;
  defaultSubject: string;
  defaultHeading: string;
  defaultBody: string;
}

const STEPS: StepConfig[] = [
  {
    step: 1,
    title: "Confirmation",
    timing: "Immediately on signup",
    description: "Confirms the signup and sets expectations for when tickets go live.",
    icon: Mail,
    enabledKey: "step_1_enabled",
    subjectKey: "step_1_subject",
    headingKey: "step_1_heading",
    bodyKey: "step_1_body",
    defaultSubject: "You're signed up for {event_name}!",
    defaultHeading: "You're In!",
    defaultBody: "We'll let you know the moment tickets go on sale. Mark your calendar — tickets go live on {tickets_live_date} at {tickets_live_time}.",
  },
  {
    step: 2,
    title: "Hype",
    timing: "1 hour before tickets go live",
    description: "Builds anticipation and reminds signups to be ready.",
    icon: Clock,
    enabledKey: "step_2_enabled",
    subjectKey: "step_2_subject",
    headingKey: "step_2_heading",
    bodyKey: "step_2_body",
    defaultSubject: "Tickets in 1 hour — {event_name}",
    defaultHeading: "Almost Time!",
    defaultBody: "Tickets for {event_name} go on sale in less than 1 hour. Be ready — the best tickets go fast.",
  },
  {
    step: 3,
    title: "Tickets Live",
    timing: "When tickets go on sale",
    description: "Notifies signups with a direct link to buy tickets.",
    icon: Zap,
    enabledKey: "step_3_enabled",
    subjectKey: "step_3_subject",
    headingKey: "step_3_heading",
    bodyKey: "step_3_body",
    defaultSubject: "Tickets are ON SALE — {event_name}",
    defaultHeading: "Tickets Are Live!",
    defaultBody: "Tickets for {event_name} are on sale now. Don't wait — secure your spot before they sell out.",
  },
  {
    step: 4,
    title: "Final Reminder",
    timing: "48 hours after tickets go live",
    description: "Last chance nudge — only sent if the customer hasn't purchased and isn't in an active abandoned cart recovery flow.",
    icon: Bell,
    enabledKey: "step_4_enabled",
    subjectKey: "step_4_subject",
    headingKey: "step_4_heading",
    bodyKey: "step_4_body",
    defaultSubject: "Last chance — {event_name}",
    defaultHeading: "Don't Miss Out",
    defaultBody: "Tickets for {event_name} are still available — but not for long. Grab yours before it's too late.",
  },
];

export default function AnnouncementAutomationPage() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<AnnouncementAutomationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [previewStep, setPreviewStep] = useState<number | null>(null);
  const [stats, setStats] = useState<{
    total_signups: number;
    emails_sent: { step_1: number; step_2: number; step_3: number; step_4: number };
    unsubscribed: number;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/settings?key=${announcementAutomationKey(orgId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) {
          setSettings({ ...DEFAULT_SETTINGS, ...json.data });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/announcement/signups?stats=true`)
      .then((r) => r.json())
      .then((json) => {
        if (json && typeof json.total_signups === "number") {
          setStats(json);
        }
      })
      .catch(() => {});
  }, [orgId]);

  const toggleStep = useCallback((step: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  }, []);

  const updateSetting = useCallback(<K extends keyof AnnouncementAutomationSettings>(
    key: K,
    value: AnnouncementAutomationSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: announcementAutomationKey(orgId),
          data: settings,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handled silently
    } finally {
      setSaving(false);
    }
  }, [orgId, settings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/admin/communications/marketing/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors no-underline mb-3"
        >
          <ChevronLeft size={14} />
          Marketing Automation
        </Link>
        <h1 className="font-mono text-base font-semibold tracking-wider text-foreground uppercase">
          Announcement Emails
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated email sequence for event announcement signups. Nurture signups from registration through to ticket purchase.
        </p>
      </div>

      {/* Master Toggle */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-medium text-foreground">
                Enable announcement email sequence
              </span>
              {settings.enabled ? (
                <Badge variant="success" className="text-[9px] font-bold uppercase">Live</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] py-0">Paused</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically send branded emails to people who sign up for event announcements.
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => updateSetting("enabled", v)}
          />
        </div>
      </Card>

      {/* Email Steps */}
      <div className="space-y-3 mb-6">
        {STEPS.map((stepConfig, idx) => {
          const isExpanded = expandedSteps.has(stepConfig.step);
          const Icon = stepConfig.icon;
          const isEnabled = settings[stepConfig.enabledKey] as boolean;

          return (
            <Card key={stepConfig.step} className="overflow-hidden">
              {/* Step header + timeline connector */}
              <div className="relative">
                {idx > 0 && (
                  <div
                    className="absolute left-[29px] -top-3 w-px h-3"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />
                )}
                <button
                  onClick={() => toggleStep(stepConfig.step)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-accent/30 transition-colors"
                >
                  <div
                    className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                    style={{
                      backgroundColor: isEnabled ? "rgba(16,185,129,0.1)" : "var(--color-accent)",
                    }}
                  >
                    <Icon
                      size={16}
                      style={{ color: isEnabled ? "#10b981" : undefined }}
                      className={isEnabled ? "" : "text-muted-foreground"}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        Step {stepConfig.step}: {stepConfig.title}
                      </span>
                      {isEnabled ? (
                        <Badge variant="success" className="text-[9px] font-bold uppercase">On</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] py-0">Off</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{stepConfig.timing}</p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                  )}
                </button>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-border">
                  <div className="pt-4 space-y-4">
                    {/* Step toggle */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">
                        {stepConfig.description}
                      </Label>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(v) =>
                          updateSetting(stepConfig.enabledKey, v as never)
                        }
                      />
                    </div>

                    {isEnabled && (
                      <>
                        {/* Subject */}
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">
                            Subject Line
                          </Label>
                          <Input
                            value={(settings[stepConfig.subjectKey] as string) || ""}
                            onChange={(e) =>
                              updateSetting(stepConfig.subjectKey, e.target.value as never)
                            }
                            placeholder={stepConfig.defaultSubject}
                            className="text-sm"
                          />
                        </div>

                        {/* Heading */}
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">
                            Heading
                          </Label>
                          <Input
                            value={(settings[stepConfig.headingKey] as string) || ""}
                            onChange={(e) =>
                              updateSetting(stepConfig.headingKey, e.target.value as never)
                            }
                            placeholder={stepConfig.defaultHeading}
                            className="text-sm"
                          />
                        </div>

                        {/* Body */}
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">
                            Body Message
                          </Label>
                          <Textarea
                            value={(settings[stepConfig.bodyKey] as string) || ""}
                            onChange={(e) =>
                              updateSetting(stepConfig.bodyKey, e.target.value as never)
                            }
                            placeholder={stepConfig.defaultBody}
                            rows={3}
                            className="text-sm"
                          />
                        </div>

                        {/* Step 4 delay */}
                        {stepConfig.step === 4 && (
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">
                              Send Delay (after tickets go live)
                            </Label>
                            <NativeSelect
                              value={String(settings.step_4_delay_hours || 48)}
                              onChange={(e) =>
                                updateSetting("step_4_delay_hours", parseInt(e.target.value, 10))
                              }
                            >
                              <option value="24">24 hours</option>
                              <option value="48">48 hours</option>
                              <option value="72">72 hours</option>
                            </NativeSelect>
                            <p className="text-[11px] text-muted-foreground/60 mt-1.5">
                              Only sent if the customer hasn&apos;t purchased and isn&apos;t in an active abandoned cart recovery flow.
                            </p>
                          </div>
                        )}

                        {/* Template variables hint */}
                        <p className="text-[11px] text-muted-foreground/50">
                          Variables: {"{event_name}"}, {"{event_date}"}, {"{venue}"}, {"{tickets_live_date}"}, {"{tickets_live_time}"}, {"{first_name}"}, {"{org_name}"}
                        </p>

                        {/* Preview button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPreviewStep(
                              previewStep === stepConfig.step ? null : stepConfig.step,
                            )
                          }
                          className="gap-1.5"
                        >
                          <Eye size={14} />
                          {previewStep === stepConfig.step ? "Hide Preview" : "Preview Email"}
                        </Button>

                        {previewStep === stepConfig.step && (
                          <div className="rounded-lg border border-border overflow-hidden bg-white">
                            <iframe
                              src={`/api/announcement/preview-email?step=${stepConfig.step}${(settings[stepConfig.subjectKey] as string) ? `&subject=${encodeURIComponent(settings[stepConfig.subjectKey] as string)}` : ""}${(settings[stepConfig.headingKey] as string) ? `&heading=${encodeURIComponent(settings[stepConfig.headingKey] as string)}` : ""}${(settings[stepConfig.bodyKey] as string) ? `&body=${encodeURIComponent(settings[stepConfig.bodyKey] as string)}` : ""}`}
                              className="w-full border-0"
                              style={{ height: 600 }}
                              title={`Step ${stepConfig.step} preview`}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Analytics */}
      {stats && (
        <Card className="p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={14} className="text-muted-foreground" />
            <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Analytics
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.total_signups}</div>
              <div className="text-xs text-muted-foreground">Total Signups</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.emails_sent.step_1}</div>
              <div className="text-xs text-muted-foreground">Confirmations Sent</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.emails_sent.step_3}</div>
              <div className="text-xs text-muted-foreground">Tickets Live Sent</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stats.unsubscribed}</div>
              <div className="text-xs text-muted-foreground">Unsubscribed</div>
            </div>
          </div>
        </Card>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
