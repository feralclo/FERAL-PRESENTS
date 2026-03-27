import { describe, it, expect } from "vitest";
import {
  parseCSV,
  autoDetectMapping,
  splitFullName,
  applyMapping,
} from "@/lib/import-csv";

// ─── parseCSV ─────────────────────────────────────────────────────────────────

describe("parseCSV", () => {
  it("parses simple CSV", () => {
    const csv = "Barcode,Name,Email\n123,John Doe,john@test.com\n456,Jane,jane@test.com";
    const { headers, rows } = parseCSV(csv);
    expect(headers).toEqual(["Barcode", "Name", "Email"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["123", "John Doe", "john@test.com"]);
  });

  it("handles quoted fields with commas", () => {
    const csv = 'Barcode,Name,Email\n123,"Doe, John",john@test.com';
    const { rows } = parseCSV(csv);
    expect(rows[0]).toEqual(["123", "Doe, John", "john@test.com"]);
  });

  it("handles escaped quotes (double-double)", () => {
    const csv = 'Barcode,Name\n123,"She said ""hello"""';
    const { rows } = parseCSV(csv);
    expect(rows[0][1]).toBe('She said "hello"');
  });

  it("handles Windows line endings", () => {
    const csv = "Barcode,Name\r\n123,John\r\n456,Jane";
    const { rows } = parseCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["123", "John"]);
  });

  it("filters empty lines", () => {
    const csv = "Barcode,Name\n123,John\n\n456,Jane\n\n";
    const { rows } = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });

  it("returns empty for empty input", () => {
    const { headers, rows } = parseCSV("");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("trims whitespace from values", () => {
    const csv = "Barcode , Name , Email \n 123 , John , john@test.com ";
    const { headers, rows } = parseCSV(csv);
    expect(headers).toEqual(["Barcode", "Name", "Email"]);
    expect(rows[0]).toEqual(["123", "John", "john@test.com"]);
  });
});

// ─── autoDetectMapping ────────────────────────────────────────────────────────

describe("autoDetectMapping", () => {
  it("detects standard Skiddle-style headers", () => {
    const headers = ["Barcode", "First Name", "Last Name", "Email", "Ticket Type"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.barcode).toBe("Barcode");
    expect(mapping.first_name).toBe("First Name");
    expect(mapping.last_name).toBe("Last Name");
    expect(mapping.email).toBe("Email");
    expect(mapping.ticket_type).toBe("Ticket Type");
  });

  it("detects Eventbrite-style headers", () => {
    const headers = ["Ticket Number", "Firstname", "Lastname", "Email Address", "Type"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.barcode).toBe("Ticket Number");
    expect(mapping.first_name).toBe("Firstname");
    expect(mapping.last_name).toBe("Lastname");
    expect(mapping.email).toBe("Email Address");
    expect(mapping.ticket_type).toBe("Type");
  });

  it("detects full name column", () => {
    const headers = ["Reference", "Name", "Email"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.barcode).toBe("Reference");
    expect(mapping.full_name).toBe("Name");
    expect(mapping.email).toBe("Email");
  });

  it("handles case-insensitive matching", () => {
    const headers = ["BARCODE", "EMAIL", "TICKET_TYPE"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.barcode).toBe("BARCODE");
    expect(mapping.email).toBe("EMAIL");
    expect(mapping.ticket_type).toBe("TICKET_TYPE");
  });

  it("partial matches work (e.g. 'Customer Email')", () => {
    const headers = ["Ticket Code", "Customer Email", "Tier"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.barcode).toBe("Ticket Code");
    expect(mapping.email).toBe("Customer Email");
    expect(mapping.ticket_type).toBe("Tier");
  });

  it("returns null for unmatchable columns", () => {
    const headers = ["foo", "bar", "baz"];
    const mapping = autoDetectMapping(headers);
    expect(mapping.barcode).toBeNull();
    expect(mapping.email).toBeNull();
  });
});

// ─── splitFullName ────────────────────────────────────────────────────────────

describe("splitFullName", () => {
  it("splits first and last name", () => {
    expect(splitFullName("John Doe")).toEqual({ first: "John", last: "Doe" });
  });

  it("handles single name", () => {
    expect(splitFullName("Madonna")).toEqual({ first: "Madonna", last: "" });
  });

  it("handles multiple last name parts", () => {
    expect(splitFullName("John van der Berg")).toEqual({
      first: "John",
      last: "van der Berg",
    });
  });

  it("handles extra whitespace", () => {
    expect(splitFullName("  John   Doe  ")).toEqual({
      first: "John",
      last: "Doe",
    });
  });

  it("handles empty string", () => {
    expect(splitFullName("")).toEqual({ first: "", last: "" });
  });
});

// ─── applyMapping ─────────────────────────────────────────────────────────────

describe("applyMapping", () => {
  const headers = ["Barcode", "First Name", "Last Name", "Email", "Type"];

  const mapping = {
    barcode: "Barcode",
    first_name: "First Name",
    last_name: "Last Name",
    full_name: null,
    email: "Email",
    ticket_type: "Type",
  };

  it("maps a row correctly", () => {
    const row = ["12345", "John", "Doe", "john@test.com", "VIP"];
    const result = applyMapping(row, headers, mapping);
    expect(result).toEqual({
      barcode: "12345",
      first_name: "John",
      last_name: "Doe",
      email: "john@test.com",
      ticket_type: "VIP",
    });
  });

  it("returns null when barcode is missing", () => {
    const row = ["", "John", "Doe", "john@test.com", "VIP"];
    expect(applyMapping(row, headers, mapping)).toBeNull();
  });

  it("defaults ticket_type to General Admission when empty", () => {
    const row = ["12345", "John", "Doe", "john@test.com", ""];
    const result = applyMapping(row, headers, mapping);
    expect(result?.ticket_type).toBe("General Admission");
  });

  it("defaults ticket_type to General Admission when unmapped", () => {
    const noTypeMapping = { ...mapping, ticket_type: null };
    const row = ["12345", "John", "Doe", "john@test.com", "VIP"];
    const result = applyMapping(row, headers, noTypeMapping);
    expect(result?.ticket_type).toBe("General Admission");
  });

  it("splits full name when first/last are not mapped", () => {
    const nameHeaders = ["Barcode", "Name", "Email"];
    const nameMapping = {
      barcode: "Barcode",
      first_name: null,
      last_name: null,
      full_name: "Name",
      email: "Email",
      ticket_type: null,
    };
    const row = ["12345", "John Doe", "john@test.com"];
    const result = applyMapping(row, nameHeaders, nameMapping);
    expect(result?.first_name).toBe("John");
    expect(result?.last_name).toBe("Doe");
  });

  it("prefers explicit first/last over full_name", () => {
    const bothHeaders = ["Barcode", "First Name", "Last Name", "Name", "Email"];
    const bothMapping = {
      barcode: "Barcode",
      first_name: "First Name",
      last_name: "Last Name",
      full_name: "Name",
      email: "Email",
      ticket_type: null,
    };
    const row = ["12345", "Jane", "Smith", "Full Name Value", "jane@test.com"];
    const result = applyMapping(row, bothHeaders, bothMapping);
    expect(result?.first_name).toBe("Jane");
    expect(result?.last_name).toBe("Smith");
  });

  it("handles barcode with URL format (Skiddle QR edge case)", () => {
    const row = [
      "https://skiddle.com/e/12345/verify/ABC123",
      "John",
      "Doe",
      "john@test.com",
      "GA",
    ];
    const result = applyMapping(row, headers, mapping);
    expect(result?.barcode).toBe(
      "https://skiddle.com/e/12345/verify/ABC123"
    );
  });
});
