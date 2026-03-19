"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "@/styles/tailwind.css";
import "@/styles/scanner.css";
import { useScannerPWA } from "@/hooks/useScannerPWA";
import { ScannerInstallPrompt } from "@/components/scanner/ScannerInstallPrompt";

const PUBLIC_PAGES = ["/scanner/login"];

function isPublic(pathname: string) {
  return PUBLIC_PAGES.some((p) => pathname.startsWith(p));
}

export default function ScannerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPage = isPublic(pathname);
  const [authChecked, setAuthChecked] = useState(isPublicPage);
  const { shouldShowInstall, platform, iosBrowser, promptInstall, dismissInstall, isStandalone } = useScannerPWA();
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Check auth for protected pages
  useEffect(() => {
    if (isPublicPage) {
      setAuthChecked(true);
      return;
    }

    (async () => {
      try {
        // Quick auth check via the scanner events endpoint
        const res = await fetch("/api/scanner/events");
        if (res.status === 401 || res.status === 403) {
          router.replace(`/scanner/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
        setAuthChecked(true);
      } catch {
        router.replace("/scanner/login");
      }
    })();
  }, [isPublicPage, pathname, router]);

  // Add manifest link to head
  useEffect(() => {
    if (typeof document === "undefined") return;
    const existing = document.querySelector('link[rel="manifest"][href="/api/scanner/manifest"]');
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/api/scanner/manifest";
    document.head.appendChild(link);

    // Theme color meta
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = "#08080c";

    // Apple mobile web app meta tags
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const capable = document.createElement("meta");
      capable.name = "apple-mobile-web-app-capable";
      capable.content = "yes";
      document.head.appendChild(capable);

      const statusBar = document.createElement("meta");
      statusBar.name = "apple-mobile-web-app-status-bar-style";
      statusBar.content = "black-translucent";
      document.head.appendChild(statusBar);
    }
  }, []);

  // Show install prompt on first visit if not standalone
  useEffect(() => {
    if (!shouldShowInstall || isStandalone || isPublicPage) return;
    const timer = setTimeout(() => setShowInstallModal(true), 3000);
    return () => clearTimeout(timer);
  }, [shouldShowInstall, isStandalone, isPublicPage]);

  // Loading state
  if (!authChecked) {
    return (
      <div data-admin data-scanner className="min-h-[100dvh] bg-background text-foreground">
        <div className="flex items-center justify-center min-h-[100dvh]">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div data-admin data-scanner className="min-h-[100dvh] bg-background text-foreground">
      {/* Safe area spacer for standalone PWA */}
      <div className="h-[env(safe-area-inset-top)]" />

      <main className="pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>

      {/* PWA Install Modal */}
      {showInstallModal && (
        <ScannerInstallPrompt
          platform={platform}
          iosBrowser={iosBrowser}
          onInstall={promptInstall}
          onDismiss={() => {
            setShowInstallModal(false);
            dismissInstall();
          }}
        />
      )}
    </div>
  );
}
