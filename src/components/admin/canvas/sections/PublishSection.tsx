"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Slider } from "@/components/ui/slider";
import { Users } from "lucide-react";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { SeoCard } from "@/components/admin/event-editor/SeoCard";
import type { TabWithSettingsProps } from "@/components/admin/event-editor/types";

interface PublishSectionProps extends TabWithSettingsProps {
  artistNames?: string[];
  /** Used to render the org_name in SEO previews. */
  orgName?: string;
  /** Mobile-experience toggle (sticky checkout bar) — folds in here so the
   *  Money section stays focused on payments alone. */
}

/**
 * Publish — visibility, status, announcement / queue staging, mobile
 * experience, SEO. The "make this real to the world" beat. The Publish
 * primary action lives in the right rail; this section holds the
 * configuration that backs it.
 */
export function PublishSection({
  event,
  updateEvent,
  settings,
  updateSetting,
  artistNames = [],
  orgName = "Entry",
}: PublishSectionProps) {
  const { timezone } = useOrgTimezone();
  const [signupCount, setSignupCount] = useState<number | null>(null);

  useEffect(() => {
    if (!event.tickets_live_at || !event.id) {
      setSignupCount(null);
      return;
    }
    fetch(`/api/announcement/signups?event_id=${event.id}&count_only=true`)
      .then((res) => res.json())
      .then((json) => {
        if (typeof json.count === "number") setSignupCount(json.count);
      })
      .catch(() => {});
  }, [event.tickets_live_at, event.id]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={event.status}
            onValueChange={(v) => updateEvent("status", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="past">Past</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground/70">
            Use Publish in the right rail for going live. This dropdown is
            for advanced cases (cancelled, archived).
          </p>
        </div>
        <div className="space-y-2">
          <Label>Visibility</Label>
          <Select
            value={event.visibility}
            onValueChange={(v) => updateEvent("visibility", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private (secret link)</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Schedule ticket release — top-level toggle, sibling to Hype queue.
          Both default off, both expand inline when enabled. They're
          independent product tactics — you can run a hype queue on a
          go-live event without scheduling a delayed release, and you
          can schedule a release without theatrics. */}
      <div className="border-t border-border/40 pt-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label className="text-sm font-medium">Schedule ticket release</Label>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Set a future date when tickets become available. Until then,
              visitors see a sign-up page instead.
            </p>
          </div>
          <Switch
            checked={!!event.tickets_live_at}
            onCheckedChange={(checked) => {
              if (checked) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(12, 0, 0, 0);
                const y = tomorrow.getFullYear();
                const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
                const d = String(tomorrow.getDate()).padStart(2, "0");
                updateEvent("tickets_live_at", `${y}-${m}-${d}T12:00`);
              } else {
                updateEvent("tickets_live_at", null);
                updateEvent("announcement_title", null);
                updateEvent("announcement_subtitle", null);
              }
            }}
          />
        </div>

        {event.tickets_live_at && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label>Tickets on sale</Label>
              <DateTimePicker
                value={event.tickets_live_at || ""}
                onChange={(v) => updateEvent("tickets_live_at", v)}
                placeholder="Select date and time"
                timezone={timezone}
                showTimezone
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Announcement title</Label>
                <Input
                  value={event.announcement_title || ""}
                  onChange={(e) =>
                    updateEvent("announcement_title", e.target.value || null)
                  }
                  placeholder="Coming Soon"
                />
              </div>
              <div className="space-y-2">
                <Label>Announcement subtitle</Label>
                <Textarea
                  value={event.announcement_subtitle || ""}
                  onChange={(e) =>
                    updateEvent(
                      "announcement_subtitle",
                      e.target.value || null
                    )
                  }
                  placeholder="Sign up to be the first to know when tickets drop."
                  rows={2}
                />
              </div>
            </div>
            {signupCount !== null && signupCount > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2">
                <Users className="size-3.5 text-primary" />
                <span className="text-xs text-foreground">
                  {signupCount}{" "}
                  {signupCount === 1 ? "person" : "people"} signed up
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/40 pt-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label className="text-sm font-medium">Hype queue</Label>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              A countdown queue when buyers try to checkout — builds urgency
              before the buying experience.
            </p>
          </div>
          <Switch
            checked={!!event.queue_enabled}
            onCheckedChange={(checked) => {
              updateEvent("queue_enabled", checked);
              if (checked && !event.queue_duration_seconds) {
                updateEvent("queue_duration_seconds", 45);
              }
              if (checked && !event.queue_window_minutes) {
                updateEvent("queue_window_minutes", 60);
              }
            }}
          />
        </div>

        {event.queue_enabled && (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label>
                Queue duration:{" "}
                <span className="font-normal text-muted-foreground">
                  {event.queue_duration_seconds ?? 45}s
                </span>
              </Label>
              <Slider
                value={[event.queue_duration_seconds ?? 45]}
                onValueChange={([v]) =>
                  updateEvent("queue_duration_seconds", v)
                }
                min={15}
                max={120}
                step={5}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Queue title</Label>
                <Input
                  value={event.queue_title || ""}
                  onChange={(e) =>
                    updateEvent("queue_title", e.target.value || null)
                  }
                  placeholder="You're in the queue"
                />
              </div>
              <div className="space-y-2">
                <Label>Queue subtitle</Label>
                <Input
                  value={event.queue_subtitle || ""}
                  onChange={(e) =>
                    updateEvent("queue_subtitle", e.target.value || null)
                  }
                  placeholder="Securing your spot"
                />
              </div>
            </div>
            <div className="space-y-2 max-w-[220px]">
              <Label>Active window (minutes)</Label>
              <Input
                type="number"
                value={event.queue_window_minutes ?? 60}
                onChange={(e) =>
                  updateEvent(
                    "queue_window_minutes",
                    Math.max(15, Math.min(120, Number(e.target.value) || 60))
                  )
                }
                min={15}
                max={120}
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border/40 pt-5">
        <SeoCard
          event={event}
          updateEvent={updateEvent}
          orgName={orgName}
          artistNames={artistNames}
        />
      </div>
    </div>
  );
}
