"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminButton } from "@/components/admin/ui";
import type { CampaignSummary } from "@/types/library-campaigns";

interface CampaignActionsProps {
  campaign: CampaignSummary;
  onChanged: (action: "renamed" | "deleted") => void;
}

/**
 * Header-action bar — Rename + Delete, both opening focused dialogs.
 * Delete is destructive variant; rename pre-fills the current label.
 *
 * The DELETE flow honours the linked-quest gate from the API: if any
 * quest references this campaign, the dialog explains that and offers
 * a deep-link to the linked quests rather than a destructive override.
 */
export function CampaignActions({
  campaign,
  onChanged,
}: CampaignActionsProps) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex gap-2 shrink-0">
      <AdminButton
        variant="outline"
        size="sm"
        leftIcon={<Pencil className="h-3.5 w-3.5" />}
        onClick={() => setRenaming(true)}
      >
        Rename
      </AdminButton>
      <AdminButton
        variant="ghost"
        size="sm"
        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
        onClick={() => setDeleting(true)}
      >
        Delete
      </AdminButton>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        campaign={campaign}
        onRenamed={() => {
          setRenaming(false);
          onChanged("renamed");
        }}
      />

      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        campaign={campaign}
        onDeleted={() => {
          setDeleting(false);
          onChanged("deleted");
        }}
      />
    </div>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  campaign,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: CampaignSummary;
  onRenamed: () => void;
}) {
  const [label, setLabel] = useState(campaign.label);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/media/campaigns/${encodeURIComponent(campaign.tag)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't rename");
        setSubmitting(false);
        return;
      }
      onRenamed();
      setSubmitting(false);
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Rename campaign</DialogTitle>
        <DialogDescription>
          Updates every linked quest at the same time.
        </DialogDescription>
        <form onSubmit={submit} className="space-y-4 mt-3">
          <input
            type="text"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2"
          />
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
              disabled={submitting || !label.trim()}
            >
              Save
            </AdminButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  campaign,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: CampaignSummary;
  onDeleted: () => void;
}) {
  const [cascade, setCascade] = useState<"move" | "delete">("move");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [linkedQuests, setLinkedQuests] = useState<
    { id: string; title: string }[] | null
  >(null);

  const isBlocked = campaign.linked_quest_count > 0;

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/media/campaigns/${encodeURIComponent(campaign.tag)}?cascade=${cascade}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "campaign_has_linked_quests") {
          setLinkedQuests(json.linked_quests ?? []);
          setError("Quests still pull from this campaign.");
        } else {
          setError(json.error ?? "Couldn't delete");
        }
        setSubmitting(false);
        return;
      }
      onDeleted();
      setSubmitting(false);
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Delete campaign</DialogTitle>

        {isBlocked ? (
          <div className="space-y-3 mt-2">
            <DialogDescription>
              {campaign.linked_quest_count}{" "}
              {campaign.linked_quest_count === 1 ? "quest" : "quests"} still
              pull from this campaign. Update them first to delete it.
            </DialogDescription>
            {linkedQuests && linkedQuests.length > 0 && (
              <ul className="text-xs text-foreground/70 space-y-1">
                {linkedQuests.map((q) => (
                  <li key={q.id}>· {q.title}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <AdminButton variant="ghost" onClick={() => onOpenChange(false)}>
                Got it
              </AdminButton>
            </div>
          </div>
        ) : (
          <>
            <DialogDescription>
              {campaign.asset_count > 0
                ? `${campaign.asset_count} ${campaign.asset_count === 1 ? "asset" : "assets"} in this campaign.`
                : "This campaign has no assets."}
            </DialogDescription>

            {campaign.asset_count > 0 && (
              <fieldset className="mt-3 space-y-2">
                <RadioRow
                  active={cascade === "move"}
                  onClick={() => setCascade("move")}
                  title="Move assets to All assets"
                  hint="Keep the files; just remove the campaign label."
                />
                <RadioRow
                  active={cascade === "delete"}
                  onClick={() => setCascade("delete")}
                  title="Delete the assets too"
                  hint="Remove the files from the library entirely."
                />
              </fieldset>
            )}

            {error && (
              <p className="mt-3 text-xs text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end mt-4">
              <AdminButton
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </AdminButton>
              <AdminButton
                type="button"
                variant="destructive"
                loading={submitting}
                onClick={submit}
              >
                Delete campaign
              </AdminButton>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RadioRow({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full text-left rounded-md border px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary/60 focus-visible:outline-offset-2 " +
        (active
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-border/40 hover:border-border")
      }
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-foreground/60 mt-0.5">{hint}</p>
    </button>
  );
}
