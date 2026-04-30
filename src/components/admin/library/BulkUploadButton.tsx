"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AdminButton } from "@/components/admin/ui";
import { BulkUploadSheet } from "./BulkUploadSheet";

interface BulkUploadButtonProps {
  /** Pre-fills the destination chooser with this campaign slug.
   *  When omitted, the sheet opens on "Save to library" and the
   *  user can switch to a campaign inline. */
  defaultCampaign?: string;
  /** Force campaign mode — disables the "Save to library" option.
   *  Use on the campaign canvas where uploads should always land in
   *  the active campaign. */
  campaignRequired?: boolean;
  /** Optional label override; default "Upload". */
  label?: string;
  onUploaded: () => void;
}

/**
 * Upload entry point — small wrapper around BulkUploadSheet so callers
 * (empty states, page header, campaign canvas) can drop in a button
 * without importing the dialog body directly.
 */
export function BulkUploadButton({
  defaultCampaign,
  campaignRequired,
  label = "Upload",
  onUploaded,
}: BulkUploadButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AdminButton
        variant="primary"
        leftIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
      >
        {label}
      </AdminButton>
      <BulkUploadSheet
        open={open}
        onOpenChange={setOpen}
        defaultCampaign={defaultCampaign}
        campaignRequired={campaignRequired}
        onUploaded={() => {
          onUploaded();
        }}
      />
    </>
  );
}
