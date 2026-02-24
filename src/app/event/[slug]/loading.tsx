/**
 * Instant loading state for event pages.
 * Shows immediately when navigating from the homepage (or anywhere),
 * while the Server Component in layout.tsx fetches settings from Supabase.
 * This eliminates the perceived "lag" / "nothing happening" on click.
 *
 * Uses CSS variable --accent (injected by event layout from tenant branding)
 * so the loading bar matches the tenant's brand color, not platform purple.
 */
export default function EventLoading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--bg-dark, #0e0e0e)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 11,
          letterSpacing: 3,
          textTransform: "uppercase" as const,
          color: "var(--text-muted, #555)",
          marginBottom: 24,
        }}
      >
        Loading
      </div>
      <div
        style={{
          width: 200,
          height: 2,
          background: "rgba(255, 255, 255, 0.06)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "30%",
            background: "var(--accent, #ff0033)",
            animation: "loadSlide 1.2s ease-in-out infinite",
          }}
        />
      </div>
      <style>{`
        @keyframes loadSlide {
          0% { left: -30%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
}
