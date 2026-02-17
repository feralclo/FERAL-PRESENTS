"use client";

import { useEffect, useState } from "react";

interface MidnightCartToastProps {
  message: string | null;
}

export function MidnightCartToast({ message }: MidnightCartToastProps) {
  const [visible, setVisible] = useState(false);
  const [displayMessage, setDisplayMessage] = useState("");
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!message) return;
    setDisplayMessage(message);
    setExiting(false);
    setVisible(true);

    const dismissTimer = setTimeout(() => {
      setExiting(true);
    }, 2200);

    const removeTimer = setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 2500);

    return () => {
      clearTimeout(dismissTimer);
      clearTimeout(removeTimer);
    };
  }, [message]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-24 right-4 max-md:right-3 max-md:bottom-[88px] z-[998] pointer-events-none"
      style={{
        animation: exiting
          ? "midnight-toast-out 300ms ease-in forwards"
          : "midnight-toast-in 300ms ease-out forwards",
      }}
    >
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-card/90 border border-foreground/[0.06] backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          className="text-primary shrink-0"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M5 8l2 2 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-[family-name:var(--font-sans)] text-[11px] font-medium tracking-[0.01em] text-foreground/80 whitespace-nowrap">
          {displayMessage}
        </span>
      </div>
    </div>
  );
}
