"use client";

import { useBranding } from "@/hooks/useBranding";

export function MidnightFooter() {
  const branding = useBranding();

  return (
    <footer className="py-10 px-6 max-md:py-8 max-md:px-4">
      <div className="max-w-[1200px] mx-auto">
        <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent mb-8 max-md:mb-6" />
        <div className="flex items-center justify-between">
          <span
            data-branding="copyright"
            className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.12em] uppercase text-foreground/25"
          >
            &copy; {new Date().getFullYear()}{" "}
            {branding.copyright_text || `${branding.org_name || "FERAL PRESENTS"}`}
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.12em] uppercase text-foreground/15">
            Entry
          </span>
        </div>
      </div>
    </footer>
  );
}
