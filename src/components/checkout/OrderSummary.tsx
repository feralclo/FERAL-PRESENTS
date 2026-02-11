import type { ParsedCartItem } from "@/types/tickets";

interface OrderSummaryProps {
  items: ParsedCartItem[];
}

export function OrderSummary({ items }: OrderSummaryProps) {
  if (items.length === 0) return null;

  return (
    <div className="checkout-summary">
      <div className="checkout-summary__label">ORDER SUMMARY</div>
      <div className="checkout-summary__items">
        {items.map((item, i) => (
          <div key={i} className="checkout-summary__item">
            <span className="checkout-summary__qty">{item.qty}x</span>
            <span className="checkout-summary__name">{item.name}</span>
            {item.size && (
              <span className="checkout-summary__size">Size: {item.size}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
