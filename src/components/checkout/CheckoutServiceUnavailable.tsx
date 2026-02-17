"use client";

import Link from "next/link";

/**
 * Shown when the checkout is unavailable for a given session.
 * Styled to look like an embedded checkout widget failed to load.
 */
export function CheckoutServiceUnavailable({ slug }: { slug: string }) {
  const ref = Math.random().toString(16).slice(2, 8).toUpperCase();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0e0e0e",
        color: "#fff",
        fontFamily: "'Space Mono', monospace",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      {/* Broken embed container */}
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          border: "1px solid #222",
          borderRadius: "4px",
          background: "#111",
          padding: "3rem 2rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ marginBottom: "1.25rem", opacity: 0.3 }}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="2" y1="7" x2="22" y2="7" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <p
          style={{
            color: "#666",
            fontSize: "0.85rem",
            lineHeight: "1.6",
            marginBottom: "0.75rem",
          }}
        >
          This content could not be displayed. The embedded checkout failed to
          load due to a connection error.
        </p>
        <p
          style={{
            color: "#444",
            fontSize: "0.7rem",
            fontFamily: "monospace",
          }}
        >
          ERR_EMBED_BLOCKED &middot; {ref}
        </p>
      </div>

      <Link
        href={`/event/${slug}`}
        style={{
          color: "#888",
          fontSize: "0.8rem",
          letterSpacing: "1px",
          textDecoration: "none",
          borderBottom: "1px solid #333",
          paddingBottom: "2px",
        }}
      >
        &larr; Return to event
      </Link>
    </div>
  );
}
