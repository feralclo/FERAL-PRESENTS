/**
 * Checkout-specific loading state.
 * Shows a simple spinner while the checkout page loads.
 * Gets the user into checkout as fast as possible.
 */
export default function CheckoutLoading() {
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
        gap: 16,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          border: "2px solid rgba(255, 255, 255, 0.08)",
          borderTopColor: "#8B5CF6",
          borderRadius: "50%",
          animation: "checkoutSpin 0.8s linear infinite",
        }}
      />
      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          color: "#555",
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
