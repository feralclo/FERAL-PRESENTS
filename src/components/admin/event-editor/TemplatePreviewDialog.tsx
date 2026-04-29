"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminButton } from "@/components/admin/ui";
import { CURRENCY_SYMBOLS } from "./types";
import { isZeroDecimalCurrency } from "@/lib/stripe/config";
import type { EventTemplate } from "@/lib/event-templates";
import type { TierTemplate } from "@/lib/tier-templates";

/**
 * Confirmation dialog shown when a host picks a template from the
 * "From template" menu. Without this, picking a template silently
 * appended N tickets — a "what just happened?" moment for any host
 * with existing tickets.
 *
 * What's editable:
 *   - Each tier's name, price, and capacity (defaults pre-filled from
 *     the template). Almost every host has their own naming and
 *     pricing — "Early bird" might be "Magic Hour Early" or "Wave 1".
 *     Letting them tune at the moment of insert removes a tedious
 *     post-add edit pass.
 *   - Group name (sequential templates only) — "Tickets" might be
 *     "Phases", "Releases", "Waves".
 *
 * What's structural (not editable here):
 *   - How many tiers (you change a 4-tier waterfall to 3 tiers by
 *     deleting a row after add — easier than a +/- on the dialog).
 *   - Release mode (sequential vs all-at-once is an explicit choice
 *     baked into the template; flip it after via the Release Strategy
 *     panel if you change your mind).
 */

export type PendingTemplate =
  | { kind: "event"; template: EventTemplate }
  | { kind: "tier"; template: TierTemplate };

export type TierEdit = {
  name: string;
  price: number;
  capacity: number | null;
};

export type TemplateOverrides = {
  tiers: TierEdit[];
  /** Only set for tier templates that ship with a group_name. */
  groupName?: string;
};

interface Props {
  pending: PendingTemplate | null;
  /** True when there are existing tickets — drives the "kept" reassurance copy. */
  existingTicketCount: number;
  currency: string;
  onCancel: () => void;
  onConfirm: (overrides: TemplateOverrides) => void;
}

/** Pull the editable fields out of a template into a flat list. */
function defaultsFromPending(pending: PendingTemplate | null): {
  tiers: TierEdit[];
  groupName: string;
} {
  if (!pending) return { tiers: [], groupName: "" };
  if (pending.kind === "event") {
    return {
      tiers: pending.template.ticket_types.map((t) => ({
        name: t.name,
        price: t.price,
        capacity: t.capacity ?? null,
      })),
      groupName: "",
    };
  }
  return {
    tiers: pending.template.tiers.map((t) => ({
      name: t.name,
      price: t.price,
      capacity: t.capacity ?? null,
    })),
    groupName: pending.template.group_name ?? "",
  };
}

export function TemplatePreviewDialog({
  pending,
  existingTicketCount,
  currency,
  onCancel,
  onConfirm,
}: Props) {
  const isSequential =
    pending?.kind === "tier" &&
    pending.template.release_mode === "sequential";
  const hasGroup = pending?.kind === "tier" && !!pending.template.group_name;

  // Form state — re-seeded whenever a different template is opened.
  const seed = useMemo(() => defaultsFromPending(pending), [pending]);
  const [tiers, setTiers] = useState<TierEdit[]>(seed.tiers);
  const [groupName, setGroupName] = useState(seed.groupName);

  useEffect(() => {
    setTiers(seed.tiers);
    setGroupName(seed.groupName);
  }, [seed]);

  if (!pending) return null;

  const { template } = pending;
  const currSym = CURRENCY_SYMBOLS[currency] || currency;
  const priceStep = isZeroDecimalCurrency(currency) ? "1" : "0.01";

  const allNamesValid = tiers.every((t) => t.name.trim().length > 0);
  const groupValid = !hasGroup || groupName.trim().length > 0;
  const canSubmit = allNamesValid && groupValid;

  const updateTier = (i: number, patch: Partial<TierEdit>) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm({
      tiers: tiers.map((t) => ({
        name: t.name.trim(),
        price: Number(t.price) || 0,
        capacity:
          t.capacity == null || isNaN(Number(t.capacity))
            ? null
            : Number(t.capacity),
      })),
      groupName: hasGroup ? groupName.trim() : undefined,
    });
  };

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={15} className="text-primary/85" />
            {template.label}
          </DialogTitle>
          <DialogDescription>
            {template.blurb} Edit names, prices, and capacities below — every
            value is yours to tune.
          </DialogDescription>
        </DialogHeader>

        {/* Editable group name (sequential templates) */}
        {hasGroup && (
          <div className="space-y-1.5">
            <Label htmlFor="tpl-group-name" className="text-xs">
              Group name
            </Label>
            <Input
              id="tpl-group-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Phases / Waves / Releases"
            />
          </div>
        )}

        {/* Editable tier rows */}
        <div className="space-y-2 rounded-md border border-border/50 bg-background/40 px-3 py-3">
          {tiers.map((tier, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2"
            >
              {isSequential && (
                <span className="flex h-9 w-6 items-center justify-center font-mono text-xs font-bold tabular-nums text-primary/70 shrink-0">
                  {i + 1}
                </span>
              )}
              <div className="flex-1 min-w-[120px] space-y-1">
                {i === 0 && (
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    Name
                  </Label>
                )}
                <Input
                  value={tier.name}
                  onChange={(e) => updateTier(i, { name: e.target.value })}
                  placeholder="Ticket name"
                  className="h-9 text-sm"
                />
              </div>
              <div className="w-24 space-y-1">
                {i === 0 && (
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    Price ({currSym})
                  </Label>
                )}
                <Input
                  type="number"
                  value={tier.price}
                  onChange={(e) =>
                    updateTier(i, { price: Number(e.target.value) || 0 })
                  }
                  min="0"
                  step={priceStep}
                  className="h-9 text-sm"
                />
              </div>
              <div className="w-24 space-y-1">
                {i === 0 && (
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    Capacity
                  </Label>
                )}
                <Input
                  type="number"
                  value={tier.capacity ?? ""}
                  onChange={(e) =>
                    updateTier(i, {
                      capacity: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="∞"
                  min="0"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          ))}
        </div>

        {/* What this will do */}
        <div className="space-y-1.5 text-xs">
          {isSequential && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowRight size={11} className="text-primary/85" />
              Sequential release — each tier reveals when the previous sells out.
            </p>
          )}
          {!hasGroup && !isSequential && (
            <p className="text-muted-foreground">
              All tickets are added to your General Tickets section, on sale
              at the same time.
            </p>
          )}
          {existingTicketCount > 0 && (
            <p className="rounded-md border border-border/40 bg-foreground/[0.02] px-2.5 py-1.5 text-muted-foreground">
              <span className="text-foreground/85">
                Your {existingTicketCount} existing ticket
                {existingTicketCount === 1 ? "" : "s"} will be kept
              </span>{" "}
              — this only adds new ones.
            </p>
          )}
          {!allNamesValid && (
            <p className="text-destructive">Every tier needs a name.</p>
          )}
        </div>

        <DialogFooter>
          <AdminButton variant="ghost" onClick={onCancel}>
            Cancel
          </AdminButton>
          <AdminButton
            variant="primary"
            leftIcon={<Plus />}
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            Add {tiers.length} ticket{tiers.length === 1 ? "" : "s"}
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
