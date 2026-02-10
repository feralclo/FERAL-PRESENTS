import type { ParsedCartItem } from "@/types/tickets";

interface OrderSummaryProps {
  items: ParsedCartItem[];
}

export function OrderSummary({ items }: OrderSummaryProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="order-summary"
      style={{
        background: "#1a1a1a",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          color: "#888",
          fontSize: "0.7rem",
          letterSpacing: "2px",
          marginBottom: "12px",
          fontFamily: "var(--font-space-mono), 'Space Mono', monospace",
        }}
      >
        ORDER SUMMARY
      </div>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 0",
            borderBottom: i < items.length - 1 ? "1px solid #2a2a2a" : "none",
          }}
        >
          <span style={{ color: "#fff", fontSize: "0.9rem" }}>
            {item.qty}x {item.name}
            {item.size && (
              <span style={{ color: "#888", marginLeft: "8px" }}>
                size: {item.size}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
