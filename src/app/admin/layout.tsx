"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import "@/styles/admin.css";

const ADMIN_USER = process.env.NEXT_PUBLIC_ADMIN_USER || "HARRY";
const ADMIN_PASS = process.env.NEXT_PUBLIC_ADMIN_PASS || "Parker5656!";

/* Red SVG icons for sidebar nav — modern monoline style */
const svgIcon = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);

const NAV_ITEMS = [
  { href: "/admin/", label: "Dashboard", icon: svgIcon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>') },
  { href: "/admin/events/", label: "Events", icon: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>') },
  { href: "/admin/orders/", label: "Orders", icon: svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>') },
  { href: "/admin/customers/", label: "Customers", icon: svgIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') },
  { href: "/admin/guest-list/", label: "Guest List", icon: svgIcon('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>') },
  { href: "/admin/popup/", label: "Popup Performance", icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') },
  { href: "/admin/traffic/", label: "Traffic Analytics", icon: svgIcon('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>') },
  { href: "/admin/payments/", label: "Payment Settings", icon: svgIcon('<path d="M2 10h20"/><path d="M2 14h20"/><rect x="2" y="5" width="20" height="14" rx="2"/>') },
  { href: "/admin/connect/", label: "Stripe Connect", icon: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>') },
  { href: "/admin/marketing/", label: "Marketing", icon: svgIcon('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>') },
  { href: "/admin/settings/", label: "Settings", icon: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>') },
  { href: "/admin/health/", label: "System Health", icon: svgIcon('<path d="M4.5 12.5l3 3 5-6 3 3 4.5-5"/><rect x="2" y="3" width="20" height="18" rx="2"/>') },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Check existing session
  useEffect(() => {
    const session = sessionStorage.getItem("feral_admin_auth");
    if (session === "true") {
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      sessionStorage.setItem("feral_admin_auth", "true");
      setAuthenticated(true);
      setError("");
    } else {
      setError("Invalid credentials");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("feral_admin_auth");
    setAuthenticated(false);
  };

  if (!authenticated) {
    return (
      <div className="admin-login">
        <div className="admin-login__box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/FERAL LOGO.svg" alt="FERAL" style={{ display: "block", width: 120, margin: "0 auto 32px", opacity: 0.9 }} />
          <h1 className="admin-login__title">Admin Access</h1>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Username"
              className="admin-login__input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
            <input
              type="password"
              placeholder="Password"
              className="admin-login__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error && <p className="admin-login__error">{error}</p>}
            <button type="submit" className="admin-login__btn">
              LOGIN
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? "admin-sidebar--open" : ""}`}>
        <div className="admin-sidebar__header">
          <Link href="/admin/" className="admin-sidebar__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/FERAL LOGO.svg" alt="FERAL" style={{ height: 24, opacity: 0.9 }} />
            <span style={{ marginLeft: 10, color: "#ff0033", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "3px", fontFamily: "'Space Mono', monospace" }}>ADMIN</span>
          </Link>
          <button
            className="admin-sidebar__close"
            onClick={() => setSidebarOpen(false)}
          >
            &times;
          </button>
        </div>
        <nav className="admin-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-sidebar__link ${
                pathname === item.href ||
                pathname === item.href.slice(0, -1) ||
                (item.href !== "/admin/" && pathname.startsWith(item.href))
                  ? "admin-sidebar__link--active"
                  : ""
              }`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="admin-sidebar__icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <button className="admin-sidebar__logout" onClick={handleLogout}>
          Logout
        </button>
      </aside>

      {/* Main content */}
      <div className="admin-main">
        <header className="admin-header">
          <button
            className="admin-header__toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link href="/admin/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/FERAL LOGO.svg" alt="FERAL" style={{ height: 22, opacity: 0.9 }} />
            <span style={{ marginLeft: 10, color: "#ff0033", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "3px", fontFamily: "'Space Mono', monospace" }}>ADMIN</span>
          </Link>
          <div className="admin-header__status">
            <span className="admin-header__dot" />
            <span>Live</span>
          </div>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
