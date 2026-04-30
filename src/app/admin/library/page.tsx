import { Suspense } from "react";
import { LibraryShell } from "@/components/admin/library/LibraryShell";

/**
 * /admin/library — top-level cover library.
 *
 * The shell renders a campaigns rail + canvas on desktop, chip strip on
 * mobile. When no campaign is active the right pane is the existing
 * `LibraryWorkspace` (the "All assets" multi-kind grid). When one is
 * active, the pane becomes the `CampaignDetailView` — stat row, linked
 * quests, top assets, plus a campaign-scoped grid.
 *
 * Discoverable from:
 *   - the admin sidebar (top-level "Library" entry)
 *   - the rep-programme overview (link card to here)
 *   - the quest editor cover slot ("Browse cover library")
 *   - the event editor Look section ("Browse cover library")
 */
export default function AdminLibraryPage() {
  // useSearchParams (inside LibraryShell) requires a Suspense boundary in
  // a server component shell; loading.tsx provides the actual skeleton.
  return (
    <Suspense fallback={null}>
      <LibraryShell />
    </Suspense>
  );
}
