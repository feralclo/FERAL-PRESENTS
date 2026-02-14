"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AuraCheckoutHeader } from "./AuraCheckoutHeader";
import { AuraFooter } from "./AuraFooter";
import { useMetaTracking } from "@/hooks/useMetaTracking";
import { getCurrencySymbol } from "@/lib/stripe/config";
import { CheckCircle2, Download, Wallet, ArrowLeft } from "lucide-react";
import type { Order } from "@/types/orders";

interface AuraOrderConfirmationProps {
  order: Order;
  slug: string;
  eventName: string;
  walletPassEnabled?: { apple?: boolean; google?: boolean };
}

export function AuraOrderConfirmation({
  order,
  slug,
  eventName,
  walletPassEnabled,
}: AuraOrderConfirmationProps) {
  const { trackPurchase } = useMetaTracking();
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);
  const [walletDownloading, setWalletDownloading] = useState<string | null>(null);
  const [googleWalletUrl, setGoogleWalletUrl] = useState<string | null>(null);
  const purchaseTracked = useRef(false);
  const symbol = getCurrencySymbol(order.currency || "GBP");

  // Track Purchase
  useEffect(() => {
    if (purchaseTracked.current) return;
    purchaseTracked.current = true;
    const ticketTypeIds = order.items?.map((i) => i.ticket_type_id) || [];
    const numItems = order.tickets?.length || order.items?.reduce((sum, i) => sum + i.qty, 0) || 0;
    trackPurchase({
      content_ids: ticketTypeIds,
      content_type: "product",
      value: Number(order.total),
      currency: order.currency || "GBP",
      num_items: numItems,
      order_id: order.order_number,
    });
  }, [order, trackPurchase]);

  // Generate QR codes
  useEffect(() => {
    async function loadQRCodes() {
      if (!order.tickets || order.tickets.length === 0) return;
      const QRCode = (await import("qrcode")).default;
      const codes: Record<string, string> = {};
      for (const ticket of order.tickets) {
        try {
          codes[ticket.ticket_code] = await QRCode.toDataURL(ticket.ticket_code, {
            errorCorrectionLevel: "H",
            margin: 2,
            width: 300,
            color: { dark: "#000000", light: "#ffffff" },
          });
        } catch { /* skip */ }
      }
      setQrCodes(codes);
    }
    loadQRCodes();
  }, [order.tickets]);

  // Fetch Google Wallet URL
  useEffect(() => {
    if (!walletPassEnabled?.google || !order.id) return;
    fetch(`/api/orders/${order.id}/wallet/google`)
      .then((r) => r.json())
      .then((data) => { if (data.url) setGoogleWalletUrl(data.url); })
      .catch(() => {});
  }, [order.id, walletPassEnabled?.google]);

  const handleDownloadPdf = async () => {
    if (!order.id) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tickets-${order.order_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    setDownloading(false);
  };

  const handleAppleWallet = async () => {
    if (!order.id) return;
    setWalletDownloading("apple");
    try {
      const res = await fetch(`/api/orders/${order.id}/wallet/apple`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const ct = res.headers.get("content-type") || "";
      const ext = ct.includes("pkpasses") ? ".pkpasses" : ".pkpass";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pass-${order.order_number}${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    setWalletDownloading(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AuraCheckoutHeader slug={slug} />

      <div className="mx-auto max-w-2xl px-5 py-10 space-y-8">
        {/* Success header */}
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold">
            You&apos;re going to {eventName}!
          </h1>
          <p className="text-sm text-muted-foreground">
            Order {order.order_number} confirmed. Check your email for details.
          </p>
        </div>

        {/* Order summary */}
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Order Number</span>
              <span className="text-sm font-medium font-mono">{order.order_number}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold tabular-nums">
                {symbol}{Number(order.total).toFixed(2)}
              </span>
            </div>
            {order.items && order.items.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.qty}&times; {item.ticket_type?.name || "Ticket"}
                        {item.merch_size && (
                          <Badge variant="secondary" className="ml-1.5 text-xs">
                            {item.merch_size}
                          </Badge>
                        )}
                      </span>
                      <span className="tabular-nums">
                        {symbol}{(item.unit_price * item.qty).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tickets with QR Codes */}
        {order.tickets && order.tickets.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Your Tickets</h2>
            {order.tickets.map((ticket) => (
              <Card key={ticket.id}>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {/* QR Code */}
                    <div className="shrink-0">
                      {qrCodes[ticket.ticket_code] ? (
                        <img
                          src={qrCodes[ticket.ticket_code]}
                          alt={`QR code for ${ticket.ticket_code}`}
                          className="h-32 w-32 rounded-xl"
                        />
                      ) : (
                        <div className="h-32 w-32 rounded-xl bg-muted animate-pulse" />
                      )}
                    </div>

                    {/* Ticket info */}
                    <div className="flex-1 text-center sm:text-left space-y-1">
                      <p className="font-mono text-xs text-muted-foreground tracking-wider">
                        {ticket.ticket_code}
                      </p>
                      <p className="text-base font-semibold">
                        {ticket.ticket_type?.name || "Ticket"}
                      </p>
                      <p className="text-sm text-muted-foreground">{eventName}</p>
                      {ticket.merch_size && (
                        <Badge variant="secondary" className="text-xs">
                          Merch: Size {ticket.merch_size}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {order.id && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleDownloadPdf}
              disabled={downloading}
            >
              <Download size={16} />
              {downloading ? "Downloading..." : "Download PDF Tickets"}
            </Button>
          )}

          {walletPassEnabled?.apple && order.id && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={handleAppleWallet}
              disabled={walletDownloading === "apple"}
            >
              <Wallet size={16} />
              {walletDownloading === "apple" ? "Downloading..." : "Add to Apple Wallet"}
            </Button>
          )}

          {walletPassEnabled?.google && googleWalletUrl && (
            <a href={googleWalletUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg" className="w-full">
                <Wallet size={16} />
                Add to Google Wallet
              </Button>
            </a>
          )}

          <Button variant="ghost" size="lg" className="w-full mt-2" asChild>
            <a href={`/event/${slug}/`}>
              <ArrowLeft size={16} />
              Back to Event
            </a>
          </Button>
        </div>
      </div>

      <AuraFooter />
    </div>
  );
}
