import * as crypto from "crypto";
import forge from "node-forge";
import { generateTicketQR } from "@/lib/qr";
import type { WalletPassSettings } from "@/types/email";
import { DEFAULT_WALLET_PASS_SETTINGS } from "@/types/email";

/* ═══════════════════════════════════════════════════════════
   SHARED TYPES
   ═══════════════════════════════════════════════════════════ */

/** Data needed to generate a wallet pass for a single ticket */
export interface WalletPassTicketData {
  ticketCode: string;         // e.g. "FERAL-A3B4C5D6" — the QR payload
  eventName: string;
  venueName: string;
  eventDate: string;          // ISO date string
  doorsTime?: string;         // e.g. "21:00"
  ticketType: string;         // e.g. "General Release"
  holderName?: string;        // e.g. "Alex Test"
  orderNumber: string;        // e.g. "FERAL-00042"
  merchSize?: string;         // e.g. "L"
  includesMerch?: boolean;    // Whether this ticket includes merch
  merchName?: string;         // e.g. "FERAL Tee"
  currency?: string;          // e.g. "GBP"
}

/* ═══════════════════════════════════════════════════════════
   APPLE WALLET (.pkpass)
   ═══════════════════════════════════════════════════════════

   A .pkpass file is a ZIP archive containing:
   - pass.json          Pass definition
   - icon.png           Required app icon (29x29)
   - icon@2x.png        Retina icon (58x58)
   - logo.png           Logo displayed on pass
   - logo@2x.png        Retina logo
   - strip.png          Strip image (header banner)
   - strip@2x.png       Retina strip
   - manifest.json      SHA-1 hashes of all files
   - signature           PKCS7 detached signature of manifest

   Signing requires:
   - Pass Type Certificate (.p12/.pem) from Apple Developer Portal
   - WWDR Intermediate Certificate from Apple
   ═══════════════════════════════════════════════════════════ */

/** Environment variables for Apple Wallet pass signing */
interface AppleWalletConfig {
  passCertPem: string;       // PEM-encoded pass certificate (including private key)
  passCertPassword: string;  // Certificate password
  wwdrCertPem: string;       // Apple WWDR intermediate certificate PEM
  passTypeId: string;        // e.g. "pass.com.feralpresents.ticket"
  teamId: string;            // Apple Developer Team ID
}

/* ── WWDR G4 Certificate Auto-Fetch ──
 * The Apple WWDR (Worldwide Developer Relations) G4 intermediate certificate
 * is a PUBLIC certificate required for Apple Wallet pass signing. It's not a
 * secret — it's the same cert used by every Apple Wallet pass signer globally.
 *
 * We auto-fetch it from Apple's servers and cache it in memory so the user
 * never needs to deal with it. Falls back to APPLE_WWDR_CERTIFICATE env var
 * if the fetch fails (e.g. air-gapped server).
 */
const APPLE_WWDR_G4_URL = "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer";
let _cachedWwdrPem: string | null = null;

