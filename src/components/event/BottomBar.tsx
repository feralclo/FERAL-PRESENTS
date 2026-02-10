"use client";

interface BottomBarProps {
  fromPrice?: string;
  cartTotal?: string;
  cartQty?: number;
  onBuyNow: () => void;
}

export function BottomBar({
  fromPrice = "£26.46",
  cartTotal,
  cartQty = 0,
  onBuyNow,
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
            {hasCart
              ? `${cartQty} ticket${cartQty !== 1 ? "s" : ""} selected`
              : "Incl. booking fee. No surprises."}
          </span>
        </div>
        <button className="bottom-bar__cta" onClick={onBuyNow}>
          {hasCart ? "Checkout" : "Buy Now"}
        </button>
      </div>
    </div>
  );
}
