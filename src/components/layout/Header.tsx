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
    <nav className={`nav${hidden ? " header--hidden" : ""}`}>
      <Link href="/" className="nav__logo" onClick={closeMenu}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/FERAL LOGO.svg"
          alt="FERAL PRESENTS"
          className="nav__logo-img"
        />
      </Link>

      <button
        className={`nav__toggle${menuOpen ? " active" : ""}`}
        onClick={toggleMenu}
        aria-label="Toggle menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div className={`nav__menu${menuOpen ? " active" : ""}`}>
        <ul className="nav__list">
          <li className="nav__item">
            <Link href="/#events" className="nav__link" onClick={closeMenu}>
              Events
            </Link>
          </li>
          <li className="nav__item">
            <Link href="/#about" className="nav__link" onClick={closeMenu}>
              About
            </Link>
          </li>
          <li className="nav__item">
            <Link href="/#contact" className="nav__link" onClick={closeMenu}>
              Contact
            </Link>
          </li>
          <li className="nav__item">
            <a
              href="https://www.feralclo.com/"
              className="nav__link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Apparel
            </a>
          </li>
        </ul>
        <Link
          href="/#events"
          className="btn btn--primary nav__cta"
          onClick={closeMenu}
        >
          Book Tickets
        </Link>
      </div>
    </nav>
  );
}
