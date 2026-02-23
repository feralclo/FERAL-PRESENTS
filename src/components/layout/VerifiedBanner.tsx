"use client";

import { useBranding } from "@/hooks/useBranding";

/**
 * Platform-level trust banner — brand-agnostic frosted glass.
 * Shows "VERIFIED · Official [Org] Ticket Store" across all public pages.
 * Styled via header.css (.announcement-banner*).
 */
export function VerifiedBanner() {
  const branding = useBranding();

  return (
    <div className="announcement-banner">
      <span className="announcement-banner__badge">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="announcement-banner__icon"
        >
          <path
            d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
            fill="#38BDF8"
          />
          <path
            d="M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z"
            fill="#0a0a0a"
          />
        </svg>
        VERIFIED
      </span>
      <span className="announcement-banner__divider" />
      <span className="announcement-banner__text">
        Official {branding.org_name || "Entry"} Ticket Store
      </span>
      <span className="announcement-banner__pulse" />
    </div>
  );
}
