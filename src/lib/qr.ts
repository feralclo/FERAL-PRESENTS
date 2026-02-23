import QRCode from "qrcode";

/**
 * Generate a QR code as a data URL (for inline display in HTML/emails).
 *
 * Encodes the raw ticket code (e.g., "ACME-A3B4C5D6") rather than a URL.
 * This is optimal for scanning speed and cross-platform compatibility:
 * - Smaller QR code = fewer modules = faster scan at any distance
 * - Works with external platforms (Skiddle, RA, etc.) that scan for codes
 * - High error correction (H = 30% recovery) for reliability in dark venues
 * - Our scanner app resolves the code server-side via /api/tickets/[code]
 */
export async function generateTicketQR(ticketCode: string): Promise<string> {
  return QRCode.toDataURL(ticketCode, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/**
 * Generate a QR code as a PNG Buffer (for PDF embedding).
 */
export async function generateTicketQRBuffer(
  ticketCode: string
): Promise<Buffer> {
  return QRCode.toBuffer(ticketCode, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
  });
}
