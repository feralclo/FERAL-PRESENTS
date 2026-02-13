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

/**
 * Generate a PDF containing all tickets.
 * Each ticket gets a full A5 page with branding,
 * event details, holder info, and QR code.
 *
 * Accepts optional PdfTicketSettings to customise appearance.
 */
export async function generateTicketsPDF(
  tickets: TicketPDFData[],
  customSettings?: Partial<PdfTicketSettings>
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

  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) doc.addPage();
    const t = tickets[i];

    // Background
    doc.setFillColor(bgR, bgG, bgB);
    doc.rect(0, 0, 148, 210, "F");

    // Top accent line
    doc.setFillColor(acR, acG, acB);
    doc.rect(0, 0, 148, 2, "F");

    // Brand name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(txR, txG, txB);
    doc.text(s.brand_name, centerX, 22, { align: "center" });

    // Divider
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.3);
    doc.line(24, 28, 124, 28);

    // Event name
    doc.setFontSize(14);
    doc.setTextColor(txR, txG, txB);
    doc.text(t.eventName.toUpperCase(), centerX, 40, { align: "center" });

    // Venue + Date
    doc.setFontSize(9);
    doc.setTextColor(secR, secG, secB);
    doc.text(t.venueName, centerX, 48, { align: "center" });
    doc.text(t.eventDate, centerX, 54, { align: "center" });

    // Ticket type
    doc.setFontSize(11);
    doc.setTextColor(acR, acG, acB);
    doc.text(t.ticketType.toUpperCase(), centerX, 66, { align: "center" });

    // Merch size
    if (t.merchSize) {
      doc.setFontSize(9);
      doc.setTextColor(secR, secG, secB);
      doc.text(`SIZE: ${t.merchSize}`, centerX, 73, { align: "center" });
    }

    // QR Code
    const qrSize = s.qr_size;
    try {
      const qrBuffer = await generateTicketQRBuffer(t.ticketCode);
      const qrBase64 = `data:image/png;base64,${qrBuffer.toString("base64")}`;
      const qrX = centerX - qrSize / 2;
      const qrY = t.merchSize ? 80 : 78;
      doc.addImage(qrBase64, "PNG", qrX, qrY, qrSize, qrSize);
    } catch {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("QR Code", centerX, 105, { align: "center" });
    }

    // Ticket code
    doc.setFontSize(14);
    doc.setTextColor(acR, acG, acB);
    const codeY = t.merchSize ? 140 : 138;
    doc.text(t.ticketCode, centerX, codeY, { align: "center" });

    // Holder name
    if (s.show_holder) {
      doc.setFontSize(10);
      doc.setTextColor(txR, txG, txB);
      doc.text(t.holderName, centerX, codeY + 10, { align: "center" });
    }

    // Order number
    if (s.show_order) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`ORDER: ${t.orderNumber}`, centerX, codeY + (s.show_holder ? 18 : 10), {
        align: "center",
      });
    }

    // Bottom divider
    doc.setDrawColor(40, 40, 40);
    doc.line(24, 175, 124, 175);

    // Disclaimer
    if (s.show_disclaimer) {
      doc.setFontSize(6);
      doc.setTextColor(80, 80, 80);
      doc.text(s.disclaimer_line1, centerX, 182, { align: "center" });
      doc.text(s.disclaimer_line2, centerX, 187, { align: "center" });
    }

    // Bottom accent line
    doc.setFillColor(acR, acG, acB);
    doc.rect(0, 208, 148, 2, "F");
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
