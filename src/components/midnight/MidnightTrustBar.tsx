interface MidnightTrustBarProps {
  applePayAvailable?: boolean;
}

export function MidnightTrustBar({ applePayAvailable }: MidnightTrustBarProps) {
  const iconCls =
    "w-[11px] h-[11px] max-[480px]:w-[10px] max-[480px]:h-[10px] text-foreground/40 shrink-0";
  const textCls =
    "font-[family-name:var(--font-mono)] text-[10px] max-[480px]:text-[9px] tracking-[0.04em] text-foreground/40";

  return (
    <div className="flex items-center justify-between max-w-[400px] w-full mx-auto mt-8 max-md:mt-6 max-[480px]:mt-5">
      {/* No Booking Fees — tag icon (price association) */}
      <div className="flex items-center gap-[5px] max-[480px]:gap-1">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={iconCls}
        >
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
          <path d="M7 7h.01" />
        </svg>
        <span className={textCls}>No Booking Fees</span>
      </div>

      <div className="w-px h-2.5 bg-foreground/[0.08] shrink-0" />

      {/* Instant E-Tickets — bolt icon */}
      <div className="flex items-center gap-[5px] max-[480px]:gap-1">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={iconCls}
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className={textCls}>Instant E-Tickets</span>
      </div>

      <div className="w-px h-2.5 bg-foreground/[0.08] shrink-0" />

      {/* Secure Checkout / Apple Pay */}
      <div className="flex items-center gap-[5px] max-[480px]:gap-1">
        {applePayAvailable ? (
          <>
            <svg
              viewBox="0 0 384 512"
              fill="currentColor"
              className="w-[9px] h-[11px] max-[480px]:w-2 max-[480px]:h-[10px] text-foreground/40 shrink-0"
            >
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-27.1-46.5-42.1-82.5-45.1-34.3-2.9-71.8 20.3-85.7 20.3-14.7 0-48-19.4-73.6-19.4C73 140.2 0 197.6 0 312.5c0 34 6.2 69.1 18.7 105.4 18.8 55.4 83.3 145.3 136.8 145.3 21.8-.5 37.1-15.4 65.1-15.4 27.3 0 41.4 15.4 65.1 15.4 54.2-.8 112.2-83.7 124.4-119.2-3.1-1.4-56.1-28.7-56.3-89.1zM262.2 128.6c27-32.1 40.3-68.3 38.3-108.6-36.9 2.2-79.8 25.3-103.8 55.4-22 27.2-41.8 68.3-36.5 107.6 41.7 1.6 80.3-21.2 102-54.4" />
            </svg>
            <span className={textCls}>Apple Pay</span>
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={iconCls}
            >
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
