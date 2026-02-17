import type { TicketTypeRow } from "@/types/events";

interface CartSummaryProps {
  items: { name: string; qty: number; size?: string }[];
  ticketTypes: TicketTypeRow[];
  totalPrice: number;
  totalQty: number;
  currSymbol: string;
}

export function CartSummary({
  items,
  ticketTypes,
  totalPrice,
  totalQty,
  currSymbol,
}: CartSummaryProps) {
  if (items.length === 0) return null;

  return (
    <div className="cart-summary">
      <div className="cart-summary__header">
        <span className="cart-summary__title">Your Order</span>
        <span className="cart-summary__count">
          {totalQty} {totalQty === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="cart-summary__lines">
        {items.map((item, i) => {
          const tt = ticketTypes.find((t) => t.name === item.name);
          const unitPrice = tt ? Number(tt.price) : 0;
          const linePrice = unitPrice * item.qty;
          const hasMerch = tt?.includes_merch && item.size;
          const merchLabel =
            tt?.product?.name ||
            tt?.merch_name ||
            (tt?.merch_type === "hoodie" ? "Hoodie" : "T-Shirt");

          return (
            <div className="cart-summary__line" key={i}>
              <div className="cart-summary__line-main">
                <span className="cart-summary__line-qty">
                  {item.qty}&times;
                </span>
                <span className="cart-summary__line-name">
                  {item.name}
                </span>
                <span className="cart-summary__line-price">
                  {currSymbol}
                  {linePrice % 1 === 0
                    ? linePrice
                    : linePrice.toFixed(2)}
                </span>
              </div>
              {hasMerch && (
                <div className="cart-summary__line-merch">
                  <span className="cart-summary__merch-badge">
                    + {merchLabel}
                  </span>
                  <span className="cart-summary__merch-size">
                    Size: <strong>{item.size}</strong>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="cart-summary__footer">
        <span className="cart-summary__total-label">Total</span>
        <span className="cart-summary__total-value">
          {currSymbol}{totalPrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
