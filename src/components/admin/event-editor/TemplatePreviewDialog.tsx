"use client";

import { ArrowRight, Plus, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AdminButton } from "@/components/admin/ui";
import { formatPrice } from "@/lib/stripe/config";
import type { EventTemplate } from "@/lib/event-templates";
import type { TierTemplate } from "@/lib/tier-templates";

/**
 * Confirmation dialog shown when a host picks a template from the
 * "From template" menu. Without this, picking a template silently appended
 * 4 tickets + a new group + flipped sequential mode — a "what just
 * happened?" moment for any host with existing tickets.
 *
 * The dialog is the same shape for event templates and tier templates.
 * It only shows what's *about to be added* — never replaces what's
 * already there. The "Existing tickets will be kept" line is non-
 * negotiable; it removes the only real fear the host could have at this
 * moment.
 */

export type PendingTemplate =
  | { kind: "event"; template: EventTemplate }
  | { kind: "tier"; template: TierTemplate };

interface Props {
  pending: PendingTemplate | null;
  /** True when there are existing tickets — drives the "kept" reassurance copy. */
  existingTicketCount: number;
  currency: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TemplatePreviewDialog({
  pending,
  existingTicketCount,
  currency,
  onCancel,
  onConfirm,
}: Props) {
  if (!pending) return null;

  const { kind, template } = pending;
  const tiers =
    kind === "event"
      ? template.ticket_types.map((t) => ({
          name: t.name,
          description: t.description,
          price: t.price,
          capacity: t.capacity ?? null,
        }))
      : template.tiers.map((t) => ({
          name: t.name,
          description: t.description,
          price: t.price,
          capacity: t.capacity ?? null,
        }));

  const groupName = kind === "tier" ? template.group_name : undefined;
  const isSequential =
    kind === "tier" && template.release_mode === "sequential";

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={15} className="text-primary/85" />
            Add &ldquo;{template.label}&rdquo;
          </DialogTitle>
          <DialogDescription>
            {template.blurb}
          </DialogDescription>
        </DialogHeader>

        {/* Tier list */}
        <ul className="space-y-1.5 rounded-md border border-border/50 bg-background/40 px-3 py-3">
          {tiers.map((t, i) => (
            <li
              key={`${t.name}-${i}`}
              className="flex items-baseline gap-3"
            >
              {isSequential && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold tabular-nums text-primary shrink-0">
                  {i + 1}
                </span>
              )}
              <span className="flex-1 truncate text-xs text-foreground">
                {t.name}
              </span>
              {t.capacity != null && (
                <span className="font-mono tabular-nums text-[10px] text-muted-foreground/70 shrink-0">
                  cap {t.capacity}
                </span>
              )}
              <span className="font-mono tabular-nums text-[11px] text-foreground/85 shrink-0">
                {formatPrice(t.price, currency)}
              </span>
            </li>
          ))}
        </ul>

        {/* Where it'll go */}
        <div className="space-y-1.5 text-xs">
          {groupName && (
            <p className="text-muted-foreground">
              <span className="text-foreground/85">Adds to a new group: </span>
              <span className="font-mono uppercase tracking-wider text-foreground">
                {groupName}
              </span>
            </p>
          )}
          {isSequential && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowRight size={11} className="text-primary/85" />
              Sequential release — each tier reveals when the previous sells out.
            </p>
          )}
          {!groupName && !isSequential && (
            <p className="text-muted-foreground">
              All tickets are added to your General Tickets section, on sale at the same time.
            </p>
          )}
          {existingTicketCount > 0 && (
            <p className="rounded-md border border-border/40 bg-foreground/[0.02] px-2.5 py-1.5 text-muted-foreground">
              <span className="text-foreground/85">Your {existingTicketCount} existing ticket{existingTicketCount === 1 ? "" : "s"} will be kept</span>{" "}
              — this only adds new ones.
            </p>
          )}
        </div>

        <DialogFooter>
          <AdminButton variant="ghost" onClick={onCancel}>
            Cancel
          </AdminButton>
          <AdminButton variant="primary" leftIcon={<Plus />} onClick={onConfirm}>
            Add {tiers.length} ticket{tiers.length === 1 ? "" : "s"}
          </AdminButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
