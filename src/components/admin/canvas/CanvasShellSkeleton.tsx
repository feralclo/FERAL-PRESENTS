"use client";

import { AdminSkeleton } from "@/components/admin/ui";

/**
 * Loading skeleton for the canvas. Matches the populated layout — six
 * stacked sections on the form pane, a phone-frame placeholder on the
 * preview pane — so switching events doesn't cause a layout shift.
 *
 * Per `admin-ux-design.md` Section 8: skeletons match the shape of the
 * content they're replacing, no centred spinners on full-page loads.
 */
export function CanvasShellSkeleton() {
  return (
    <div className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        {/* Header skeleton — title + back link */}
        <div className="space-y-3">
          <AdminSkeleton className="h-3 w-24" />
          <div className="flex items-center gap-3">
            <AdminSkeleton className="h-6 w-48" />
            <AdminSkeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Form pane — six section blocks */}
          <div className="space-y-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-border/40 bg-card/40 px-5 py-4"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <AdminSkeleton className="h-2.5 w-20" />
                    <AdminSkeleton className="h-4 w-32" />
                  </div>
                  <AdminSkeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>

          {/* Preview pane — readiness card + phone frame */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40">
                <div className="space-y-3 border-b border-border/40 px-4 py-4">
                  <AdminSkeleton className="h-20 w-full rounded-xl" />
                  <AdminSkeleton className="h-32 w-full rounded-xl" />
                </div>
                <div className="flex justify-center px-4 py-8">
                  <AdminSkeleton className="h-[520px] w-[300px] rounded-[40px]" />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
