/** Ticket type key identifiers */
export type TicketKey = "general" | "vip" | "vip-tee" | "valentine";

/** Individual ticket type configuration */
export interface TicketType {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  qty: number;
}

/** T-shirt sizes available for VIP+Tee */
export type TeeSize = "XS" | "S" | "M" | "L" | "XL" | "XXL";

/** All tee sizes */
export const TEE_SIZES: TeeSize[] = ["XS", "S", "M", "L", "XL", "XXL"];

/** Size-specific ticket ID mapping */
export type SizeIds = Record<TeeSize, string | null>;

/** Cart item for checkout URL parameter */
export interface CartItem {
  ticketId: string;
  qty: number;
  size?: TeeSize;
}

/** Parsed cart from URL (used by checkout page) */
export interface ParsedCartItem {
  name: string;
  qty: number;
  size?: string;
  ticketId: string;
}
