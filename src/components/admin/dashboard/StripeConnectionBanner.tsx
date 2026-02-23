"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface StripeConnectionBannerProps {
  connected: boolean;
  chargesEnabled: boolean;
}

export function StripeConnectionBanner({
  connected,
  chargesEnabled,
}: StripeConnectionBannerProps) {
  // Fully connected — don't render
  if (connected && chargesEnabled) return null;

  const isPartial = connected && !chargesEnabled;

  return (
    <Card className="mb-6 border-warning/30 bg-warning/[0.03]">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 ring-1 ring-warning/20">
          <CreditCard size={18} className="text-warning" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {isPartial
              ? "Complete your Stripe verification"
              : "Connect Stripe to accept payments"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isPartial
              ? "Your account is connected but needs verification before you can accept payments."
              : "Set up your payment account to start selling tickets and receiving payouts."}
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/admin/payments/">
            {isPartial ? "Complete Setup" : "Set Up Payments"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
