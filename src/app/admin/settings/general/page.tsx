"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOrgId } from "@/components/OrgProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings, Save, Loader2 } from "lucide-react";

interface OrgSettings {
  org_name: string;
  timezone: string;
  support_email: string;
}

const DEFAULT_SETTINGS: OrgSettings = {
  org_name: "",
  timezone: "Europe/London",
  support_email: "",
};

const TIMEZONES = [
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function GeneralSettings() {
  const orgId = useOrgId();
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/settings?key=${orgId}_general`);
        if (res.ok) {
          const { data } = await res.json();
          if (data) {
            setSettings({ ...DEFAULT_SETTINGS, ...data });
          }
        }
      } catch {
        // Settings may not exist yet — use defaults
      }
    })();
  }, [orgId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `${orgId}_general`,
          data: settings,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setStatus("Settings saved");
    } catch {
      setStatus("Error saving settings");
    } finally {
      setSaving(false);
    }
  }, [settings, orgId]);

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <Settings size={20} className="text-primary" />
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
            General Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organisation settings and preferences
          </p>
        </div>
      </div>

      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Organisation
        </h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organisation Name</Label>
            <Input
              id="org-name"
              value={settings.org_name}
              onChange={(e) =>
                setSettings((s) => ({ ...s, org_name: e.target.value }))
              }
              placeholder="e.g. My Events Co"
            />
            <p className="text-xs text-muted-foreground">
              Displayed in emails, receipts, and the admin sidebar
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-email">Support Email</Label>
            <Input
              id="support-email"
              type="email"
              value={settings.support_email}
              onChange={(e) =>
                setSettings((s) => ({ ...s, support_email: e.target.value }))
              }
              placeholder="e.g. hello@yourdomain.com"
            />
            <p className="text-xs text-muted-foreground">
              Shown in confirmation emails and on event pages
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              value={settings.timezone}
              onChange={(e) =>
                setSettings((s) => ({ ...s, timezone: e.target.value }))
              }
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used for event times and scheduled automations
            </p>
          </div>
        </div>
      </Card>

      <Separator />

      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Platform Info
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Platform</span>
            <span className="text-foreground">Entry</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Org ID</span>
            <span className="font-mono text-foreground">{orgId}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Framework</span>
            <span className="text-foreground">Next.js (App Router)</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Database</span>
            <span className="text-foreground">Supabase (PostgreSQL)</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Payments</span>
            <span className="text-foreground">Stripe (Connect)</span>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save Settings
        </Button>
        {status && (
          <span
            className={`text-sm ${
              status.includes("Error") ? "text-destructive" : "text-success"
            }`}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
