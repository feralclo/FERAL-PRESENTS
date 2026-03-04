export function MidnightTrustBar() {
  const pill =
    "flex items-center gap-1.5 px-3 py-1.5 max-[480px]:px-2.5 max-[480px]:py-1 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm";

  return (
    <div className="flex items-center justify-center gap-2.5 max-[480px]:gap-2 mt-8 max-md:mt-6 max-[480px]:mt-5 flex-wrap">
      <div className={pill}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/35 shrink-0">
          <path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3" />
          <path d="M2 9v6a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9" />
          <path d="M12 6v12" />
          <path d="M2 12h20" />
        </svg>
        <span className="font-[family-name:var(--font-mono)] text-[10px] max-[480px]:text-[9px] tracking-[0.04em] text-foreground/35">
          No Booking Fees
        </span>
      </div>

      <div className={pill}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/35 shrink-0">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="font-[family-name:var(--font-mono)] text-[10px] max-[480px]:text-[9px] tracking-[0.04em] text-foreground/35">
          Instant E-Tickets
        </span>
      </div>

      <div className={pill}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/35 shrink-0">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="font-[family-name:var(--font-mono)] text-[10px] max-[480px]:text-[9px] tracking-[0.04em] text-foreground/35">
          Secure Checkout
        </span>
      </div>
    </div>
  );
}
