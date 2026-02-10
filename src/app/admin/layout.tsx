"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import "@/styles/admin.css";

const ADMIN_USER = process.env.NEXT_PUBLIC_ADMIN_USER || "HARRY";
const ADMIN_PASS = process.env.NEXT_PUBLIC_ADMIN_PASS || "Parker5656!";

const NAV_ITEMS = [
  { href: "/admin/", label: "Dashboard", icon: "📊" },
  { href: "/admin/popup/", label: "Popup Performance", icon: "💬" },
  { href: "/admin/traffic/", label: "Traffic Analytics", icon: "📈" },
  {
    href: "/admin/events/liverpool-27-march/",
    label: "Liverpool Event",
    icon: "🎫",
  },
  {
    href: "/admin/events/kompass-klub-7-march/",
    label: "Kompass Event",
    icon: "🎧",
  },
  { href: "/admin/settings/", label: "Settings", icon: "⚙️" },
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
            <span style={{ marginLeft: 8, color: "#666", fontSize: "0.7rem", letterSpacing: "2px" }}>ADMIN</span>
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
                pathname === item.href || pathname === item.href.slice(0, -1)
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
            ☰
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/FERAL LOGO.svg" alt="FERAL" style={{ height: 28, opacity: 0.9 }} />
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
