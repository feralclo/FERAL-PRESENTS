"use client";

import { useState, useEffect } from "react";
import { Ticket } from "lucide-react";

export function AuraSocialProof() {
  const [visible, setVisible] = useState(false);
  const [minutesAgo, setMinutesAgo] = useState(0);

  useEffect(() => {
    // Weighted random distribution
    const rand = Math.random();
    let mins: number;
    if (rand < 0.4) mins = 1 + Math.floor(Math.random() * 3);       // 1-3 min (40%)
    else if (rand < 0.75) mins = 3 + Math.floor(Math.random() * 5);  // 3-8 min (35%)
    else if (rand < 0.95) mins = 8 + Math.floor(Math.random() * 7);  // 8-15 min (20%)
    else mins = 15 + Math.floor(Math.random() * 15);                 // 15-30 min (5%)
    setMinutesAgo(mins);

    const showTimer = setTimeout(() => setVisible(true), 5000);
    const hideTimer = setTimeout(() => setVisible(false), 12000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`fixed bottom-20 right-4 z-30 md:bottom-6 ${visible ? "aura-slide-in" : "aura-slide-out"}`}>
      <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/90 backdrop-blur-md px-4 py-3 shadow-lg aura-elevation-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Ticket size={14} className="text-primary" />
        </div>
        <div>
          <p className="text-xs font-medium text-foreground">
            Last ticket booked{" "}
            <span className="text-primary">{minutesAgo} min ago</span>
          </p>
          <p className="text-[10px] text-muted-foreground">Selling fast</p>
        </div>
      </div>
    </div>
  );
}