async function getWwdrCertificate(): Promise<string | null> {
  // 1. Check env var first (user override / air-gapped fallback)
  const envWwdr = process.env.APPLE_WWDR_CERTIFICATE;
  if (envWwdr) {
    if (envWwdr.includes("-----BEGIN")) return envWwdr;
    return Buffer.from(envWwdr, "base64").toString("utf-8");
  }

  // 2. Return cached version if available
  if (_cachedWwdrPem) return _cachedWwdrPem;

  // 3. Auto-fetch from Apple (DER format → convert to PEM)
  try {
    const response = await fetch(APPLE_WWDR_G4_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const derBuffer = Buffer.from(await response.arrayBuffer());
    const base64 = derBuffer.toString("base64");
    const pem = `-----BEGIN CERTIFICATE-----\n${base64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;
    _cachedWwdrPem = pem;
    console.log("[wallet] Auto-fetched Apple WWDR G4 certificate");
    return pem;
  } catch (err) {
    console.error("[wallet] Failed to auto-fetch WWDR G4 certificate:", err);
    return null;
  }
}

/**
 * Read Apple Wallet signing configuration from environment variables.
 * Returns null if not configured (graceful degradation).
 *
 * Only requires 3 things from the user:
 * 1. APPLE_PASS_CERTIFICATE — their .p12 pass certificate (base64)
 * 2. Pass Type ID — in admin UI or APPLE_PASS_TYPE_IDENTIFIER env var
 * 3. Team ID — in admin UI or APPLE_PASS_TEAM_IDENTIFIER env var
 *
 * The WWDR G4 certificate is auto-fetched from Apple.
 * The certificate password defaults to empty if not set.
 */
async function getAppleWalletConfig(settings: WalletPassSettings): Promise<AppleWalletConfig | null> {
  const cert = process.env.APPLE_PASS_CERTIFICATE;
  const password = process.env.APPLE_PASS_CERTIFICATE_PASSWORD || "";
  const passTypeId = settings.apple_pass_type_id || process.env.APPLE_PASS_TYPE_IDENTIFIER;
  const teamId = settings.apple_team_id || process.env.APPLE_PASS_TEAM_IDENTIFIER;

  if (!cert || !passTypeId || !teamId) return null;

  const wwdrPem = await getWwdrCertificate();
  if (!wwdrPem) return null;

  // Env var stores base64-encoded PEM or raw PEM content
  const decodeCert = (val: string) => {
    if (val.includes("-----BEGIN")) return val;
    return Buffer.from(val, "base64").toString("utf-8");
  };

  return {
    passCertPem: decodeCert(cert),
    passCertPassword: password,
    wwdrCertPem: wwdrPem,
    passTypeId,
    teamId,
  };
}

/** Convert hex color to "rgb(r, g, b)" format for Apple Wallet */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Format a date for Apple Wallet (ISO 8601 with timezone) */
function formatAppleDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString();
  } catch {
    return dateStr;
  }
}

/** Format a display date string (e.g. "Thu 27 Mar 2026, 9pm") */
function formatDisplayDate(dateStr: string, doorsTime?: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const formatted = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    if (doorsTime) return `${formatted} · Doors ${doorsTime}`;
    return formatted;
  } catch {
    return dateStr;
  }
}

/**
 * Build the pass.json content for an Apple Wallet event ticket.
 *
 * CRITICAL: The barcode message is the raw ticket code (e.g. "FERAL-A3B4C5D6").
 * This is the EXACT same value used in the PDF QR code and email display.
 * The scanner resolves it server-side via /api/tickets/[code].
 */
function buildApplePassJson(
  ticket: WalletPassTicketData,
  settings: WalletPassSettings,
  config: AppleWalletConfig,
): Record<string, unknown> {
  const s = { ...DEFAULT_WALLET_PASS_SETTINGS, ...settings };
  const serialNumber = `${ticket.orderNumber}-${ticket.ticketCode}`;

  // Build secondary fields (venue + date)
  const secondaryFields: Record<string, unknown>[] = [];
  if (ticket.venueName) {
    secondaryFields.push({
      key: "venue",
      label: "VENUE",
      value: ticket.venueName,
    });
  }
  secondaryFields.push({
    key: "date",
    label: "DATE",
    value: formatDisplayDate(ticket.eventDate, ticket.doorsTime),
  });

  // Build auxiliary fields (ticket type + merch)
  const auxiliaryFields: Record<string, unknown>[] = [
    {
      key: "ticketType",
      label: "TICKET",
      value: ticket.ticketType,
    },
  ];

  // Show merch info if applicable
  if (ticket.includesMerch || ticket.merchSize) {
    const merchValue = ticket.merchSize
      ? `Includes ${ticket.merchName || "Merch"} (${ticket.merchSize})`
      : `Includes ${ticket.merchName || "Merch"}`;
    auxiliaryFields.push({
      key: "merch",
      label: "MERCH",
      value: merchValue,
    });
  }

  // Build back fields (detailed info)
  const backFields: Record<string, unknown>[] = [];
  if (s.show_holder && ticket.holderName) {
    backFields.push({
      key: "holder",
      label: "TICKET HOLDER",
      value: ticket.holderName,
    });
  }
  if (s.show_order_number) {
    backFields.push({
      key: "orderNumber",
      label: "ORDER NUMBER",
      value: ticket.orderNumber,
    });
  }
  backFields.push({
    key: "ticketCode",
    label: "TICKET CODE",
    value: ticket.ticketCode,
  });
  if (s.show_terms && s.terms_text) {
    backFields.push({
      key: "terms",
      label: "TERMS & CONDITIONS",
      value: s.terms_text,
    });
  }

  const pass: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    serialNumber,
    teamIdentifier: config.teamId,
    organizationName: s.organization_name,
    description: s.description,
    foregroundColor: hexToRgb(s.text_color),
    backgroundColor: hexToRgb(s.bg_color),
    labelColor: hexToRgb(s.label_color),

    // Event ticket type
    eventTicket: {
      primaryFields: [
        {
          key: "event",
          label: "EVENT",
          value: ticket.eventName,
        },
      ],
      secondaryFields,
      auxiliaryFields,
      backFields,
    },

    // QR barcode — uses the raw ticket code (same as PDF/email)
    barcode: {
      format: "PKBarcodeFormatQR",
      message: ticket.ticketCode,
      messageEncoding: "iso-8859-1",
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: ticket.ticketCode,
        messageEncoding: "iso-8859-1",
      },
    ],
  };

  // Add relevant date for lock screen notification
  try {
    const eventDate = new Date(ticket.eventDate);
    if (!isNaN(eventDate.getTime())) {
      pass.relevantDate = formatAppleDate(ticket.eventDate);
    }
  } catch {
    // Skip relevantDate if date is invalid
  }

  return pass;
}

/**
 * Create a minimal ZIP archive buffer.
 *
 * This is a purpose-built ZIP creator for .pkpass files.
 * It produces store-only (no compression) ZIP files which is
 * what Apple Wallet expects and is simpler + faster than deflate.
 */
function createZipBuffer(files: { name: string; data: Buffer }[]): Buffer {
  const entries: { name: string; data: Buffer; offset: number }[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;

  // Local file entries
  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, "utf-8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);   // Local file header signature
    header.writeUInt16LE(20, 4);           // Version needed (2.0)
    header.writeUInt16LE(0, 6);            // General purpose bit flag
    header.writeUInt16LE(0, 8);            // Compression: stored (no compression)
    header.writeUInt16LE(0, 10);           // Last mod time
    header.writeUInt16LE(0, 12);           // Last mod date
    const crc = crc32(file.data);
    header.writeUInt32LE(crc, 14);         // CRC-32
    header.writeUInt32LE(file.data.length, 18);  // Compressed size
    header.writeUInt32LE(file.data.length, 22);  // Uncompressed size
    header.writeUInt16LE(nameBuffer.length, 26); // File name length
    header.writeUInt16LE(0, 28);           // Extra field length

    entries.push({ name: file.name, data: file.data, offset });
    chunks.push(header, nameBuffer, file.data);
    offset += 30 + nameBuffer.length + file.data.length;
  }

  // Central directory
  const centralStart = offset;
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf-8");
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);   // Central directory header
    cdHeader.writeUInt16LE(20, 4);           // Version made by
    cdHeader.writeUInt16LE(20, 6);           // Version needed
    cdHeader.writeUInt16LE(0, 8);            // Flags
    cdHeader.writeUInt16LE(0, 10);           // Compression
    cdHeader.writeUInt16LE(0, 12);           // Last mod time
    cdHeader.writeUInt16LE(0, 14);           // Last mod date
    const crc = crc32(entry.data);
    cdHeader.writeUInt32LE(crc, 16);         // CRC-32
    cdHeader.writeUInt32LE(entry.data.length, 20);  // Compressed size
    cdHeader.writeUInt32LE(entry.data.length, 24);  // Uncompressed size
    cdHeader.writeUInt16LE(nameBuffer.length, 28);  // File name length
    cdHeader.writeUInt16LE(0, 30);           // Extra field length
    cdHeader.writeUInt16LE(0, 32);           // File comment length
    cdHeader.writeUInt16LE(0, 34);           // Disk number start
    cdHeader.writeUInt16LE(0, 36);           // Internal file attributes
    cdHeader.writeUInt32LE(0, 38);           // External file attributes
    cdHeader.writeUInt32LE(entry.offset, 42); // Relative offset

    chunks.push(cdHeader, nameBuffer);
    offset += 46 + nameBuffer.length;
  }

  // End of central directory
  const eocdr = Buffer.alloc(22);
  eocdr.writeUInt32LE(0x06054b50, 0);       // End of central directory
  eocdr.writeUInt16LE(0, 4);                // Disk number
  eocdr.writeUInt16LE(0, 6);                // Disk with central directory
  eocdr.writeUInt16LE(entries.length, 8);   // Entries on this disk
  eocdr.writeUInt16LE(entries.length, 10);  // Total entries
  eocdr.writeUInt32LE(offset - centralStart, 12);  // Central directory size
  eocdr.writeUInt32LE(centralStart, 16);    // Central directory offset
  eocdr.writeUInt16LE(0, 20);              // Comment length

  chunks.push(eocdr);
  return Buffer.concat(chunks);
}

/** CRC-32 computation for ZIP file format */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table.push(crc >>> 0);
  }
  return table;
})();

/**
 * Create a PKCS7 detached signature for the manifest.
 *
 * Apple Wallet requires a PKCS#7 detached signature:
 * - Signed with the Pass Type Certificate private key
 * - Includes the Pass Type Certificate
 * - Includes the Apple WWDR Intermediate Certificate
 */
function signManifest(
  manifestData: Buffer,
  config: AppleWalletConfig,
): Buffer {
  // Parse the pass certificate and private key
  const p12Asn1 = forge.asn1.fromDer(
    forge.util.decode64(
      config.passCertPem
        .replace(/-----BEGIN [^-]+-----/g, "")
        .replace(/-----END [^-]+-----/g, "")
        .replace(/\s/g, "")
    )
  );

  let certPem: string;
  let privateKeyPem: string;

  // Try PKCS12 first, then PEM
  try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, config.passCertPassword);
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

    const certBag = (certBags[forge.pki.oids.certBag] || [])[0];
    const keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];

    if (!certBag?.cert || !keyBag?.key) {
      throw new Error("Certificate or private key not found in PKCS12");
    }

    certPem = forge.pki.certificateToPem(certBag.cert);
    privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  } catch {
    // If not PKCS12, treat as PEM directly
    certPem = config.passCertPem;
    privateKeyPem = config.passCertPem;
  }

  // Parse certificates
  const signerCert = forge.pki.certificateFromPem(certPem);
  const signerKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const wwdrCert = forge.pki.certificateFromPem(config.wwdrCertPem);

  // Create PKCS7 signed data (detached)
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestData.toString("binary"));
  p7.addCertificate(signerCert);
  p7.addCertificate(wwdrCert);
  p7.addSigner({
    key: signerKey,
    certificate: signerCert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date() as unknown as string,
      },
    ],
  });

  p7.sign({ detached: true });

  // Convert to DER
  const asn1 = p7.toAsn1();
  const der = forge.asn1.toDer(asn1);
  return Buffer.from(der.getBytes(), "binary");
}

/**
 * Generate a 1×1 PNG in a given color (minimal icon/placeholder).
 * Used as fallback when no logo is uploaded.
 */
function generateMinimalPng(r: number, g: number, b: number, size: number = 29): Buffer {
  // Create a minimal valid PNG
  const width = size;
  const height = size;

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // Bit depth
  ihdrData[9] = 2;  // Color type: RGB
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace

  const ihdrChunk = createPngChunk("IHDR", ihdrData);

  // IDAT chunk — raw image data with filter byte 0 per row
  const rawRow = Buffer.alloc(1 + width * 3);
  rawRow[0] = 0; // No filter
  for (let x = 0; x < width; x++) {
    rawRow[1 + x * 3] = r;
    rawRow[2 + x * 3] = g;
    rawRow[3 + x * 3] = b;
  }
  const rawData = Buffer.concat(Array(height).fill(rawRow));

  // Deflate the raw data
  const { deflateSync } = require("zlib") as typeof import("zlib");
  const compressed = deflateSync(rawData);
  const idatChunk = createPngChunk("IDAT", compressed);

  // IEND chunk
  const iendChunk = createPngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBuffer, data]);
  const crcValue = pngCrc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crcValue, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function pngCrc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Fetch an image from a URL or media key and return as Buffer.
 * Handles both absolute URLs and /api/media/[key] paths.
 */
async function fetchImageBuffer(url: string | undefined): Promise<Buffer | null> {
  if (!url) return null;

  try {
    // If it's a data URL, decode directly
    if (url.startsWith("data:")) {
      const match = url.match(/^data:[^;]+;base64,(.+)$/);
      if (match) return Buffer.from(match[1], "base64");
      return null;
    }

    // If it's a media key path, fetch from DB directly
    if (url.startsWith("/api/media/")) {
      const key = url.replace("/api/media/", "");
      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      const { TABLES } = await import("@/lib/constants");
      const supabase = getSupabaseAdmin();
      if (!supabase) return null;

      const { data } = await supabase
        .from(TABLES.SITE_SETTINGS)
        .select("data")
        .eq("key", `media_${key}`)
        .single();

      const d = data?.data as { image?: string } | null;
      if (d?.image) {
        const match = d.image.match(/^data:[^;]+;base64,(.+)$/);
        if (match) return Buffer.from(match[1], "base64");
      }
      return null;
    }

    // External URL — fetch it
    if (url.startsWith("http")) {
      const response = await fetch(url);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    }
  } catch {
    // Image fetch failed — graceful degradation
  }
  return null;
}

/**
 * Generate an Apple Wallet .pkpass file for a single ticket.
 *
 * Returns the .pkpass buffer (ZIP file) or null if Apple Wallet is not configured.
 *
 * CRITICAL: The QR code in the pass uses the raw ticket code — the EXACT same
 * value as the PDF and email QR codes. This ensures door scanning works
 * identically regardless of which medium the customer presents.
 */
export async function generateApplePass(
  ticket: WalletPassTicketData,
  settings: WalletPassSettings,
): Promise<Buffer | null> {
  const config = await getAppleWalletConfig(settings);
  if (!config) {
    console.log("[wallet] Apple Wallet not configured — missing certificate or identifiers");
    return null;
  }

  const s = { ...DEFAULT_WALLET_PASS_SETTINGS, ...settings };
  const passJson = buildApplePassJson(ticket, s, config);
  const passJsonBuffer = Buffer.from(JSON.stringify(passJson), "utf-8");

  // Prepare pass images
  const bgParsed = hexToComponents(s.bg_color);

  // Try to load custom logo, fall back to generated placeholder
  const logoBuffer = await fetchImageBuffer(s.logo_url);
  const stripBuffer = await fetchImageBuffer(s.strip_url);
  const iconBuffer = logoBuffer || generateMinimalPng(bgParsed.r, bgParsed.g, bgParsed.b, 29);
  const icon2xBuffer = logoBuffer || generateMinimalPng(bgParsed.r, bgParsed.g, bgParsed.b, 58);

  // Build file list for the pass
  const passFiles: { name: string; data: Buffer }[] = [
    { name: "pass.json", data: passJsonBuffer },
    { name: "icon.png", data: iconBuffer },
    { name: "icon@2x.png", data: icon2xBuffer },
  ];

  if (logoBuffer) {
    passFiles.push({ name: "logo.png", data: logoBuffer });
    passFiles.push({ name: "logo@2x.png", data: logoBuffer });
  }

  if (stripBuffer) {
    passFiles.push({ name: "strip.png", data: stripBuffer });
    passFiles.push({ name: "strip@2x.png", data: stripBuffer });
  }

  // Create manifest.json (SHA-1 hash of each file)
  const manifest: Record<string, string> = {};
  for (const file of passFiles) {
    const hash = crypto.createHash("sha1").update(file.data).digest("hex");
    manifest[file.name] = hash;
  }
  const manifestBuffer = Buffer.from(JSON.stringify(manifest), "utf-8");

  // Sign the manifest
  const signatureBuffer = signManifest(manifestBuffer, config);

  // Build the final .pkpass ZIP
  const allFiles = [
    ...passFiles,
    { name: "manifest.json", data: manifestBuffer },
    { name: "signature", data: signatureBuffer },
  ];

  return createZipBuffer(allFiles);
}

/**
 * Generate Apple Wallet .pkpasses bundle for multiple tickets.
 *
 * iOS 16+ supports .pkpasses bundles — a ZIP containing multiple .pkpass files.
 * This allows adding all tickets from an order in a single tap.
 *
 * Falls back to individual .pkpass if only one ticket.
 */
export async function generateApplePassBundle(
  tickets: WalletPassTicketData[],
  settings: WalletPassSettings,
): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
  if (tickets.length === 0) return null;

  // Single ticket — return individual .pkpass
  if (tickets.length === 1) {
    const pass = await generateApplePass(tickets[0], settings);
    if (!pass) return null;
    return {
      buffer: pass,
      contentType: "application/vnd.apple.pkpass",
      filename: `${tickets[0].ticketCode}.pkpass`,
    };
  }

  // Multiple tickets — create .pkpasses bundle
  const passFiles: { name: string; data: Buffer }[] = [];

  for (const ticket of tickets) {
    const pass = await generateApplePass(ticket, settings);
    if (pass) {
      passFiles.push({
        name: `${ticket.ticketCode}.pkpass`,
        data: pass,
      });
    }
  }

  if (passFiles.length === 0) return null;

  const bundle = createZipBuffer(passFiles);
  return {
    buffer: bundle,
    contentType: "application/vnd.apple.pkpasses",
    filename: `${tickets[0].orderNumber}-tickets.pkpasses`,
  };
}

/* ═══════════════════════════════════════════════════════════
   GOOGLE WALLET
   ═══════════════════════════════════════════════════════════

   Google Wallet uses a JWT-based approach:
   1. Define a Pass Class (template) via API or JWT
   2. Create Pass Objects (instances) for each ticket
   3. Generate a "Save to Google Wallet" URL with the JWT
   4. Customer clicks URL → pass added to Google Wallet

   The JWT is signed with a Google Cloud service account key.
   ═══════════════════════════════════════════════════════════ */

interface GoogleWalletConfig {
  issuerId: string;
  serviceAccountEmail: string;
  privateKey: string;
}

/**
 * Read Google Wallet config from environment variables.
 */
function getGoogleWalletConfig(settings: WalletPassSettings): GoogleWalletConfig | null {
  const keyJson = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY;
  const issuerId = settings.google_issuer_id || process.env.GOOGLE_WALLET_ISSUER_ID;

  if (!keyJson || !issuerId) return null;

  try {
    const decoded = keyJson.includes("{") ? keyJson : Buffer.from(keyJson, "base64").toString("utf-8");
    const key = JSON.parse(decoded);
    return {
      issuerId,
      serviceAccountEmail: key.client_email,
      privateKey: key.private_key,
    };
  } catch {
    console.error("[wallet] Failed to parse Google Wallet service account key");
    return null;
  }
}

/**
 * Create a JWT for Google Wallet "Save" URL.
 * The JWT contains both the class and object definitions inline.
 */
function createGoogleWalletJwt(
  passObjects: Record<string, unknown>[],
  config: GoogleWalletConfig,
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: config.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: now,
    origins: ["https://feralpresents.com"],
    payload: {
      eventTicketObjects: passObjects,
    },
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Sign with service account private key
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(config.privateKey);
  const signatureB64 = base64UrlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build a Google Wallet event ticket object for a single ticket.
 */
function buildGooglePassObject(
  ticket: WalletPassTicketData,
  settings: WalletPassSettings,
  config: GoogleWalletConfig,
): Record<string, unknown> {
  const s = { ...DEFAULT_WALLET_PASS_SETTINGS, ...settings };
  const classSuffix = s.google_class_suffix || "event_ticket";
  const classId = `${config.issuerId}.${classSuffix}`;
  const objectId = `${config.issuerId}.${ticket.ticketCode.replace(/-/g, "_")}`;

  const textModulesData: Record<string, unknown>[] = [];

  // Ticket type
  textModulesData.push({
    header: "TICKET",
    body: ticket.ticketType,
    id: "ticket_type",
  });

  // Merch info
  if (ticket.includesMerch || ticket.merchSize) {
    const merchBody = ticket.merchSize
      ? `Includes ${ticket.merchName || "Merch"} (${ticket.merchSize})`
      : `Includes ${ticket.merchName || "Merch"}`;
    textModulesData.push({
      header: "MERCH",
      body: merchBody,
      id: "merch",
    });
  }

  // Holder name
  if (s.show_holder && ticket.holderName) {
    textModulesData.push({
      header: "TICKET HOLDER",
      body: ticket.holderName,
      id: "holder",
    });
  }

  // Order number
  if (s.show_order_number) {
    textModulesData.push({
      header: "ORDER",
      body: ticket.orderNumber,
      id: "order",
    });
  }

  const obj: Record<string, unknown> = {
    id: objectId,
    classId,
    state: "ACTIVE",
    heroImage: s.strip_url ? {
      sourceUri: { uri: resolveGoogleUrl(s.strip_url) },
      contentDescription: { defaultValue: { language: "en", value: s.organization_name } },
    } : undefined,
    textModulesData,
    barcode: {
      type: "QR_CODE",
      value: ticket.ticketCode, // EXACT same QR value as PDF/email
    },
    eventName: {
      defaultValue: { language: "en", value: ticket.eventName },
    },
    venue: {
      name: {
        defaultValue: { language: "en", value: ticket.venueName || "" },
      },
    },
    dateTime: {
      start: formatAppleDate(ticket.eventDate),
      doorsOpen: ticket.doorsTime
        ? formatAppleDate(ticket.eventDate).replace(/T.+$/, `T${ticket.doorsTime}:00`)
        : undefined,
    },
    hexBackgroundColor: s.bg_color,
    logo: s.logo_url ? {
      sourceUri: { uri: resolveGoogleUrl(s.logo_url) },
      contentDescription: { defaultValue: { language: "en", value: s.organization_name } },
    } : undefined,
    // Inline class definition (no need to pre-create via API)
    classReference: {
      id: classId,
      eventName: {
        defaultValue: { language: "en", value: ticket.eventName },
      },
      issuerName: s.organization_name,
      reviewStatus: "UNDER_REVIEW",
      hexBackgroundColor: s.bg_color,
      logo: s.logo_url ? {
        sourceUri: { uri: resolveGoogleUrl(s.logo_url) },
        contentDescription: { defaultValue: { language: "en", value: s.organization_name } },
      } : undefined,
    },
  };

  return obj;
}

/** Resolve a relative URL to absolute for Google Wallet */
function resolveGoogleUrl(url: string): string {
  if (url.startsWith("http")) return url;
  if (url.startsWith("data:")) return url;
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/$/, "");
  if (!siteUrl) return url;
  return `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Generate a "Save to Google Wallet" URL for one or more tickets.
 *
 * Returns the complete URL that can be used as an href.
 * The URL embeds a signed JWT containing the pass data — no API call needed
 * at generation time. Google validates the JWT when the customer clicks.
 *
 * CRITICAL: The barcode value is the raw ticket code (same as PDF/email QR).
 */
export function generateGoogleWalletUrl(
  tickets: WalletPassTicketData[],
  settings: WalletPassSettings,
): string | null {
  const config = getGoogleWalletConfig(settings);
  if (!config) {
    console.log("[wallet] Google Wallet not configured — missing service account or issuer ID");
    return null;
  }

  const s = { ...DEFAULT_WALLET_PASS_SETTINGS, ...settings };
  const passObjects = tickets.map((t) => buildGooglePassObject(t, s, config));
  const jwt = createGoogleWalletJwt(passObjects, config);

  return `https://pay.google.com/gp/v/save/${jwt}`;
}

/* ═══════════════════════════════════════════════════════════
   UTILITY: Check configuration status
   ═══════════════════════════════════════════════════════════ */

export interface WalletConfigStatus {
  apple: {
    configured: boolean;
    hasCertificate: boolean;
    hasWwdr: boolean;
    hasPassTypeId: boolean;
    hasTeamId: boolean;
  };
  google: {
    configured: boolean;
    hasServiceAccount: boolean;
    hasIssuerId: boolean;
  };
}

/**
 * Check which wallet providers are properly configured.
 * Used by the admin UI to show configuration status.
 */
export function getWalletConfigStatus(settings: WalletPassSettings): WalletConfigStatus {
  const hasCert = !!process.env.APPLE_PASS_CERTIFICATE;
  // WWDR G4 cert is auto-fetched from Apple at runtime — always available unless
  // the server is air-gapped AND the env var isn't set. Mark as true since auto-fetch
  // handles it transparently.
  const hasWwdr = true;
  const hasPassTypeId = !!(settings.apple_pass_type_id || process.env.APPLE_PASS_TYPE_IDENTIFIER);
  const hasTeamId = !!(settings.apple_team_id || process.env.APPLE_PASS_TEAM_IDENTIFIER);

  const hasServiceAccount = !!process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY;
  const hasIssuerId = !!(settings.google_issuer_id || process.env.GOOGLE_WALLET_ISSUER_ID);

  return {
    apple: {
      configured: hasCert && hasPassTypeId && hasTeamId,
      hasCertificate: hasCert,
      hasWwdr,
      hasPassTypeId,
      hasTeamId,
    },
    google: {
      configured: hasServiceAccount && hasIssuerId,
      hasServiceAccount,
      hasIssuerId,
    },
  };
}

/** Parse hex to RGB components */
function hexToComponents(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}
