import type { ReactNode } from "react";
import "@/styles/midnight.css";
import "@/styles/midnight-effects.css";

export const dynamic = "force-dynamic";

/**
 * Events listing layout — minimal wrapper.
 * Branding CSS vars are injected by EventsListPage (client component)
 * so the Header stays OUTSIDE the data-theme wrapper, matching homepage pattern.
 */
export default function EventsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
