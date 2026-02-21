"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Loader2, Save, RotateCcw, Plus, Trash2 } from "lucide-react";
import type { PlatformXPConfig } from "@/types/reps";
import { DEFAULT_PLATFORM_XP_CONFIG } from "@/types/reps";

export function PlatformXPTab() {
  const [config, setConfig] = useState<PlatformXPConfig>(DEFAULT_PLATFORM_XP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/xp-config");
      const json = await res.json();
      if (json.data) setConfig({ ...DEFAULT_PLATFORM_XP_CONFIG, ...json.data });
    } catch { /* network */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/platform/xp-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch { /* network */ }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-primary/60" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setConfig(DEFAULT_PLATFORM_XP_CONFIG)}>
          <RotateCcw size={14} /> Reset Defaults
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Save size={14} className="text-success" /> : <Save size={14} />}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Config"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales XP */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Sales XP</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>XP per Ticket Sold</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[config.xp_per_sale]}
                  onValueChange={([v]) => setConfig((c) => ({ ...c, xp_per_sale: v }))}
                  min={1}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="font-mono text-sm font-bold text-primary w-10 text-right tabular-nums">{config.xp_per_sale}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">XP awarded to the rep for each ticket sold via their link</p>
            </div>
          </CardContent>
        </Card>

        {/* Quest XP */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Quest XP</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {(["social_post", "story_share", "content_creation", "custom"] as const).map((type) => (
              <div key={type} className="flex items-center justify-between gap-4">
                <Label className="text-xs capitalize whitespace-nowrap">{type.replace(/_/g, " ")}</Label>
                <Input
                  type="number"
                  value={String(config.xp_per_quest_type[type])}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      xp_per_quest_type: { ...c.xp_per_quest_type, [type]: Number(e.target.value) || 0 },
                    }))
                  }
                  min="0"
                  className="w-24 text-right font-mono"
                />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">XP auto-assigned to quests based on their type</p>
          </CardContent>
        </Card>

        {/* Position XP */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Position XP (Leaderboard)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((pos) => (
              <div key={pos} className="flex items-center justify-between gap-4">
                <Label className="text-xs whitespace-nowrap">
                  {pos === 1 ? "1st Place" : pos === 2 ? "2nd Place" : "3rd Place"}
                </Label>
                <Input
                  type="number"
                  value={String(config.position_xp[pos] ?? 0)}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      position_xp: { ...c.position_xp, [pos]: Number(e.target.value) || 0 },
                    }))
                  }
                  min="0"
                  className="w-24 text-right font-mono"
                />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Default XP pre-filled when setting up event position rewards</p>
          </CardContent>
        </Card>

        {/* Levels */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Levels</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {config.level_names.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-mono w-5 text-right shrink-0">{i + 1}</span>
                  <Input
                    value={name}
                    onChange={(e) => {
                      const names = [...config.level_names];
                      names[i] = e.target.value;
                      setConfig((c) => ({ ...c, level_names: names }));
                    }}
                    placeholder={`Level ${i + 1}`}
                    className="flex-1 text-sm"
                  />
                  {i > 0 ? (
                    <Input
                      type="number"
                      value={String(config.level_thresholds[i - 1] ?? 0)}
                      onChange={(e) => {
                        const thresholds = [...config.level_thresholds];
                        thresholds[i - 1] = Number(e.target.value) || 0;
                        setConfig((c) => ({ ...c, level_thresholds: thresholds }));
                      }}
                      min="0"
                      placeholder="XP"
                      className="w-24 text-right font-mono"
                    />
                  ) : (
                    <span className="w-24 text-right text-[11px] text-muted-foreground font-mono">0 XP</span>
                  )}
                  {i >= 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const names = config.level_names.filter((_, j) => j !== i);
                        const thresholds = config.level_thresholds.filter((_, j) => j !== i - 1);
                        setConfig((c) => ({ ...c, level_names: names, level_thresholds: thresholds }));
                      }}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const lastThreshold = config.level_thresholds[config.level_thresholds.length - 1] ?? 0;
                setConfig((c) => ({
                  ...c,
                  level_names: [...c.level_names, `Level ${c.level_names.length + 1}`],
                  level_thresholds: [...c.level_thresholds, lastThreshold + 2000],
                }));
              }}
            >
              <Plus size={14} /> Add Level
            </Button>
            <p className="text-[11px] text-muted-foreground">Thresholds are cumulative XP required to reach each level. Level 1 starts at 0.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
