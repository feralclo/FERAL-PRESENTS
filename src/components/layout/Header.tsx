"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBranding } from "@/hooks/useBranding";
import { useOrgId } from "@/components/OrgProvider";
import type { MerchStoreSettings } from "@/types/merch-store";
import { DEFAULT_MERCH_STORE_SETTINGS } from "@/types/merch-store";
import "@/styles/header.css";

type MenuPhase = "closed" | "opening" | "open" | "closing";

interface NavLink {
  href: string;
  label: string;
  index: string;
}

const BASE_NAV_LINKS: NavLink[] = [
  { href: "/#events", label: "Events", index: "01" },
  { href: "/#about", label: "About", index: "02" },
  { href: "/#contact", label: "Contact", index: "03" },
];

export function Header() {
  const branding = useBranding();
  const orgId = useOrgId();
  const pathname = usePathname();

  // On event/shop/checkout pages, hide landing-page nav (Events/About/Contact)
  // and make the logo non-navigating (stays on current page).
  const isEventPage = pathname.startsWith("/event/") || pathname.startsWith("/checkout/") || pathname.startsWith("/shop/");
  const [phase, setPhase] = useState<MenuPhase>("closed");
  const [storeSettings, setStoreSettings] = useState<MerchStoreSettings | null>(() => {
    // Hydrate from sessionStorage for instant render (no layout shift)
    if (typeof window === "undefined") return null;
    try {
      const cached = sessionStorage.getItem(`entry_store_settings_${orgId}`);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return null;
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = phase !== "closed";

  // Fetch merch store settings (updates cache silently)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/merch-store/settings");
        if (res.ok) {
          const json = await res.json();
          const settings = json.data || DEFAULT_MERCH_STORE_SETTINGS;
          setStoreSettings(settings);
          try { sessionStorage.setItem(`entry_store_settings_${orgId}`, JSON.stringify(settings)); } catch { /* ignore */ }
        }
      } catch {
        // Silently ignore — store link simply won't show
      }
    })();
  }, [orgId]);

  // Build nav links dynamically based on merch store settings
  const navLinks = useMemo(() => {
    if (!storeSettings?.enabled) return BASE_NAV_LINKS;
    const shopLink: NavLink = {
      href: "/shop/",
      label: storeSettings.nav_label || "Shop",
      index: "02",
    };
    // Insert Shop after Events, re-index
    return [
      { ...BASE_NAV_LINKS[0], index: "01" },
      shopLink,
      { ...BASE_NAV_LINKS[1], index: "03" },
      { ...BASE_NAV_LINKS[2], index: "04" },
    ];
  }, [storeSettings]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === "opening") {
      timerRef.current = setTimeout(() => setPhase("open"), 500);
    } else if (phase === "closing") {
      timerRef.current = setTimeout(() => {
        setPhase("closed");
        document.body.style.overflow = "";
      }, 300);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase]);

  const toggleMenu = useCallback(() => {
    setPhase((prev) => {
      if (prev === "closed") {
        document.body.style.overflow = "hidden";
        return "opening";
      }
      if (prev === "opening" || prev === "open") {
        return "closing";
      }
      return prev;
    });
  }, []);

  const closeMenu = useCallback(() => {
    setPhase((prev) => {
      if (prev === "opening" || prev === "open") {
        return "closing";
      }
      return prev;
    });
  }, []);

  const menuClassName = [
    "nav__menu",
    isActive ? "active" : "",
    phase === "opening" ? "nav__menu--enter" : "",
    phase === "closing" ? "nav__menu--exit" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className="nav">
      <Link href="/" className="nav__logo" onClick={closeMenu}>
        {branding.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={branding.logo_url}
            alt={branding.org_name || "Entry"}
            className="nav__logo-img"
            data-branding="logo"
            style={branding.logo_height ? { height: Math.min(branding.logo_height, 48) } : undefined}
          />
        ) : (
          <span className="nav__logo-text" data-branding="logo">
            {branding.org_name || "Entry"}
          </span>
        )}
      </Link>

      {!isEventPage && (
        <button
          className={`nav__toggle${isActive ? " active" : ""}`}
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      )}

      {!isEventPage && (
        <div className={menuClassName}>
          <ul className="nav__list">
            {navLinks.map((link, i) => (
              <li
                key={link.href}
                className="nav__item"
                style={{ "--stagger": i } as React.CSSProperties}
              >
                <Link href={link.href} className="nav__link" onClick={closeMenu}>
                  <span className="nav__link-index">{link.index}</span>
                  <span className="nav__link-slash">//</span>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/#events"
            className="nav__cta"
            onClick={closeMenu}
          >
            Book Tickets
          </Link>
        </div>
      )}
    </nav>
  );
}
