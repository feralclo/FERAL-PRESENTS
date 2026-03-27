/** A single row from the imported CSV after column mapping. */
export interface ImportTicketRow {
  barcode: string;
  first_name: string;
  last_name: string;
  email: string;
  ticket_type: string;
}

/** Column mapping from CSV header to import field. */
export interface ColumnMapping {
  barcode: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  ticket_type: string | null;
}

/** Ticket type mapping from external name to display name. */
export interface TicketTypeMapping {
  externalName: string;
  displayName: string;
  count: number;
}

/** Import request sent to the API. */
export interface ImportTicketsRequest {
  event_id: string;
  source_platform: string;
  ticket_type_mappings: TicketTypeMapping[];
  tickets: ImportTicketRow[];
}

/** Result of an import operation. */
export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportError[];
  order_number?: string;
  batch_id: string;
}

/** A single import error with context. */
export interface ImportError {
  row: number;
  barcode: string;
  reason: string;
}
