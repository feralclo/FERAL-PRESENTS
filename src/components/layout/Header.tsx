"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import "@/styles/header.css";

type MenuPhase = "closed" | "opening" | "open" | "closing";

const NAV_LINKS = [
  { href: "/#events", label: "Events", index: "01" },
  { href: "/#about", label: "About", index: "02" },
  { href: "/#contact", label: "Contact", index: "03" },
  { href: "https://www.feralclo.com/", label: "Apparel", index: "04", external: true },
];

export function Header() {
  const [phase, setPhase] = useState<MenuPhase>("closed");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = phase !== "closed";

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/FERAL LOGO.svg"
          alt="FERAL PRESENTS"
          className="nav__logo-img"
          data-branding="logo"
        />
      </Link>

      <button
        className={`nav__toggle${isActive ? " active" : ""}`}
        onClick={toggleMenu}
        aria-label="Toggle menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div className={menuClassName}>
        <ul className="nav__list">
          {NAV_LINKS.map((link, i) => (
            <li
              key={link.href}
              className="nav__item"
              style={{ "--stagger": i } as React.CSSProperties}
            >
              {link.external ? (
                <a
                  href={link.href}
                  className="nav__link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="nav__link-index">{link.index}</span>
                  <span className="nav__link-slash">//</span>
                  {link.label}
                </a>
              ) : (
                <Link href={link.href} className="nav__link" onClick={closeMenu}>
                  <span className="nav__link-index">{link.index}</span>
                  <span className="nav__link-slash">//</span>
                  {link.label}
                </Link>
              )}
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
    </nav>
  );
}
