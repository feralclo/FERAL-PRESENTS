import QRCode from "qrcode";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://feralpresents.com";

/**
 * Generate a QR code as a data URL (for inline display in HTML/emails).
 */
export async function generateTicketQR(ticketCode: string): Promise<string> {
  const validationUrl = `${BASE_URL}/api/tickets/${ticketCode}`;
  return QRCode.toDataURL(validationUrl, {
    errorCorrectionLevel: "M",
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
  const validationUrl = `${BASE_URL}/api/tickets/${ticketCode}`;
  return QRCode.toBuffer(validationUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 300,
  });
}
