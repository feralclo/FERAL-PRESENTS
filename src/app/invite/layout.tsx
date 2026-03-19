import type { ReactNode } from "react";
import "@/styles/tailwind.css";

/**
 * Lightweight layout for the invite page — no admin layout overhead.
 * Just Tailwind CSS + the data-admin attribute for design tokens.
 */
export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <div data-admin className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
