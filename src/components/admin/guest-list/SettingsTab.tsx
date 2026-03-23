"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface SettingsTabProps {
  orgId: string;
}

interface GuestListSettings {
  auto_approve: boolean;
  auto_approve_submissions: boolean;
}

const DEFAULTS: GuestListSettings = {
  auto_approve: true,
  auto_approve_submissions: false,
};

export function SettingsTab({ orgId }: SettingsTabProps) {
  const [settings, setSettings] = useState<GuestListSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/settings?key=${orgId}_guest_list_settings`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setSettings({ ...DEFAULTS, ...json.data });
          }
        }
      } catch { /* use defaults */ }
      setLoading(false);
    }
    load();
  }, [orgId]);

  const handleToggle = async (field: keyof GuestListSettings, checked: boolean) => {
    const updated = { ...settings, [field]: checked };
    setSettings(updated);
    setSaving(field);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `${orgId}_guest_list_settings`,
          data: updated,
        }),
      });
    } catch { /* silent */ }
    setSaving(null);
  };

  if (loading) {
    return (
      <Card className="py-0 gap-0">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-primary/60" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="py-0 gap-0">
        <CardHeader className="pb-0 pt-5 px-6">
          <CardTitle className="text-sm">Approval Settings</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-6">
          {/* Guest invitations */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Auto-approve guest RSVPs</Label>
              <p className="text-xs text-muted-foreground">
                When a guest confirms their RSVP, automatically issue their ticket. When off, you'll approve each guest manually.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              {saving === "auto_approve" && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
              <Switch checked={settings.auto_approve} onCheckedChange={(c) => handleToggle("auto_approve", c)} />
            </div>
          </div>

          <div className="h-px bg-border/40" />

          {/* Artist submissions */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Auto-invite artist submissions</Label>
              <p className="text-xs text-muted-foreground">
                When an artist submits names via their link, automatically send invite emails to guests with email addresses. When off, submissions wait for your approval.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              {saving === "auto_approve_submissions" && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
              <Switch checked={settings.auto_approve_submissions} onCheckedChange={(c) => handleToggle("auto_approve_submissions", c)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
