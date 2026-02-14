"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function AuroraSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl aurora-shimmer", className)}
      {...props}
    />
  );
}

export { AuroraSkeleton };
