"use client";

import Link from "next/link";

/**
 * Shown when the checkout is unavailable for a given session.
 * Styled to match the existing error boundary (inline styles, Space Mono).
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
      <div style={{ marginBottom: "1.5rem", opacity: 0.35 }}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" />
          <line x1="12" y1="15" x2="12" y2="17" strokeLinecap="round" />
        </svg>
      </div>
      <h1
        style={{
          fontSize: "1.25rem",
          marginBottom: "1rem",
          letterSpacing: "2px",
          textTransform: "uppercase",
        }}
      >
        Checkout Unavailable
      </h1>
      <p
        style={{
          color: "#888",
          marginBottom: "0.75rem",
          maxWidth: "380px",
          fontSize: "0.9rem",
          lineHeight: "1.6",
        }}
      >
        We&rsquo;re unable to connect to our payment processor right now. This
        is usually temporary &mdash; please try again shortly.
      </p>
      <p
        style={{
          color: "#555",
          marginBottom: "2rem",
          fontSize: "0.75rem",
          fontFamily: "monospace",
        }}
      >
        REF: PSU-{ref}
      </p>
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
