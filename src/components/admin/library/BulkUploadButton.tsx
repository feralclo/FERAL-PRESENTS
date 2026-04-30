"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AdminButton } from "@/components/admin/ui";
import { BulkUploadSheet } from "./BulkUploadSheet";

interface BulkUploadButtonProps {
  /** Pre-fills the campaign chooser with this slug. */
  defaultCampaign?: string;
  onUploaded: () => void;
}

/**
 * Upload entry point — small wrapper around BulkUploadSheet so callers
 * (empty states, page header, campaign canvas) can drop in a button
 * without importing the dialog body directly.
 */
export function BulkUploadButton({
  defaultCampaign,
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
        Upload
      </AdminButton>
      <BulkUploadSheet
        open={open}
        onOpenChange={setOpen}
        defaultCampaign={defaultCampaign}
        onUploaded={() => {
          onUploaded();
        }}
      />
    </>
  );
}
