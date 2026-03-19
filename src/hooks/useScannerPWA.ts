"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

type Platform = "ios" | "android" | "desktop" | "unknown";
type IOSBrowser = "safari" | "chrome" | "other" | null;

interface PWAState {
  supported: boolean;
  registered: boolean;
  installable: boolean;
  isStandalone: boolean;
  platform: Platform;
  iosBrowser: IOSBrowser;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return "ios";
  if (/iPad/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && "ontouchend" in document) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function detectIOSBrowser(platform: Platform): IOSBrowser {
  if (platform !== "ios") return null;
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return "chrome";
  if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return "other";
  return "safari";
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true) return true;
  return false;
}

const INSTALL_DISMISSED_KEY = "scanner_install_dismissed";
const INSTALL_DISMISS_DAYS = 7;

function isInstallDismissed(): boolean {
  try {
    const val = localStorage.getItem(INSTALL_DISMISSED_KEY);
    if (!val) return false;
    const dismissedAt = parseInt(val, 10);
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    return daysSince < INSTALL_DISMISS_DAYS;
  } catch {
    return false;
  }
}

function dismissInstallPromptStorage(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
  } catch {}
}

/**
 * PWA hook for the scanner app — adapted from useRepPWA.
 * No push notifications (scanner is active-use, not passive).
 */
export function useScannerPWA() {
  const [state, setState] = useState<PWAState>({
    supported: false,
    registered: false,
    installable: false,
    isStandalone: false,
    platform: "unknown",
    iosBrowser: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const platform = detectPlatform();
    const iosBrowser = detectIOSBrowser(platform);
    const isStandalone = detectStandalone();
    const swSupported = "serviceWorker" in navigator;

    setState((s) => ({
      ...s,
      supported: swSupported,
      isStandalone,
      platform,
      iosBrowser,
    }));

    if (!swSupported) return;

    navigator.serviceWorker
      .register("/scanner-sw.js", { scope: "/scanner" })
      .then(() => {
        setState((s) => ({ ...s, registered: true }));
      })
      .catch((err) => {
        console.warn("[ScannerPWA] SW registration failed:", err);
      });

    const handleInstall = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setState((s) => ({ ...s, installable: true }));
    };

    const handleInstalled = () => {
      deferredInstallPrompt = null;
      setState((s) => ({ ...s, installable: false, isStandalone: true }));
    };

    window.addEventListener("beforeinstallprompt", handleInstall);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredInstallPrompt) return false;
    try {
      await deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      setState((s) => ({ ...s, installable: false }));
      return result.outcome === "accepted";
    } catch {
      return false;
    }
  }, []);

  const shouldShowInstall = useMemo(() => {
    if (state.isStandalone) return false;
    if (isInstallDismissed()) return false;
    if (state.platform === "ios") return true;
    if (state.installable) return true;
    return false;
  }, [state.isStandalone, state.platform, state.installable]);

  return {
    ...state,
    shouldShowInstall,
    promptInstall,
    dismissInstall: dismissInstallPromptStorage,
  };
}
