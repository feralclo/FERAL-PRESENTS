"use client";

import { Badge } from "@/components/ui/badge";
import { Lock, Zap, BadgeCheck } from "lucide-react";

export function AuraTrustBar() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-8 py-4">
      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        <Badge variant="secondary" className="gap-1.5 font-normal">
          <Lock size={11} />
          256-bit encrypted
        </Badge>
        <Badge variant="secondary" className="gap-1.5 font-normal">
          <Zap size={11} />
          Instant delivery
        </Badge>
        <Badge variant="secondary" className="gap-1.5 font-normal">
          <BadgeCheck size={11} />
          Verified authentic
        </Badge>
      </div>
    </div>
  );
}
