"use client";

interface CartSummaryItem {
  name: string;
  qty: number;
  size?: string;
}

interface BottomBarProps {
  fromPrice?: string;
  cartTotal?: string;
  cartQty?: number;
  cartItems?: CartSummaryItem[];
  onBuyNow: () => void;
  onCheckout?: () => void;
}

export function BottomBar({
  fromPrice = "£26.46",
  cartTotal,
  cartQty = 0,
  cartItems,
  onBuyNow,
  onCheckout,
}: BottomBarProps) {
  const hasCart = cartQty > 0 && cartTotal;

  return (
    <div className={`bottom-bar${hasCart ? ' bottom-bar--has-cart' : ''}`} id="bottomBar">
      <div className="bottom-bar__inner">
        <div className="bottom-bar__price">
          <span className="bottom-bar__amount">
            {hasCart ? cartTotal : `From ${fromPrice}`}
          </span>
          {hasCart && cartItems && cartItems.length > 0 ? (
            <span className="bottom-bar__subtitle bottom-bar__cart-list">
              {cartItems.map((item, i) => (
                <span key={i} className="bottom-bar__cart-item">
                  {item.qty}&times; {item.name}
                  {item.size && (
                    <span className="bottom-bar__cart-size">
                      Size: {item.size}
                    </span>
                  )}
                </span>
              ))}
            </span>
          ) : (
            <span className="bottom-bar__subtitle">
              Incl. fees
            </span>
          )}
        </div>
        {hasCart && (
          <span className="bottom-bar__ticket-count">
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
