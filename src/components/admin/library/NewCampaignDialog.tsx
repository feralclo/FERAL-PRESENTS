"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AdminButton } from "@/components/admin/ui";
import { slugifyCampaignLabel } from "@/lib/library/campaign-tag";

interface NewCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the freshly-created campaign tag once the API succeeds. */
  onCreated: (tag: string) => void;
}

/**
 * Single-input dialog: a name. Slug is auto-derived; the user never sees
 * "tag" or "slug" terminology — just a hint with the URL preview so they
 * understand what they're naming.
 */
export function NewCampaignDialog({
  open,
  onOpenChange,
  onCreated,
}: NewCampaignDialogProps) {
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const slug = slugifyCampaignLabel(label);

  const reset = () => {
    setLabel("");
    setError("");
    setSubmitting(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) {
      setError("Pick a name with at least one letter or number.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/media/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't create the campaign.");
        setSubmitting(false);
        return;
      }
      onCreated(json.data.tag);
      onOpenChange(false);
      reset();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle>New campaign</DialogTitle>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label
              htmlFor="campaign-label"
              className="block text-[13px] font-medium text-foreground"
            >
              Name
            </label>
            <input
              id="campaign-label"
              type="text"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Only Numbers — Spring 26"
              maxLength={80}
              className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground placeholder:text-foreground/40 focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
            />
            <p className="text-xs text-foreground/55 min-h-4">
              {slug
                ? "We'll save this as a campaign you can assign to quests."
                : "Pick something descriptive — your reps see it inside their quest."}
            </p>
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <AdminButton
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={!slug || submitting}
            >
              Create
            </AdminButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
