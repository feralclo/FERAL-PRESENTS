export type OrderStatus =
  | "pending"
  | "completed"
  | "refunded"
  | "cancelled"
  | "failed";

export type TicketStatus =
  | "valid"
  | "used"
  | "cancelled"
  | "transferred"
  | "expired";

export interface Order {
  id: string;
  org_id: string;
  order_number: string;
  event_id: string;
  customer_id: string;
  status: OrderStatus;
  subtotal: number;
  fees: number;
  total: number;
  currency: string;
  payment_method: string;
  payment_ref?: string;
  refund_reason?: string;
  refunded_at?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  customer?: Customer;
  event?: { name: string; slug: string; date_start: string };
  items?: OrderItem[];
  tickets?: Ticket[];
}

export interface OrderItem {
  id: string;
  org_id: string;
  order_id: string;
  ticket_type_id: string;
  qty: number;
  unit_price: number;
  merch_size?: string;
  created_at: string;
  // Joined
  ticket_type?: { name: string; description?: string };
}

export interface Ticket {
  id: string;
  org_id: string;
  order_item_id: string;
  order_id: string;
  event_id: string;
  ticket_type_id: string;
  customer_id: string;
  ticket_code: string;
  status: TicketStatus;
  holder_first_name?: string;
  holder_last_name?: string;
  holder_email?: string;
  merch_size?: string;
  merch_collected?: boolean;
  merch_collected_at?: string;
  merch_collected_by?: string;
  scanned_at?: string;
  scanned_by?: string;
  scan_location?: string;
  created_at: string;
  // Joined
  ticket_type?: { name: string };
  event?: {
    name: string;
    slug: string;
    venue_name?: string;
    date_start: string;
  };
}

export type CustomerSegment = "superfan" | "fan" | "new_fan" | "discoverer";

export interface Customer {
  id: string;
  org_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  nickname?: string;
  total_orders: number;
  total_spent: number;
  first_order_at?: string;
  last_order_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface GuestListEntry {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  email?: string;
  phone?: string;
  qty: number;
  added_by?: string;
  notes?: string;
  checked_in: boolean;
  checked_in_at?: string;
  checked_in_count: number;
  created_at: string;
}

export type AbandonedCartStatus = "abandoned" | "recovered" | "expired";

export interface AbandonedCart {
  id: string;
  org_id: string;
  customer_id: string;
  event_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  items: { ticket_type_id: string; qty: number; name: string; price: number; merch_size?: string }[];
  subtotal: number;
  currency: string;
  status: AbandonedCartStatus;
  recovered_at?: string;
  recovered_order_id?: string;
  notified_at?: string;
  notification_count: number;
  cart_token?: string;
  created_at: string;
  updated_at: string;
  // Joined
  customer?: Customer;
  event?: { name: string; slug: string; date_start: string };
}
