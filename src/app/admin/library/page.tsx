"use client";

import { LibraryWorkspace } from "@/components/admin/library/LibraryWorkspace";

/**
 * /admin/library — top-level cover library.
 *
 * Single source of truth for tenant-uploaded creative used across the
 * platform: quest covers (3:4 portrait), event covers (1:1 square), and
 * future kinds. Promoted from a tab inside /admin/reps because event
 * covers aren't rep-specific — keeping the page anchored to the rep
 * surface narrowed its mental model.
 *
 * Discoverable from:
 *   - the admin sidebar (top-level "Library" entry)
 *   - the rep-programme overview (link card to here)
 *   - the quest editor cover slot ("Browse cover library")
 *   - the event editor Look section ("Browse cover library")
 */
export default function AdminLibraryPage() {
  return <LibraryWorkspace />;
}
