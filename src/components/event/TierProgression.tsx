import type { TicketTypeRow } from "@/types/events";

interface TierProgressionProps {
  tickets: TicketTypeRow[];
  currSymbol: string;
}

export function TierProgression({ tickets, currSymbol }: TierProgressionProps) {
  if (tickets.length < 2) return null;

  return (
    <div className="tier-progression">
      {tickets.map((tt) => {
        const statusClass =
          tt.status === "sold_out"
            ? "tier-progression__tier--sold"
            : tt.status === "active"
              ? "tier-progression__tier--active"
              : "tier-progression__tier--next";
        const statusLabel =
          tt.status === "sold_out"
            ? "SOLD OUT"
            : tt.status === "active"
              ? "ON SALE"
              : "UPCOMING";
        const priceDisplay =
          Number(tt.price) % 1 === 0
            ? Number(tt.price)
            : Number(tt.price).toFixed(2);
        return (
          <div
            key={tt.id}
            className={`tier-progression__tier ${statusClass}`}
          >
            <span className="tier-progression__name">
              {tt.name}
            </span>
            <span className="tier-progression__price">
              {currSymbol}{priceDisplay}
            </span>
            <span className="tier-progression__status">
              {statusLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
