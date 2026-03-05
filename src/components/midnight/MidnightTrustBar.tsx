"use client";

import { useState, useEffect } from "react";

interface MidnightTrustBarProps {
  applePayAvailable?: boolean;
}

export function MidnightTrustBar({ applePayAvailable }: MidnightTrustBarProps) {
  // Delay third signal so users never see the Secure Checkout → Apple Pay swap.
  // Stripe onReady fires within ~300-500ms, so a 1s gate covers it.
  // On Apple Pay devices: resolves immediately when detected (no delay).
  // On others: "Secure Checkout" fades in after 1s.
  const [thirdReady, setThirdReady] = useState(false);
  useEffect(() => {
    if (applePayAvailable) {
      setThirdReady(true);
      return;
    }
    const t = setTimeout(() => setThirdReady(true), 1000);
    return () => clearTimeout(t);
  }, [applePayAvailable]);

  const iconCls =
    "w-[11px] h-[11px] max-[480px]:w-[10px] max-[480px]:h-[10px] text-foreground/40 shrink-0";
  const textCls =
    "font-[family-name:var(--font-mono)] text-[10px] max-[480px]:text-[9px] tracking-[0.04em] text-foreground/40";
  const divider =
    "w-px h-2.5 bg-foreground/[0.08] mx-2.5 max-[480px]:mx-[7px] shrink-0";

  return (
    <div className="flex items-center justify-center mt-8 max-md:mt-6 max-[480px]:mt-5">
      {/* No Booking Fees — tag icon */}
      <div className="flex items-center gap-[4px] max-[480px]:gap-[3px]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={iconCls}>
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
          <path d="M7 7h.01" />
        </svg>
        <span className={textCls}>No Booking Fees</span>
      </div>

      <div className={divider} />

      {/* Instant E-Tickets — bolt */}
      <div className="flex items-center gap-[4px] max-[480px]:gap-[3px]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={iconCls}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className={textCls}>Instant E-Tickets</span>
      </div>

      {/* Third signal + divider — fades in together to avoid visible swap */}
      <div
        className={`flex items-center transition-opacity duration-500 ${
          thirdReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className={divider} />

        <div className="flex items-center gap-[4px] max-[480px]:gap-[3px]">
          {applePayAvailable ? (
            <>
              {/* Apple logo — Simple Icons 24×24 path, clean at small sizes */}
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
    </div>
  );
}
