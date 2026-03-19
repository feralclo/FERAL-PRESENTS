"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const TEST_TICKETS = [
  { code: "TEST-GA-000001", type: "General", holder: "Alice Johnson" },
  { code: "TEST-GA-000002", type: "General", holder: "Bob Smith" },
  { code: "TEST-GA-000003", type: "General", holder: "Charlie Brown" },
  { code: "TEST-GA-000004", type: "General", holder: "Diana Ross" },
  { code: "TEST-GA-000005", type: "General", holder: "Eve Taylor" },
  { code: "TEST-GA-000006", type: "General", holder: "Frank Wilson" },
  { code: "TEST-VIP-00001", type: "VIP", holder: "Grace Lee" },
  { code: "TEST-VIP-00002", type: "VIP", holder: "Henry Park" },
  { code: "TEST-VIP-00003", type: "VIP", holder: "Isla Chen" },
  { code: "TEST-VIP-00004", type: "VIP", holder: "Jack Kim" },
  { code: "TEST-MERCH-001", type: "VIP + Merch (L)", holder: "Kate Davis" },
  { code: "TEST-MERCH-002", type: "VIP + Merch (M)", holder: "Leo Martinez" },
];

export default function TestQRPage() {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const codes: Record<string, string> = {};
      for (const ticket of TEST_TICKETS) {
        codes[ticket.code] = await QRCode.toDataURL(ticket.code, {
          width: 200,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
      }
      setQrCodes(codes);
    })();
  }, []);

  return (
    <div data-admin className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold mb-2">Scanner Test QR Codes</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Open this page on one device, scan from the scanner on another.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {TEST_TICKETS.map((ticket) => (
            <div
              key={ticket.code}
              className="rounded-xl border border-border/60 bg-card p-4 text-center"
            >
              {qrCodes[ticket.code] ? (
                <img
                  src={qrCodes[ticket.code]}
                  alt={ticket.code}
                  className="mx-auto mb-3 rounded-lg"
                  width={160}
                  height={160}
                />
              ) : (
                <div className="mx-auto mb-3 h-[160px] w-[160px] rounded-lg bg-muted animate-pulse" />
              )}
              <p className="font-mono text-[11px] text-foreground font-semibold">
                {ticket.code}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {ticket.holder}
              </p>
              <span className="inline-block mt-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {ticket.type}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/50 mt-8 text-center">
          This page is for testing only. Delete after use.
        </p>
      </div>
    </div>
  );
}
