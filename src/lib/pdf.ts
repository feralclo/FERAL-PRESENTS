import { jsPDF } from "jspdf";
import { generateTicketQRBuffer } from "./qr";
import type { PdfTicketSettings } from "@/types/email";
import { DEFAULT_PDF_TICKET_SETTINGS } from "@/types/email";

export interface TicketPDFData {
  ticketCode: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  ticketType: string;
  holderName: string;
  orderNumber: string;
  merchSize?: string;
  merchName?: string;
  /** "merch_preorder" = shop-only merch (QR for collection only, not entry) */
  orderType?: string;
}

/** Parse hex color to [r, g, b] tuple */
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) || 0,
    parseInt(h.substring(2, 4), 16) || 0,
    parseInt(h.substring(4, 6), 16) || 0,
  ];
}

/** Resolve the best site URL from available env vars. */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "";
}

/**
 * Fetch an image URL and return as a data URL for embedding in the PDF.
 * Returns null if the fetch fails or the URL is not an image.
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;

    let absoluteUrl = url;
    if (!url.startsWith("http")) {
      const siteUrl = getSiteUrl();
      if (!siteUrl) return null;
      absoluteUrl = `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    }

    const res = await fetch(absoluteUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Generate a PDF containing all tickets.
 * Each ticket gets a full A5 page with branding,
 * event details, holder info, and QR code.
 *
 * Accepts optional PdfTicketSettings to customise appearance.
 */
