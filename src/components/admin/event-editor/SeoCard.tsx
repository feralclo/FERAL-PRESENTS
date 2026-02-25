"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateEventSeo, resolveEventSeoTitle, resolveEventSeoDescription } from "@/lib/seo";
import { Search, RotateCcw } from "lucide-react";
import type { Event } from "@/types/events";
import type { UpdateEventFn } from "./types";

interface SeoCardProps {
  event: Event;
  updateEvent: UpdateEventFn;
  orgName: string;
  artistNames: string[];
}

export function SeoCard({ event, updateEvent, orgName, artistNames }: SeoCardProps) {
  const [showOverrides, setShowOverrides] = useState(
    !!(event.seo_title || event.seo_description)
  );

  // Auto-generate SEO from current event data
  const auto = useMemo(
    () => generateEventSeo({ event, orgName, artistNames }),
    [event, orgName, artistNames]
  );

  // Resolve final values (manual override takes priority)
  const finalTitle = resolveEventSeoTitle(event, auto.title);
  const finalDesc = resolveEventSeoDescription(event, auto.description);

  const titleLen = finalTitle.length;
  const descLen = finalDesc.length;

  const titleColor =
    titleLen > 60 ? "text-destructive" : titleLen > 50 ? "text-warning" : "text-success";
  const descColor =
    descLen > 160 ? "text-destructive" : descLen > 140 ? "text-warning" : "text-success";

  const hasOverride = !!(event.seo_title || event.seo_description);

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-6 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="size-3.5 text-muted-foreground" />
            <CardTitle className="text-sm">Search Engine Optimization</CardTitle>
          </div>
          {hasOverride && (
            <Badge variant="outline" className="text-[10px]">
              Custom
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Auto-generated from your event details. Customize below if needed.
        </p>
      </CardHeader>
      <CardContent className="px-6 pb-6 space-y-4">
        {/* Google Preview */}
        <div className="rounded-lg border border-border/50 bg-white p-4 space-y-1">
          <p className="text-[10px] text-muted-foreground/60 mb-2 font-medium">Google Preview</p>
          <p
            className="text-[13px] leading-tight truncate"
            style={{ color: "#1a0dab", fontFamily: "Arial, sans-serif" }}
          >
            {finalTitle}
          </p>
          <p
            className="text-[11px] truncate"
            style={{ color: "#006621", fontFamily: "Arial, sans-serif" }}
          >
            {event.slug ? `yoursite.com/event/${event.slug}` : "yoursite.com/event/..."}
          </p>
          <p
            className="text-[11px] leading-relaxed"
            style={{
              color: "#545454",
              fontFamily: "Arial, sans-serif",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {finalDesc}
          </p>
        </div>

        {/* Character counts */}
        <div className="flex gap-4 text-[10px]">
          <span className={titleColor}>
            Title: {titleLen}/60
          </span>
          <span className={descColor}>
            Description: {descLen}/160
          </span>
        </div>

        {/* Toggle overrides */}
        {!showOverrides ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOverrides(true)}
            className="text-xs h-7"
          >
            Customize meta tags
          </Button>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Meta Title</Label>
                {event.seo_title && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateEvent("seo_title", null)}
                    className="h-5 px-1.5 text-[10px] text-muted-foreground"
                  >
                    <RotateCcw className="size-2.5 mr-1" />
                    Reset to auto
                  </Button>
                )}
              </div>
              <Input
                value={event.seo_title || ""}
                onChange={(e) =>
                  updateEvent("seo_title", e.target.value || null)
                }
                placeholder={auto.title}
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Leave blank to use auto-generated title. Ideal: 50–60 characters.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Meta Description</Label>
                {event.seo_description && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateEvent("seo_description", null)}
                    className="h-5 px-1.5 text-[10px] text-muted-foreground"
                  >
                    <RotateCcw className="size-2.5 mr-1" />
                    Reset to auto
                  </Button>
                )}
              </div>
              <Textarea
                value={event.seo_description || ""}
                onChange={(e) =>
                  updateEvent("seo_description", e.target.value || null)
                }
                placeholder={auto.description}
                rows={3}
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Leave blank to use auto-generated description. Ideal: 140–160 characters.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
