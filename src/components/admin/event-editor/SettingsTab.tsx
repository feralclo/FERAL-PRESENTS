"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TabProps } from "./types";

export function SettingsTab({ event, updateEvent }: TabProps) {
  return (
    <div className="space-y-6">
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Status & Visibility</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
                value={event.status}
                onChange={(e) => updateEvent("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="past">Past</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
                value={event.visibility}
                onChange={(e) => updateEvent("visibility", e.target.value)}
              >
                <option value="public">Public</option>
                <option value="private">Private (Secret Link)</option>
                <option value="unlisted">Unlisted</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Payment & Currency</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
                value={event.payment_method}
                onChange={(e) => updateEvent("payment_method", e.target.value)}
              >
                <option value="test">Test (Simulated)</option>
                <option value="stripe">Stripe</option>
                <option value="weeztix">WeeZTix (External)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm transition-colors focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
                value={event.currency}
                onChange={(e) => updateEvent("currency", e.target.value)}
              >
                <option value="GBP">GBP (£)</option>
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          {event.payment_method === "stripe" && (
            <div className="rounded-md border border-success/10 bg-success/5 p-3">
              <p className="text-xs text-muted-foreground">
                Payments are handled automatically via your{" "}
                <Link
                  href="/admin/payments/"
                  className="text-primary hover:underline"
                >
                  Payment Settings
                </Link>
                . Make sure your payment setup is complete before going live.
              </p>
            </div>
          )}

          {event.payment_method === "stripe" && (
            <div className="space-y-2">
              <Label>Platform Fee (%)</Label>
              <Input
                type="number"
                value={event.platform_fee_percent ?? 5}
                onChange={(e) =>
                  updateEvent(
                    "platform_fee_percent",
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                min="0"
                max="100"
                step="0.5"
                className="max-w-[120px]"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Platform fee applied on each transaction. Default: 5%
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
