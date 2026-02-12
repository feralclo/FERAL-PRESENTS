import type { ReactNode } from "react";

/**
 * Login page layout — bypasses the main admin layout.
 * Renders just the login form without sidebar/header chrome.
 */
export default function AdminLoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
