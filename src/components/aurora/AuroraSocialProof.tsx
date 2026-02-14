"use client";

import { useState, useEffect } from "react";

interface AuroraSocialProofProps {
  sold: number;
}

export function AuroraSocialProof({ sold }: AuroraSocialProofProps) {
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    // Simulate a realistic viewer count based on sold tickets
    const base = Math.max(12, Math.floor(sold * 0.08));
    const jitter = Math.floor(Math.random() * 15) - 5;
    setViewerCount(Math.max(5, base + jitter));

    const interval = setInterval(() => {
      setViewerCount((prev) => {
        const delta = Math.floor(Math.random() * 7) - 3;
        return Math.max(5, prev + delta);
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [sold]);

  if (sold === 0) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-aurora-text-secondary">
      {/* Viewer count */}
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {viewerCount} people viewing
      </span>

      {/* Sold count */}
      <span className="flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
        </svg>
        {sold.toLocaleString()} sold
      </span>
    </div>
  );
}
