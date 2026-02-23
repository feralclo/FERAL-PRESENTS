"use client";

export default function EventError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem", letterSpacing: "2px" }}>
        SOMETHING WENT WRONG
      </h1>
      <p style={{ color: "#888", marginBottom: "2rem", maxWidth: "400px" }}>
        {error.message || "An unexpected error occurred loading this event page."}
      </p>
      <button
        onClick={reset}
        style={{
          background: "#8B5CF6",
          color: "#fff",
          border: "none",
          padding: "12px 32px",
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.85rem",
          letterSpacing: "1.5px",
          cursor: "pointer",
          textTransform: "uppercase",
        }}
      >
        Try Again
      </button>
    </div>
  );
}
