"use client";

import { useState, useEffect } from "react";

export function MidnightTrustBar() {
  // Detect Apple device via UA — instant, no Stripe dependency.
  // SSR-safe: defaults to false, updates on mount before user can perceive.
  const [isApple, setIsApple] = useState(false);
  useEffect(() => {
    if (/iPhone|iPad/.test(navigator.userAgent)) {
      setIsApple(true);
    }
  }, []);

  // Inter (sans) instead of Space Mono — proportional font is ~25% more compact,
  // giving generous spacing on 375px iPhones without cramping.
  const iconCls =
    "w-[11px] h-[11px] text-foreground/30 shrink-0";
  const textCls =
    "font-[family-name:var(--font-sans)] text-[11px] max-[480px]:text-[10px] text-foreground/40 whitespace-nowrap";

  return (
    <div className="flex items-center justify-center gap-4 max-[480px]:gap-3 mt-8 max-md:mt-6 max-[480px]:mt-5">
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={iconCls}>
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
          <path d="M7 7h.01" />
        </svg>
        <span className={textCls}>No Booking Fees</span>
      </div>

      <div className="w-px h-3 bg-foreground/[0.08] shrink-0" />

      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={iconCls}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className={textCls}>Instant E-Tickets</span>
      </div>

      <div className="w-px h-3 bg-foreground/[0.08] shrink-0" />

      <div className="flex items-center gap-1.5">
        {isApple ? (
          <>
            <svg viewBox="0 0 24 24" fill="currentColor" className={iconCls}>
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.986 3.935-.986 1.831 0 2.35.986 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
            </svg>
            <span className={textCls}>Apple Pay</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={iconCls}>
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className={textCls}>Secure Checkout</span>
          </>
        )}
      </div>
    </div>
  );
}
