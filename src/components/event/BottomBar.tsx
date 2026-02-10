"use client";

interface BottomBarProps {
  fromPrice?: string;
  onBuyNow: () => void;
}

export function BottomBar({
  fromPrice = "£26.46",
  onBuyNow,
}: BottomBarProps) {
  return (
    <div className="bottom-bar" id="bottomBar">
      <div className="bottom-bar__inner">
        <div className="bottom-bar__price">
          <span className="bottom-bar__amount">From {fromPrice}</span>
          <span className="bottom-bar__subtitle">
            Incl. booking fee. No surprises.
          </span>
        </div>
        <button className="bottom-bar__cta" onClick={onBuyNow}>
          Buy Now
        </button>
      </div>
    </div>
  );
}
