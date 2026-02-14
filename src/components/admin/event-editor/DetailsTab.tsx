"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import type { TabProps } from "./types";

export function DetailsTab({ event, updateEvent }: TabProps) {
  return (
    <div className="space-y-6">
      {/* Event Details */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Event Details</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Event Name *</Label>
              <Input
                value={event.name}
                onChange={(e) => updateEvent("name", e.target.value)}
                placeholder="e.g. Summer Rave June"
              />
            </div>
            <div className="space-y-2">
              <Label>URL Slug</Label>
              <Input
                value={event.slug}
                onChange={(e) => updateEvent("slug", e.target.value)}
                placeholder="summer-rave-june-2026"
              />
              <p className="text-[10px] text-muted-foreground/60">
                /event/{event.slug}/
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={event.description || ""}
              onChange={(e) => updateEvent("description", e.target.value)}
              placeholder="Event description..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Date & Time */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Date & Time</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Event Start *</Label>
              <Input
                type="datetime-local"
                value={toDatetimeLocal(event.date_start)}
                onChange={(e) =>
                  updateEvent(
                    "date_start",
                    fromDatetimeLocal(e.target.value) || event.date_start
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Event End</Label>
              <Input
                type="datetime-local"
                value={toDatetimeLocal(event.date_end)}
                onChange={(e) =>
                  updateEvent("date_end", fromDatetimeLocal(e.target.value))
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Doors Open</Label>
              <Input
                type="datetime-local"
                value={toDatetimeLocal(event.doors_open)}
                onChange={(e) =>
                  updateEvent("doors_open", fromDatetimeLocal(e.target.value))
                }
              />
            </div>
            <div />
          </div>
        </CardContent>
      </Card>

      {/* Venue */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Venue</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Venue Name</Label>
              <Input
                value={event.venue_name || ""}
                onChange={(e) => updateEvent("venue_name", e.target.value)}
                placeholder="e.g. Invisible Wind Factory"
              />
            </div>
            <div className="space-y-2">
              <Label>Venue Address</Label>
              <Input
                value={event.venue_address || ""}
                onChange={(e) => updateEvent("venue_address", e.target.value)}
                placeholder="e.g. 3 Regent Rd, Liverpool"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={event.city || ""}
                onChange={(e) => updateEvent("city", e.target.value)}
                placeholder="e.g. Liverpool"
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input
                value={event.country || ""}
                onChange={(e) => updateEvent("country", e.target.value)}
                placeholder="e.g. UK"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Capacity</Label>
              <Input
                type="number"
                value={event.capacity ?? ""}
                onChange={(e) =>
                  updateEvent(
                    "capacity",
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="e.g. 500"
              />
            </div>
            <div className="space-y-2">
              <Label>Age Restriction</Label>
              <Input
                value={event.age_restriction || ""}
                onChange={(e) =>
                  updateEvent("age_restriction", e.target.value)
                }
                placeholder="e.g. 18+"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
