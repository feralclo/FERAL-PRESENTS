/**
 * Instant loading state for event pages.
 * Shows immediately when navigating from the homepage (or anywhere),
 * while the Server Component in layout.tsx fetches settings from Supabase.
 * This eliminates the perceived "lag" / "nothing happening" on click.
 */
export default function EventLoading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0e0e0e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div
        style={{
          width: 140,
          height: 40,
          marginBottom: 48,
          opacity: 0.15,
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: 4,
        }}
      />
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 11,
          letterSpacing: 3,
          textTransform: "uppercase" as const,
          color: "#555",
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
            background: "#8B5CF6",
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
