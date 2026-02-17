"use client";

import { useBranding } from "@/hooks/useBranding";

export function MidnightFooter() {
  const branding = useBranding();

  return (
    <footer className="py-6 px-6 max-md:py-5 max-md:px-4">
      <div className="max-w-[1200px] mx-auto">
        <div className="h-px bg-foreground/[0.04] mb-5" />
        <div className="flex items-center justify-between text-muted-foreground/50 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.08em] uppercase">
          <span data-branding="copyright">
            &copy; {new Date().getFullYear()}{" "}
            {branding.copyright_text || `${branding.org_name || "FERAL PRESENTS"}. All rights reserved.`}
          </span>
          <span className="text-muted-foreground/30">
            <span className="text-primary/50">&#9679;</span> Online
          </span>
        </div>
      </div>
    </footer>
  );
}
