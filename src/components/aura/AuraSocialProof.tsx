"use client";

import { useState, useEffect } from "react";
import { Ticket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div
      className={`fixed bottom-20 right-4 z-30 md:bottom-6 transition-all duration-300 ease-in-out ${
        visible
          ? "translate-x-0 opacity-100"
          : "translate-x-full opacity-0 pointer-events-none"
      }`}
    >
      <Card className="py-3">
        <CardContent className="flex items-center gap-3 px-4 py-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Ticket size={14} className="text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">
              Last ticket booked{" "}
              <span className="text-primary">{minutesAgo} min ago</span>
            </p>
            <Badge variant="default" className="mt-1 text-[10px]">
              Selling fast
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
