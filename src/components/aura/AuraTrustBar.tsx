"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Zap, BadgeCheck } from "lucide-react";

export function AuraTrustBar() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-8 py-4">
      <Card className="border-dashed">
        <CardContent className="space-y-3 flex flex-col items-center">
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            <Badge variant="secondary" className="gap-1.5 font-normal">
              <Lock size={14} />
              256-bit encrypted
            </Badge>
            <Badge variant="secondary" className="gap-1.5 font-normal">
              <Zap size={14} />
              Instant delivery
            </Badge>
            <Badge variant="secondary" className="gap-1.5 font-normal">
              <BadgeCheck size={14} />
              Verified authentic
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Powered by Stripe
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
