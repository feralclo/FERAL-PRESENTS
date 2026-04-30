"use client";

import { useState } from "react";
import { Layers, Upload as UploadIcon } from "lucide-react";
import { AdminEmptyState, AdminButton } from "@/components/admin/ui";
import { NewCampaignDialog } from "./NewCampaignDialog";

interface LibraryEmptyHeroProps {
  onCreated: () => void;
}

/**
 * Full-page empty state shown when the tenant has zero campaigns AND
 * zero assets. Drives the host straight to "create your first campaign"
 * because that's the productive next action — uploading without a
 * campaign label is a dead-end UX.
 */
export function LibraryEmptyHero({ onCreated }: LibraryEmptyHeroProps) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <AdminEmptyState
        icon={<Layers className="h-6 w-6" />}
        title="No campaigns yet"
        description="Create your first campaign to start uploading shareables your reps can use."
        primaryAction={
          <AdminButton
            variant="primary"
            leftIcon={<UploadIcon className="h-3.5 w-3.5" />}
            onClick={() => setCreating(true)}
          >
            New campaign
          </AdminButton>
        }
      />
      <NewCampaignDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => onCreated()}
      />
    </>
  );
}
