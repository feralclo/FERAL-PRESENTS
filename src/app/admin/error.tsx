"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] Client error:", error);

    // ChunkLoadError happens when a new deployment invalidates old JS chunks.
    // Auto-reload to pick up the new deployment's assets.
    if (
      error?.message?.includes("ChunkLoadError") ||
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("Failed to fetch dynamically imported module")
    ) {
      window.location.reload();
      return;
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">Something went wrong loading this page.</p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Reload
      </button>
    </div>
  );
}
