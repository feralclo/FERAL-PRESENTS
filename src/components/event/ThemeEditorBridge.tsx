"use client";

import { useEffect } from "react";

/**
 * Check if this page is loaded as a theme editor preview.
 * Used by event components to suppress popups, analytics, etc.
 */
export function isEditorPreview(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.hasAttribute("data-editor-preview");
}

/**
 * ThemeEditorBridge — receives postMessage from the admin theme editor
 * and applies CSS variable / logo / font overrides to the live preview.
 *
 * Rendered in the event layout. No-op in production (only activates when
 * the page is loaded inside the editor iframe with ?editor=1).
 *
 * Sets `data-editor-preview` on <html> so CSS can hide distracting UI
 * (cookie banner, discount popup, social proof toast) and components
 * can skip analytics tracking.
 *
 * IMPORTANT: CSS variables must be applied to BOTH the [data-theme-root]
 * wrapper div (which has server-injected inline styles that would otherwise
 * shadow updates) AND document.documentElement (for :root vars in base.css).
 */
export function ThemeEditorBridge() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("editor") !== "1") return;

    // Mark the document so CSS + other components can detect editor mode
    document.documentElement.setAttribute("data-editor-preview", "");

    // Find the theme root wrapper (event layout sets data-theme-root on its wrapper div)
    const themeRoot = document.querySelector<HTMLElement>("[data-theme-root]");

    // Set data-theme from URL param so the correct theme CSS applies in preview.
    // The editor passes ?template=aura (or midnight) to signal which theme is being edited.
    // Without this, the layout only sets data-theme for the LIVE active theme,
    // so previewing a non-active theme would render with wrong CSS scoping.
    const templateParam = params.get("template");
    if (templateParam && themeRoot) {
      if (templateParam === "midnight") {
        themeRoot.removeAttribute("data-theme");
      } else {
        themeRoot.setAttribute("data-theme", templateParam);
      }
    }

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

      // CSS variable updates (colors)
      if (e.data.type === "theme-variables" && e.data.variables) {
        for (const [key, value] of Object.entries(e.data.variables)) {
          // Apply to :root for base.css aliases (--red: var(--accent), etc.)
          document.documentElement.style.setProperty(key, value as string);
          // Apply to theme root wrapper to override server-injected inline styles
          themeRoot?.style.setProperty(key, value as string);
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
        const val = `'${fontFamily}'${suffix}`;
        document.documentElement.style.setProperty(variable, val);
        themeRoot?.style.setProperty(variable, val);
      }

      // Logo update
      if (e.data.type === "theme-logo") {
        const imgs = document.querySelectorAll<HTMLImageElement>(
          '[data-branding="logo"]'
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
      document.documentElement.removeAttribute("data-editor-preview");
      document.removeEventListener("click", blockNav, true);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
