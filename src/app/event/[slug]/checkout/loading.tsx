/**
 * Checkout-specific loading state.
 * Shows a simple spinner while the checkout page loads.
 * Uses CSS variable --accent from tenant branding (injected by event layout).
 */
export default function CheckoutLoading() {
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
        gap: 16,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          border: "2px solid rgba(255, 255, 255, 0.08)",
          borderTopColor: "var(--accent, #ff0033)",
          borderRadius: "50%",
          animation: "checkoutSpin 0.8s linear infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          color: "var(--text-muted, #555)",
        }}
      >
        Securing checkout...
      </span>
      <style>{`
        @keyframes checkoutSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
