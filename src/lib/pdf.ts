import { jsPDF } from "jspdf";
import { generateTicketQRBuffer } from "./qr";

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

/**
 * Generate a PDF containing all tickets.
 * Each ticket gets a full A5 page with FERAL branding,
 * event details, holder info, and QR code.
 */
export async function generateTicketsPDF(
  tickets: TicketPDFData[]
): Promise<Buffer> {
  // A5: 148mm x 210mm
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const pageWidth = 148;
  const centerX = pageWidth / 2;

  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) doc.addPage();
    const t = tickets[i];

    // Background
    doc.setFillColor(14, 14, 14);
    doc.rect(0, 0, 148, 210, "F");

    // Top accent line
    doc.setFillColor(255, 0, 51);
    doc.rect(0, 0, 148, 2, "F");

    // Brand name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("FERAL PRESENTS", centerX, 22, { align: "center" });

    // Divider
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.3);
    doc.line(24, 28, 124, 28);

    // Event name
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(t.eventName.toUpperCase(), centerX, 40, { align: "center" });

    // Venue + Date
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(t.venueName, centerX, 48, { align: "center" });
    doc.text(t.eventDate, centerX, 54, { align: "center" });

    // Ticket type
    doc.setFontSize(11);
    doc.setTextColor(255, 0, 51);
    doc.text(t.ticketType.toUpperCase(), centerX, 66, { align: "center" });

    // Merch size
    if (t.merchSize) {
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`SIZE: ${t.merchSize}`, centerX, 73, { align: "center" });
    }

    // QR Code
    try {
      const qrBuffer = await generateTicketQRBuffer(t.ticketCode);
      const qrBase64 = `data:image/png;base64,${qrBuffer.toString("base64")}`;
      const qrSize = 50;
      const qrX = centerX - qrSize / 2;
      const qrY = t.merchSize ? 80 : 78;
      doc.addImage(qrBase64, "PNG", qrX, qrY, qrSize, qrSize);
    } catch {
      // QR failed — draw placeholder
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("QR Code", centerX, 105, { align: "center" });
    }

    // Ticket code
    doc.setFontSize(14);
    doc.setTextColor(255, 0, 51);
    const codeY = t.merchSize ? 140 : 138;
    doc.text(t.ticketCode, centerX, codeY, { align: "center" });

    // Holder name
    doc.setFontSize(10);
    doc.setTextColor(200, 200, 200);
    doc.text(t.holderName, centerX, codeY + 10, { align: "center" });

    // Order number
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`ORDER: ${t.orderNumber}`, centerX, codeY + 18, {
      align: "center",
    });

    // Bottom divider
    doc.setDrawColor(40, 40, 40);
    doc.line(24, 175, 124, 175);

    // Disclaimer
    doc.setFontSize(6);
    doc.setTextColor(80, 80, 80);
    doc.text("THIS TICKET IS VALID FOR ONE ENTRY ONLY", centerX, 182, {
      align: "center",
    });
    doc.text(
      "PRESENT THIS QR CODE AT THE DOOR FOR SCANNING",
      centerX,
      187,
      { align: "center" }
    );

    // Bottom accent line
    doc.setFillColor(255, 0, 51);
    doc.rect(0, 208, 148, 2, "F");
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
