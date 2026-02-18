export interface DiscountDisplay {
  code: string;
  type: "percentage" | "fixed";
  value: number;
}

/** Calculate the discounted unit price for a single ticket */
export function getDiscountedPrice(
  price: number,
  discount: DiscountDisplay
): number {
  if (discount.type === "percentage") {
    return Math.round(price * (1 - discount.value / 100) * 100) / 100;
  }
  // Fixed discount: spread evenly is tricky — just subtract from price, floor at 0
  return Math.max(0, price - discount.value);
}

/** Calculate the total discount amount off a subtotal */
export function getDiscountAmount(
  subtotal: number,
  discount: DiscountDisplay
): number {
  if (discount.type === "percentage") {
    return Math.round((subtotal * discount.value) / 100 * 100) / 100;
  }
  return Math.min(discount.value, subtotal);
}
