"use client";

interface BottomBarProps {
  fromPrice?: string;
  cartTotal?: string;
  cartQty?: number;
  onBuyNow: () => void;
  onCheckout?: () => void;
}

export function BottomBar({
  fromPrice = "£26.46",
  cartTotal,
  cartQty = 0,
  onBuyNow,
  onCheckout,
}: BottomBarProps) {
  const hasCart = cartQty > 0 && cartTotal;

  return (
    <div className="bottom-bar" id="bottomBar">
      <div className="bottom-bar__inner">
        <div className="bottom-bar__price">
          <span className="bottom-bar__amount">
            {hasCart ? cartTotal : `From ${fromPrice}`}
          </span>
          <span className="bottom-bar__subtitle">
            Incl. booking fee. No surprises.
          </span>
        </div>
        {hasCart && (
          <span
            style={{
              color: "#ff0033",
              fontSize: "0.75rem",
              fontFamily: "'Space Mono', monospace",
              whiteSpace: "nowrap",
              letterSpacing: "0.5px",
            }}
          >
            {cartQty} ticket{cartQty !== 1 ? "s" : ""}
          </span>
        )}
        <button className="bottom-bar__cta" onClick={hasCart && onCheckout ? onCheckout : onBuyNow}>
          {hasCart ? "Checkout" : "Buy Now"}
        </button>
      </div>
    </div>
  );
}