export async function generateTicketsPDF(
  tickets: TicketPDFData[],
  customSettings?: Partial<PdfTicketSettings>,
  preloadedLogoDataUrl?: string | null
): Promise<Buffer> {
  const s = { ...DEFAULT_PDF_TICKET_SETTINGS, ...customSettings };

  // A5: 148mm x 210mm
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const pageWidth = 148;
  const centerX = pageWidth / 2;

  const [bgR, bgG, bgB] = hexRgb(s.bg_color);
  const [acR, acG, acB] = hexRgb(s.accent_color);
  const [txR, txG, txB] = hexRgb(s.text_color);
  const [secR, secG, secB] = hexRgb(s.secondary_color);

  // Use pre-loaded logo if provided, otherwise fetch via URL
  let logoDataUrl: string | null = preloadedLogoDataUrl ?? null;
  if (!logoDataUrl && s.logo_url) {
    logoDataUrl = await fetchImageAsDataUrl(s.logo_url);
  }

  // Get logo dimensions from the data URL for correct aspect ratio
  let logoAspect = 3; // fallback ratio (width / height)
  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      if (props.width && props.height) {
        logoAspect = props.width / props.height;
      }
    } catch { /* use fallback ratio */ }
  }

  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) doc.addPage();
    const t = tickets[i];

    // ── Dynamic layout: Y positions flow based on logo height ──
    // The preview mirrors this exact math so what you see is what you get.
    const logoY = 10;
    const brandH = logoDataUrl ? (() => {
      const maxW = pageWidth * 0.7;
      let lh = s.logo_height || 12;
      const lw = lh * logoAspect;
      if (lw > maxW) lh = maxW / logoAspect;
      return lh;
    })() : 12;
    const dividerY = Math.max(logoY + brandH + 4, 28);
    const eventNameY = dividerY + 12;
    const venueY = eventNameY + 8;
    const dateY = venueY + 6;
    const typeY = dateY + 12;
    const merchOffset = t.merchSize ? 16 : 0; // Space for merch label + item name + instruction
    const qrY = typeY + 10 + merchOffset;
    const qrBottom = qrY + s.qr_size;
    const codeY = qrBottom + 8;
    const holderY = codeY + 10;
    const orderY = holderY + (s.show_holder ? 8 : 0);

    // Bottom section positions are dynamic — they move down if merch info pushes content lower
    const bottomContentEnd = s.show_order ? orderY + 3 : (s.show_holder ? holderY + 3 : codeY + 3);
    const bottomDividerY = Math.max(bottomContentEnd + 3, 175);
    const disclaimerY1 = bottomDividerY + 7;
    const disclaimerY2 = disclaimerY1 + 6;

    // Background
    doc.setFillColor(bgR, bgG, bgB);
    doc.rect(0, 0, 148, 210, "F");

    // Top accent line
    doc.setFillColor(acR, acG, acB);
    doc.rect(0, 0, 148, 2, "F");

    // Brand: logo or text
    if (logoDataUrl) {
      try {
        const maxW = pageWidth * 0.7;
        let logoW = (s.logo_height || 12) * logoAspect;
        let logoH = s.logo_height || 12;
        if (logoW > maxW) {
          logoW = maxW;
          logoH = maxW / logoAspect;
        }
        doc.addImage(logoDataUrl, "PNG", centerX - logoW / 2, logoY, logoW, logoH);
      } catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(txR, txG, txB);
        doc.text(s.brand_name, centerX, 22, { align: "center" });
      }
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(txR, txG, txB);
      doc.text(s.brand_name, centerX, 22, { align: "center" });
    }

    // Divider
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.3);
    doc.line(24, dividerY, 124, dividerY);

    // Event name
    doc.setFontSize(14);
    doc.setTextColor(txR, txG, txB);
    doc.text(t.eventName.toUpperCase(), centerX, eventNameY, { align: "center" });

    // Venue + Date
    doc.setFontSize(9);
    doc.setTextColor(secR, secG, secB);
    doc.text(t.venueName, centerX, venueY, { align: "center" });
    doc.text(t.eventDate, centerX, dateY, { align: "center" });

    // Ticket type
    doc.setFontSize(11);
    doc.setTextColor(acR, acG, acB);
    doc.text(t.ticketType.toUpperCase(), centerX, typeY, { align: "center" });

    // Merch info (above QR — customer reads this before scanning)
    if (t.merchSize) {
      const isMerchOnly = t.orderType === "merch_preorder";
      // Label: "MERCH PRE-ORDER" for shop orders, "INCLUDES MERCH" for bundles
      doc.setFontSize(7);
      doc.setTextColor(acR, acG, acB);
      doc.text(isMerchOnly ? "MERCH PRE-ORDER" : "INCLUDES MERCH", centerX, typeY + 7, { align: "center" });
      // Merch item name + size
      const merchDetail = t.merchName
        ? `${t.merchName} · Size ${t.merchSize}`
        : `Size ${t.merchSize}`;
      doc.setFontSize(8);
      doc.setTextColor(secR, secG, secB);
      doc.text(merchDetail, centerX, typeY + 12, { align: "center" });
      // Instruction — merch-only = collection only, bundle = entry + collection
      doc.setFontSize(6);
      doc.text(
        isMerchOnly
          ? "Present QR at the merch stand to collect"
          : "Present QR for entry & merch collection",
        centerX,
        typeY + 17,
        { align: "center" }
      );
    }

    // QR Code
    const qrSize = s.qr_size;
    try {
      const qrBuffer = await generateTicketQRBuffer(t.ticketCode);
      const qrBase64 = `data:image/png;base64,${qrBuffer.toString("base64")}`;
      doc.addImage(qrBase64, "PNG", centerX - qrSize / 2, qrY, qrSize, qrSize);
    } catch {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("QR Code", centerX, qrY + qrSize / 2, { align: "center" });
    }

    // Ticket code
    doc.setFontSize(14);
    doc.setTextColor(acR, acG, acB);
    doc.text(t.ticketCode, centerX, codeY, { align: "center" });

    // Holder name
    if (s.show_holder) {
      doc.setFontSize(10);
      doc.setTextColor(txR, txG, txB);
      doc.text(t.holderName, centerX, holderY, { align: "center" });
    }

    // Order number
    if (s.show_order) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`ORDER: ${t.orderNumber}`, centerX, orderY, { align: "center" });
    }

    // Bottom divider (position is dynamic — moves down if merch content pushes it)
    doc.setDrawColor(40, 40, 40);
    doc.line(24, bottomDividerY, 124, bottomDividerY);

    // Disclaimer — override for merch-only pre-orders
    if (s.show_disclaimer) {
      const isMerchOnly = t.orderType === "merch_preorder";
      const line1 = isMerchOnly
        ? "THIS QR CODE IS FOR MERCH COLLECTION ONLY"
        : s.disclaimer_line1;
      const line2 = isMerchOnly
        ? "PRESENT AT THE MERCH STAND — NOT VALID FOR EVENT ENTRY"
        : s.disclaimer_line2;
      doc.setFontSize(7);
      doc.setTextColor(secR, secG, secB);
      doc.text(line1, centerX, disclaimerY1, { align: "center" });
      doc.text(line2, centerX, disclaimerY2, { align: "center" });
    }

    // Bottom accent line
    doc.setFillColor(acR, acG, acB);
    doc.rect(0, 208, 148, 2, "F");
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
