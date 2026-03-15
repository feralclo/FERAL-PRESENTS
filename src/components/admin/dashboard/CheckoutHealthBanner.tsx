"use client";

import Link from "next/link";
import { AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CheckoutHealthBannerProps {
  status: "healthy" | "degraded" | "down";
  errors1h: number;
  lastErrorMessage: string | null;
}

export function CheckoutHealthBanner({
  status,
  errors1h,
  lastErrorMessage,
}: CheckoutHealthBannerProps) {
  if (status === "healthy") return null;

  const isDown = status === "down";

  return (
    <Card
      className={`border ${
        isDown
          ? "border-destructive/30 bg-destructive/[0.03]"
          : "border-warning/30 bg-warning/[0.03]"
      }`}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${
            isDown
              ? "bg-destructive/10 ring-destructive/20"
              : "bg-warning/10 ring-warning/20"
          }`}
        >
          {isDown ? (
            <XCircle size={18} className="text-destructive animate-pulse" />
          ) : (
            <AlertTriangle size={18} className="text-warning" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {isDown ? "Checkout is failing" : "Checkout errors detected"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {errors1h} error{errors1h !== 1 ? "s" : ""} in the last hour
            {lastErrorMessage ? ` — ${lastErrorMessage}` : ""}
          </p>
        </div>
        <Button size="sm" variant={isDown ? "destructive" : "outline"} asChild>
          <Link href="/admin/backend/payment-health/">
            Investigate
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
