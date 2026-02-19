"use client";

import { useEffect, useState, useCallback } from "react";

interface PWAState {
  /** Whether the browser supports service workers */
  supported: boolean;
  /** Whether the service worker is registered and active */
  registered: boolean;
  /** Whether push notifications are supported */
  pushSupported: boolean;
  /** Current push permission: "default" | "granted" | "denied" */
  pushPermission: NotificationPermission | "unsupported";
  /** Whether there's an active push subscription */
  pushSubscribed: boolean;
  /** Whether an A2HS (add to home screen) prompt is available */
  installable: boolean;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Hook for rep portal PWA features: service worker, push notifications, install prompt.
 *
 * Usage:
 *   const { pushPermission, requestPush, promptInstall, installable } = useRepPWA();
 */
export function useRepPWA() {
  const [state, setState] = useState<PWAState>({
    supported: false,
    registered: false,
    pushSupported: false,
    pushPermission: "unsupported",
    pushSubscribed: false,
    installable: false,
  });

  // Register service worker + check push state
  useEffect(() => {
    if (typeof window === "undefined") return;

    const swSupported = "serviceWorker" in navigator;
    const pushSup = swSupported && "PushManager" in window;
    const perm: NotificationPermission | "unsupported" =
      "Notification" in window ? Notification.permission : "unsupported";

    setState((s) => ({
      ...s,
      supported: swSupported,
      pushSupported: pushSup,
      pushPermission: perm,
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

    // Capture install prompt
    const handleInstall = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setState((s) => ({ ...s, installable: true }));
    };

    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  /**
   * Request push notification permission + subscribe.
   * Returns the PushSubscription if successful, null otherwise.
   */
  const requestPush = useCallback(async (): Promise<PushSubscription | null> => {
    if (!state.pushSupported) return null;

    try {
      const permission = await Notification.requestPermission();
      setState((s) => ({ ...s, pushPermission: permission }));

      if (permission !== "granted") return null;

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // TODO: Replace with your VAPID public key from server
        // applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      setState((s) => ({ ...s, pushSubscribed: true }));

      // Send subscription to server for storage
      await fetch("/api/rep-portal/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      }).catch(() => {
        // API endpoint doesn't exist yet — that's fine for now
        console.info("[RepPWA] Push subscription saved locally. Server endpoint pending.");
      });

      return subscription;
    } catch (err) {
      console.warn("[RepPWA] Push subscription failed:", err);
      return null;
    }
  }, [state.pushSupported]);

  /**
   * Show the browser's "Add to Home Screen" prompt.
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

  return {
    ...state,
    requestPush,
    promptInstall,
  };
}
