"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, RotateCcw } from "lucide-react";
import type { RepProgramSettings } from "@/types/reps";
import { DEFAULT_REP_PROGRAM_SETTINGS } from "@/types/reps";

export default function RepSettingsPage() {
  const [settings, setSettings] = useState<RepProgramSettings>(DEFAULT_REP_PROGRAM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reps/settings");
      const json = await res.json();
      if (json.data) setSettings({ ...DEFAULT_REP_PROGRAM_SETTINGS, ...json.data });
    } catch { /* network */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/reps/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch { /* network */ }
    setSaving(false);
  };

  const update = <K extends keyof RepProgramSettings>(key: K, value: RepProgramSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-primary/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            Rep Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your rep programme behaviour and defaults
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettings(DEFAULT_REP_PROGRAM_SETTINGS)}
          >
            <RotateCcw size={14} /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Save size={14} className="text-success" /> : <Save size={14} />}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Programme Enabled</p>
                <p className="text-[11px] text-muted-foreground">Accept applications and track sales</p>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={(v) => update("enabled", v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-Approve Applications</p>
                <p className="text-[11px] text-muted-foreground">Skip manual review for new signups</p>
              </div>
              <Switch checked={settings.auto_approve} onCheckedChange={(v) => update("auto_approve", v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Leaderboard Visible</p>
                <p className="text-[11px] text-muted-foreground">Reps can see the full leaderboard</p>
              </div>
              <Switch checked={settings.leaderboard_visible} onCheckedChange={(v) => update("leaderboard_visible", v)} />
            </div>
          </CardContent>
        </Card>

        {/* Points */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Points & Levels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Points per Sale (per ticket)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[settings.points_per_sale]}
                  onValueChange={([v]) => update("points_per_sale", v)}
                  min={1}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="font-mono text-sm font-bold text-primary w-10 text-right tabular-nums">
                  {settings.points_per_sale}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Level Names (comma-separated)</Label>
              <Input
                value={settings.level_names.join(", ")}
                onChange={(e) =>
                  update(
                    "level_names",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="Rookie, Starter, Rising, ..."
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Level Thresholds (comma-separated points)</Label>
              <Input
                value={settings.level_thresholds.join(", ")}
                onChange={(e) =>
                  update(
                    "level_thresholds",
                    e.target.value
                      .split(",")
                      .map((s) => Number(s.trim()))
                      .filter((n) => !isNaN(n) && n > 0)
                  )
                }
                placeholder="100, 300, 600, ..."
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                L1 starts at 0 points. Each value is the threshold for the next level.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Discount Defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Discount Code Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Type</Label>
                <Select
                  value={settings.default_discount_type}
                  onValueChange={(v) => update("default_discount_type", v as "percentage" | "fixed")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Value</Label>
                <Input
                  type="number"
                  value={String(settings.default_discount_percent)}
                  onChange={(e) => update("default_discount_percent", Number(e.target.value) || 0)}
                  min="0"
                  max={settings.default_discount_type === "percentage" ? "100" : undefined}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Email Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input
                value={settings.email_from_name}
                onChange={(e) => update("email_from_name", e.target.value)}
                placeholder="Entry Reps"
              />
            </div>
            <div className="space-y-2">
              <Label>From Address</Label>
              <Input
                type="email"
                value={settings.email_from_address}
                onChange={(e) => update("email_from_address", e.target.value)}
                placeholder="reps@yourdomain.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Welcome Message</Label>
              <Textarea
                value={settings.welcome_message || ""}
                onChange={(e) => update("welcome_message", e.target.value || null)}
                placeholder="Custom welcome message shown on the signup page..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
