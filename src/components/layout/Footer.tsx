"use client";

import { useBranding } from "@/hooks/useBranding";

export function Footer() {
  const branding = useBranding();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__inner">
          <span className="footer__copy">
            &copy; {new Date().getFullYear()} {branding.copyright_text || `${branding.org_name || "Entry"}. ALL RIGHTS RESERVED.`}
          </span>
          <span className="footer__status">
            STATUS: <span className="text-red">ONLINE</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
