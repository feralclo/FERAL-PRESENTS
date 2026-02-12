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
          <div key={i} className={`checkout-summary__item${item.size ? " checkout-summary__item--merch" : ""}`}>
            {item.size && (
              <div className="checkout-summary__thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/LIVERPOOL%20MARCH%20FRONT.png"
                  alt="Merch"
                  className="checkout-summary__thumb-img"
                />
              </div>
            )}
            <div className="checkout-summary__item-details">
              <div className="checkout-summary__item-row">
                <span className="checkout-summary__qty">{item.qty}x</span>
                <span className="checkout-summary__name">{item.name}</span>
              </div>
              {item.size && (
                <span className="checkout-summary__size">Size: {item.size}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
