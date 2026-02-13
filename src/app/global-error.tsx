"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches errors from the root layout.
 *
 * Main purpose: handle ChunkLoadError during Vercel deployments.
 * When a new deployment goes live, old JS chunk URLs 404.
 * Auto-reloading picks up the new deployment's assets.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] Client error:", error);

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
    <html lang="en">
      <body style={{ margin: 0, background: "#0e0e0e", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <p style={{ fontSize: 14, color: "#888" }}>Something went wrong.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#ff0033", color: "#fff", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
