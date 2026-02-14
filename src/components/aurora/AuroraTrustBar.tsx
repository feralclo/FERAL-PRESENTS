"use client";

export function AuroraTrustBar() {
  return (
    <div className="border-y border-aurora-border/50 bg-aurora-surface/30">
      <div className="mx-auto max-w-5xl px-5 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-aurora-text-secondary">
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 text-aurora-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          256-bit Encryption
        </span>
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 text-aurora-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Instant Delivery
        </span>
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 text-aurora-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          100% Authentic
        </span>
      </div>
    </div>
  );
}
