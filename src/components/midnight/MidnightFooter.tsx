"use client";

import { Separator } from "@/components/ui/separator";
import { useBranding } from "@/hooks/useBranding";

export function MidnightFooter() {
  const branding = useBranding();

  return (
    <footer className="py-8 px-6">
      <div className="max-w-[1200px] mx-auto">
        <Separator className="mb-6 opacity-30" />
        <div className="flex items-center justify-between text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-[1px] uppercase">
          <span data-branding="copyright">
            &copy; {new Date().getFullYear()}{" "}
            {branding.copyright_text || `${branding.org_name || "FERAL PRESENTS"}. ALL RIGHTS RESERVED.`}
          </span>
          <span>
            STATUS: <span className="text-primary">ONLINE</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
