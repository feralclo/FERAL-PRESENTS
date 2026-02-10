"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScroll = useRef(0);
  const ticking = useRef(false);

  // Header hide/show on scroll (matches existing main.js behavior)
  useEffect(() => {
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const currentScroll = window.scrollY;
        if (currentScroll > 300 && currentScroll > lastScroll.current) {
          setHidden(true);
        } else {
          setHidden(false);
        }
        lastScroll.current = currentScroll;
        ticking.current = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => {
      document.body.style.overflow = !prev ? "hidden" : "";
      return !prev;
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    document.body.style.overflow = "";
  }, []);

  return (
    <header className={`site-header ${hidden ? "header--hidden" : ""}`}>
      <div className="header__inner">
        <Link href="/" className="header__logo" onClick={closeMenu}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/FERAL LOGO.svg"
            alt="FERAL PRESENTS"
            className="header__logo-img"
          />
        </Link>

        <button
          className={`header__hamburger ${menuOpen ? "is-active" : ""}`}
          onClick={toggleMenu}
          aria-label="Toggle navigation"
        >
          <span className="header__hamburger-line" />
          <span className="header__hamburger-line" />
          <span className="header__hamburger-line" />
        </button>

        <nav className={`header__nav ${menuOpen ? "header__nav--open" : ""}`}>
          <Link href="/#events" className="header__link" onClick={closeMenu}>
            EVENTS
          </Link>
          <Link href="/#about" className="header__link" onClick={closeMenu}>
            ABOUT
          </Link>
          <Link href="/#contact" className="header__link" onClick={closeMenu}>
            CONTACT
          </Link>
        </nav>
      </div>
    </header>
  );
}
