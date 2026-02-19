"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Platform = "ios" | "android" | "desktop" | "unknown";

interface PWAState {
  /** Whether the browser supports service workers */
  supported: boolean;
  /** Whether the service worker is registered and active */
  registered: boolean;
  /** Whether push notifications are supported */
  pushSupported: boolean;
  /** Current push permission */
  pushPermission: NotificationPermission | "unsupported";
  /** Whether there's an active push subscription */
  pushSubscribed: boolean;
  /** Whether the native install prompt is available (Android/desktop Chrome) */
  installable: boolean;
  /** Whether the app is running as an installed PWA (standalone mode) */
  isStandalone: boolean;
  /** Detected platform */
  platform: Platform;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Module-level so it persists across re-renders
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

// ─── Platform detection ──────────────────────────────────────────────────────

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;

  // iOS: iPhone, iPad, iPod (including iPad pretending to be Mac in iPadOS 13+)
  if (/iPhone|iPod/.test(ua)) return "ios";
  if (/iPad/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && "ontouchend" in document) return "ios"; // iPadOS

  // Android
  if (/Android/.test(ua)) return "android";

  return "desktop";
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;

  // Standard check (Android PWA)
  if (window.matchMedia("(display-mode: standalone)").matches) return true;

  // iOS Safari standalone mode
  if ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true) return true;

  return false;
}

// ─── Storage key for dismissing install prompt ───────────────────────────────

const INSTALL_DISMISSED_KEY = "rep_install_dismissed";
const INSTALL_DISMISS_DAYS = 7; // Re-show after 7 days

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

function dismissInstallPrompt(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
  } catch { /* storage unavailable */ }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook for rep portal PWA features: service worker, push notifications,
 * install prompt, platform detection.
 */
export function useRepPWA() {
  const [state, setState] = useState<PWAState>({
    supported: false,
    registered: false,
    pushSupported: false,
    pushPermission: "unsupported",
    pushSubscribed: false,
    installable: false,
    isStandalone: false,
    platform: "unknown",
  });

  // Register service worker + check push state
  useEffect(() => {
    if (typeof window === "undefined") return;

    const platform = detectPlatform();
    const isStandalone = detectStandalone();
    const swSupported = "serviceWorker" in navigator;
    const pushSup = swSupported && "PushManager" in window;
    const perm: NotificationPermission | "unsupported" =
      "Notification" in window ? Notification.permission : "unsupported";

    setState((s) => ({
      ...s,
      supported: swSupported,
      pushSupported: pushSup,
      pushPermission: perm,
      isStandalone,
      platform,
    }));

    if (!swSupported) return;

    // Register SW
    navigator.serviceWorker
      .register("/rep-sw.js", { scope: "/rep" })
      .then((reg) => {
        setState((s) => ({ ...s, registered: true }));

        // Check existing push subscription
        if (pushSup && reg.pushManager) {
          reg.pushManager.getSubscription().then((sub) => {
            setState((s) => ({ ...s, pushSubscribed: !!sub }));
          });
        }
      })
      .catch((err) => {
        console.warn("[RepPWA] SW registration failed:", err);
      });

    // Capture install prompt (Android/desktop Chrome only — iOS never fires this)
    const handleInstall = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setState((s) => ({ ...s, installable: true }));
    };

    window.addEventListener("beforeinstallprompt", handleInstall);

    // Detect when app gets installed
    const handleInstalled = () => {
      deferredInstallPrompt = null;
      setState((s) => ({ ...s, installable: false, isStandalone: true }));
    };
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  /**
   * Request push notification permission + subscribe.
   */
  const requestPush = useCallback(async (): Promise<PushSubscription | null> => {
    if (!state.pushSupported) return null;

    try {
      const permission = await Notification.requestPermission();
      setState((s) => ({ ...s, pushPermission: permission }));

      if (permission !== "granted") return null;

      const reg = await navigator.serviceWorker.ready;

      // Fetch VAPID public key from server
      let applicationServerKey: ArrayBuffer | undefined;
      try {
        const vapidRes = await fetch("/api/rep-portal/push-vapid-key");
        if (vapidRes.ok) {
          const { publicKey } = await vapidRes.json();
          if (publicKey) {
            const uint8 = urlBase64ToUint8Array(publicKey);
            applicationServerKey = uint8.buffer as ArrayBuffer;
          }
        }
      } catch {
        console.warn("[RepPWA] Could not fetch VAPID key");
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        ...(applicationServerKey ? { applicationServerKey } : {}),
      });
      setState((s) => ({ ...s, pushSubscribed: true }));

      // Send subscription to server
      await fetch("/api/rep-portal/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      }).catch(() => {
        console.info("[RepPWA] Push subscription stored locally. Server sync pending.");
      });

      return subscription;
    } catch (err) {
      console.warn("[RepPWA] Push subscription failed:", err);
      return null;
    }
  }, [state.pushSupported]);

  /**
   * Show the browser's native "Add to Home Screen" prompt (Android/desktop).
   */
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

  /**
   * Whether the install prompt should be shown to the user.
   * False if: already standalone, already dismissed recently, or not on a supported platform.
   */
  const shouldShowInstall = useMemo(() => {
    if (state.isStandalone) return false;
    if (isInstallDismissed()) return false;
    // On iOS, always show (manual instructions needed)
    if (state.platform === "ios") return true;
    // On Android/desktop, show if browser supports it
    if (state.installable) return true;
    return false;
  }, [state.isStandalone, state.platform, state.installable]);

  return {
    ...state,
    shouldShowInstall,
    requestPush,
    promptInstall,
    dismissInstall: dismissInstallPrompt,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
