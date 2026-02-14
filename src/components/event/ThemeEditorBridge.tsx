"use client";

import { useEffect } from "react";

/**
 * ThemeEditorBridge — receives postMessage from the admin theme editor
 * and applies CSS variable / logo / font overrides to the live preview.
 *
 * Rendered in the event layout. No-op in production (only activates when
 * the page is loaded inside the editor iframe with ?editor=1).
 */
export function ThemeEditorBridge() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("editor") !== "1") return;

    // Disable link clicks and navigation inside the preview
    function blockNav(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a, button");
      if (target?.tagName === "A") {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;

      // CSS variable updates (colors, fonts)
      if (e.data.type === "theme-variables" && e.data.variables) {
        const root = document.documentElement;
        for (const [key, value] of Object.entries(e.data.variables)) {
          root.style.setProperty(key, value as string);
        }
      }

      // Font loading — dynamically load a Google Font then update CSS var
      if (e.data.type === "theme-font") {
        const { variable, fontFamily } = e.data as {
          variable: string;
          fontFamily: string;
        };
        const id = `editor-font-${fontFamily.replace(/\s+/g, "-")}`;
        if (!document.getElementById(id)) {
          const link = document.createElement("link");
          link.id = id;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`;
          document.head.appendChild(link);
        }
        const suffix = variable === "--font-mono" ? ", monospace" : ", sans-serif";
        document.documentElement.style.setProperty(
          variable,
          `'${fontFamily}'${suffix}`
        );
      }

      // Logo update
      if (e.data.type === "theme-logo") {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          '[data-branding="logo"], .header__logo img'
        );
        imgs.forEach((img) => {
          img.src = e.data.logoUrl || "";
          if (e.data.logoWidth) {
            img.style.width = `${e.data.logoWidth}px`;
          }
        });
      }
    }

    document.addEventListener("click", blockNav, true);
    window.addEventListener("message", handleMessage);

    // Signal to parent that the bridge is ready
    window.parent.postMessage({ type: "editor-bridge-ready" }, "*");

    return () => {
      document.removeEventListener("click", blockNav, true);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
