interface MidnightTrustBarProps {
  applePayAvailable?: boolean;
}

export function MidnightTrustBar({ applePayAvailable }: MidnightTrustBarProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-5">
      {/* No Booking Fees */}
      <div className="flex items-center gap-1.5 px-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/40 shrink-0">
          <path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3" />
          <path d="M2 9v6a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9" />
          <path d="M12 6v12" />
          <path d="M2 12h20" />
        </svg>
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.06em] text-foreground/40 whitespace-nowrap">
          No Booking Fees
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-foreground/10 shrink-0" />

      {/* Instant E-Tickets */}
      <div className="flex items-center gap-1.5 px-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/40 shrink-0">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.06em] text-foreground/40 whitespace-nowrap">
          Instant E-Tickets
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-foreground/10 shrink-0" />

      {/* Secure Checkout / Apple Pay */}
      <div className="flex items-center gap-1.5 px-3">
        {applePayAvailable ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-foreground/40 shrink-0">
              <path d="M17.05 20.28c-.98.95-2.05-.2-3.08-.2-1.09 0-2.05 1.07-3.22 1.11-1.09.05-2.13-.96-3.06-2.11-2.56-3.16-2.8-6.77-1.18-8.72 1.13-1.36 2.93-1.77 4.08-1.77.95 0 1.71.44 2.31.44.56 0 1.64-.54 2.79-.46.77.03 2.94.31 4.03 2.36-3.54 2.07-2.98 5.95.33 7.35zm-4.72-14.18c.82-1.01 1.38-2.4 1.16-3.82-1.25.08-2.7.87-3.57 1.9-.78.92-1.43 2.31-1.18 3.67 1.35.1 2.75-.77 3.59-1.75z" />
            </svg>
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.06em] text-foreground/40 whitespace-nowrap">
              Apple Pay
            </span>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/40 shrink-0">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.06em] text-foreground/40 whitespace-nowrap">
              Secure Checkout
            </span>
          </>
        )}
      </div>
    </div>
  );
}
