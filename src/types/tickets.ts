/** T-shirt sizes available for VIP+Tee */
export type TeeSize = "XS" | "S" | "M" | "L" | "XL" | "XXL";

/** All tee sizes */
export const TEE_SIZES: TeeSize[] = ["XS", "S", "M", "L", "XL", "XXL"];

/** Parsed cart from URL (used by checkout page) */
export interface ParsedCartItem {
  name: string;
  qty: number;
  size?: string;
  ticketId: string;
}
