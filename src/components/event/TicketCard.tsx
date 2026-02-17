import type { TicketTypeRow } from "@/types/events";

/** Tier → CSS class mapping for visual styling */
const TIER_CLASS: Record<string, string> = {
  standard: "",
  platinum: "ticket-option--vip",
  black: "ticket-option--vip-black",
  valentine: "ticket-option--valentine",
};

interface TicketCardProps {
  ticket: TicketTypeRow;
  qty: number;
  currSymbol: string;
  onAdd: (tt: TicketTypeRow) => void;
  onRemove: (tt: TicketTypeRow) => void;
  onViewMerch?: (tt: TicketTypeRow) => void;
}

export function TicketCard({
  ticket: tt,
  qty,
  currSymbol,
  onAdd,
  onRemove,
  onViewMerch,
}: TicketCardProps) {
  const tierClass = TIER_CLASS[tt.tier || "standard"] || "";
  const priceDisplay =
    Number(tt.price) % 1 === 0
      ? Number(tt.price)
      : Number(tt.price).toFixed(2);

  return (
    <div
      className={`ticket-option ${tierClass}${qty > 0 ? " ticket-option--active" : ""}`}
      data-ticket-id={tt.id}
    >
      {tt.tier === "valentine" && (
        <div className="ticket-option__hearts">
          {[...Array(5)].map((_, i) => (
            <span key={i} className="ticket-option__heart">{"\u2665"}</span>
          ))}
        </div>
      )}
      <div className="ticket-option__row">
        <div className="ticket-option__info">
          <span className="ticket-option__name">{tt.name}</span>
          <span className="ticket-option__perks">
            {tt.description || "Standard entry"}
          </span>
        </div>
        <span className="ticket-option__price">
          {currSymbol}{priceDisplay}
        </span>
      </div>
      <div className="ticket-option__bottom">
        {tt.includes_merch ? (
          (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.front || (tt.product_id && tt.product ? tt.product.images : tt.merch_images)?.back ? (
            <span
              className="ticket-option__view-tee"
              onClick={() => onViewMerch?.(tt)}
              style={{ cursor: "pointer" }}
            >
              View Merch
            </span>
          ) : (
            <span
              className="ticket-option__view-tee"
              style={{ cursor: "default", opacity: 0.6 }}
            >
              Includes merch
            </span>
          )
        ) : (
          <span />
        )}
        <div className="ticket-option__controls">
          <button
            className="ticket-option__btn"
            onClick={() => onRemove(tt)}
            aria-label="Remove"
          >
            &minus;
          </button>
          <span className="ticket-option__qty">{qty}</span>
          <button
            className="ticket-option__btn"
            onClick={() => onAdd(tt)}
            aria-label="Add"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
