import type { ColumnMapping, ImportTicketRow } from "@/types/import-tickets";

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

/** Parse a CSV string into headers and rows. Handles quoted fields and mixed line endings. */
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows };
}

// ─── Column Auto-Detection ────────────────────────────────────────────────────

function findColumnMatch(
  lowerHeaders: string[],
  origHeaders: string[],
  candidates: string[]
): string | null {
  // Exact match first
  for (const c of candidates) {
    const idx = lowerHeaders.indexOf(c);
    if (idx !== -1) return origHeaders[idx];
  }
  // Partial match
  for (const c of candidates) {
    const idx = lowerHeaders.findIndex((h) => h.includes(c));
    if (idx !== -1) return origHeaders[idx];
  }
  return null;
}

/** Auto-detect column mapping from CSV headers. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().trim());

  return {
    barcode: findColumnMatch(lower, headers, [
      "barcode",
      "ticket_number",
      "ticket number",
      "ticket_code",
      "ticket code",
      "reference",
      "ref",
      "code",
      "ticket_id",
      "ticket id",
      "id",
    ]),
    first_name: findColumnMatch(lower, headers, [
      "first_name",
      "firstname",
      "first name",
      "forename",
    ]),
    last_name: findColumnMatch(lower, headers, [
      "last_name",
      "lastname",
      "last name",
      "surname",
    ]),
    full_name: findColumnMatch(lower, headers, [
      "name",
      "full_name",
      "fullname",
      "full name",
      "customer_name",
      "customer name",
      "attendee",
      "attendee name",
    ]),
    email: findColumnMatch(lower, headers, [
      "email",
      "email_address",
      "e-mail",
      "email address",
      "customer_email",
      "customer email",
    ]),
    ticket_type: findColumnMatch(lower, headers, [
      "ticket_type",
      "ticket type",
      "type",
      "tier",
      "category",
      "ticket_name",
      "ticket name",
      "ticket",
    ]),
  };
}

// ─── Name Splitting ───────────────────────────────────────────────────────────

/** Split a full name into first and last name parts. */
export function splitFullName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// ─── Row Mapping ──────────────────────────────────────────────────────────────

/** Apply column mapping to a single CSV row, returning a typed ticket row. */
export function applyMapping(
  row: string[],
  headers: string[],
  mapping: ColumnMapping
): ImportTicketRow | null {
  const getCol = (header: string | null): string => {
    if (!header) return "";
    const idx = headers.indexOf(header);
    return idx >= 0 ? (row[idx] || "").trim() : "";
  };

  const barcode = getCol(mapping.barcode);
  if (!barcode) return null;

  let firstName = getCol(mapping.first_name);
  let lastName = getCol(mapping.last_name);

  // If full_name is mapped and first/last are empty, split it
  if (!firstName && !lastName && mapping.full_name) {
    const { first, last } = splitFullName(getCol(mapping.full_name));
    firstName = first;
    lastName = last;
  }

  return {
    barcode,
    first_name: firstName,
    last_name: lastName,
    email: getCol(mapping.email),
    ticket_type: getCol(mapping.ticket_type) || "General Admission",
  };
}
