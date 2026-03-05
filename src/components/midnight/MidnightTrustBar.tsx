interface MidnightTrustBarProps {
  applePayAvailable?: boolean;
}

export function MidnightTrustBar({ applePayAvailable }: MidnightTrustBarProps) {
  const pill =
    "flex items-center gap-1.5 px-2.5 py-1.5 max-[480px]:px-2 max-[480px]:py-1 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm";
  const icon = "text-foreground/35 shrink-0 hidden sm:block";
  const label =
    "font-[family-name:var(--font-mono)] text-[10px] max-[480px]:text-[9px] tracking-[0.04em] text-foreground/35 whitespace-nowrap";

  return (
    <div className="flex items-center justify-center gap-2 max-[480px]:gap-1.5 mt-8 max-md:mt-6 max-[480px]:mt-5">
      <div className={pill}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={icon}>
          <path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3" />
          <path d="M2 9v6a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9" />
          <path d="M12 6v12" />
          <path d="M2 12h20" />
        </svg>
        <span className={label}>No Booking Fees</span>
      </div>

      <div className={pill}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={icon}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className={label}>Instant E-Tickets</span>
      </div>

      <div className={pill}>
        {applePayAvailable ? (
          <>
            {/* Apple logo — clean, proportional reproduction */}
            <svg width="12" height="14" viewBox="0 0 170 200" className="text-foreground/35 shrink-0 hidden sm:block">
              <path fill="currentColor" d="M150.4 172.2c-4.5 10.5-9.8 20.2-15.9 29.1-8.4 12.1-15.2 20.5-20.6 25.1-8.2 7.6-17 11.5-26.4 11.7-6.7 0-14.8-1.9-24.3-5.8-9.5-3.8-18.3-5.8-26.2-5.8-8.4 0-17.3 2-27 5.8C20.5 236.2 13 238.2 7.4 238.3c-9 .3-18-3.8-27-12.3C-26.3 219.2-33 210.6-41 197c-8.6-14.5-15.6-31.4-21.2-50.6-6-20.7-9-40.8-9-60.1 0-22.2 4.8-41.4 14.4-57.4C-49.7 17.8-40.3 8.9-28.8 2.5-17.3-3.9-4.8-7.2 8.7-7.4c7.2 0 16.5 2.2 28.2 6.6 11.6 4.4 19 6.6 22.3 6.6 2.4 0 10.6-2.6 24.5-7.7 13.1-4.8 24.2-6.8 33.4-6 24.7 2 43.2 11.7 55.6 29.3-22.1 13.4-33 32.2-32.7 56.2.3 18.7 7 34.3 20 46.7 5.9 5.6 12.6 10 20 13-1.6 4.7-3.3 9.1-5.1 13.4zM115.1-24c0 14.7-5.4 28.4-16 41-12.8 15-28.3 23.7-45.1 22.3-.2-1.8-.4-3.7-.4-5.7 0-14.1 6.1-29.2 17-41.5 5.4-6.3 12.3-11.5 20.7-15.6 8.3-4.1 16.2-6.3 23.7-6.7.2 2.1.3 4.1.3 6.2z" transform="translate(70 30) scale(0.72)" />
            </svg>
            <span className={label}>Apple Pay</span>
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={icon}>
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className={label}>Secure Checkout</span>
          </>
        )}
      </div>
    </div>
  );
}
