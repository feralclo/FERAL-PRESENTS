import type { ReactNode } from "react";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/**
 * Lightweight layout for guest list public pages (RSVP, DJ submission).
 * Uses admin design tokens for consistent styling.
 * Imports admin.css to hide scanlines/noise overlays from root layout.
 */
export default function GuestListLayout({ children }: { children: ReactNode }) {
  return (
    <div data-admin className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
