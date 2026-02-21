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
import { Loader2, Save, RotateCcw, Info } from "lucide-react";
import type { RepProgramSettings } from "@/types/reps";
import { DEFAULT_REP_PROGRAM_SETTINGS } from "@/types/reps";

export function SettingsTab() {
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
      // Only send tenant-controlled fields
      const payload: Partial<RepProgramSettings> = {
        enabled: settings.enabled,
        auto_approve: settings.auto_approve,
        leaderboard_visible: settings.leaderboard_visible,
        default_discount_percent: settings.default_discount_percent,
        default_discount_type: settings.default_discount_type,
        welcome_message: settings.welcome_message,
        email_from_name: settings.email_from_name,
        email_from_address: settings.email_from_address,
        currency_per_sale: settings.currency_per_sale,
        currency_name: settings.currency_name,
      };
      const res = await fetch("/api/reps/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch { /* network */ }
    setSaving(false);
  };

  const update = <K extends keyof RepProgramSettings>(key: K, value: RepProgramSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-primary/60" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setSettings(DEFAULT_REP_PROGRAM_SETTINGS)}>
          <RotateCcw size={14} /> Reset
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Save size={14} className="text-success" /> : <Save size={14} />}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">General</CardTitle></CardHeader>
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

        {/* XP info card — replaces old Points & Levels card */}
        <Card>
          <CardHeader><CardTitle className="text-sm">XP & Levels</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 rounded-lg bg-primary/5 border border-primary/10 p-4">
              <Info size={16} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Managed at the platform level</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  XP rates, level thresholds, and level names are controlled via the Platform tab to ensure consistency across all tenants.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Currency</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Currency Name</Label>
              <Input value={settings.currency_name} onChange={(e) => update("currency_name", e.target.value)} placeholder="FRL" />
              <p className="text-[11px] text-muted-foreground">The spendable currency name shown to reps (e.g. &quot;FRL&quot;)</p>
            </div>
            <div className="space-y-2">
              <Label>Currency per Sale (per ticket)</Label>
              <div className="flex items-center gap-3">
                <Slider value={[settings.currency_per_sale]} onValueChange={([v]) => update("currency_per_sale", v)} min={1} max={100} step={1} className="flex-1" />
                <span className="font-mono text-sm font-bold text-amber-400 w-10 text-right tabular-nums">{settings.currency_per_sale}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Discount Code Defaults</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Type</Label>
                <Select value={settings.default_discount_type} onValueChange={(v) => update("default_discount_type", v as "percentage" | "fixed")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (&pound;)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Value</Label>
                <Input type="number" value={String(settings.default_discount_percent)} onChange={(e) => update("default_discount_percent", Number(e.target.value) || 0)} min="0" max={settings.default_discount_type === "percentage" ? "100" : undefined} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Email Settings</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input value={settings.email_from_name} onChange={(e) => update("email_from_name", e.target.value)} placeholder="Entry Reps" />
            </div>
            <div className="space-y-2">
              <Label>From Address</Label>
              <Input type="email" value={settings.email_from_address} onChange={(e) => update("email_from_address", e.target.value)} placeholder="reps@yourdomain.com" />
            </div>
            <div className="space-y-2">
              <Label>Welcome Message</Label>
              <Textarea value={settings.welcome_message || ""} onChange={(e) => update("welcome_message", e.target.value || null)} placeholder="Custom welcome message shown on the signup page..." rows={3} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
