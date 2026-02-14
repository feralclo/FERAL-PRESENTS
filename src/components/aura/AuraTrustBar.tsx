"use client";

import { Lock, Zap, BadgeCheck } from "lucide-react";

export function AuraTrustBar() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-6">
      <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-sm text-muted-foreground">
        <TrustItem icon={<Lock size={15} />} text="256-bit Encryption" />
        <TrustItem icon={<Zap size={15} />} text="Instant Delivery" />
        <TrustItem icon={<BadgeCheck size={15} />} text="100% Authentic" />
      </div>
    </div>
  );
}

function TrustItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-aura-success">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
