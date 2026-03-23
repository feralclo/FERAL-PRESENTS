"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface SettingsTabProps {
  orgId: string;
}

export function SettingsTab({ orgId }: SettingsTabProps) {
  const [autoApprove, setAutoApprove] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/settings?key=${orgId}_guest_list_settings`);
        if (res.ok) {
          const json = await res.json();
          if (json.data?.auto_approve !== undefined) {
            setAutoApprove(json.data.auto_approve);
          }
        }
      } catch { /* use defaults */ }
      setLoading(false);
    }
    load();
  }, [orgId]);

  const handleToggle = async (checked: boolean) => {
    setAutoApprove(checked);
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `${orgId}_guest_list_settings`,
          data: { auto_approve: checked },
        }),
      });
    } catch { /* silent */ }
    setSaving(false);
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
          <CardTitle className="text-sm">Guest List Settings</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Auto-approve on RSVP</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, guests who confirm their RSVP are automatically issued a ticket. When disabled, you'll need to manually approve each guest.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saving && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
              <Switch checked={autoApprove} onCheckedChange={handleToggle} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
