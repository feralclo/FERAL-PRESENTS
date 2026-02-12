"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import "@/styles/admin.css";

/**
 * Login form component — uses useSearchParams so must be inside Suspense.
 */
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // If already authenticated, redirect to admin dashboard
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const redirect = searchParams.get("redirect") || "/admin/";
        router.replace(redirect);
      } else {
        setCheckingSession(false);
      }
    });
  }, [router, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Authentication service unavailable");
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Redirect to the intended page or admin dashboard
    const redirect = searchParams.get("redirect") || "/admin/";
    router.replace(redirect);
  };

  if (checkingSession) {
    return (
      <div className="admin-login">
        <div className="admin-login__box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/FERAL LOGO.svg"
            alt="FERAL"
            style={{ display: "block", width: 120, margin: "0 auto 32px", opacity: 0.9 }}
          />
          <p style={{ color: "#888", textAlign: "center", fontFamily: "'Space Mono', monospace" }}>
            Checking session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-login">
      <div className="admin-login__box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/FERAL LOGO.svg"
          alt="FERAL"
          style={{ display: "block", width: 120, margin: "0 auto 32px", opacity: 0.9 }}
        />
        <h1 className="admin-login__title">Admin Access</h1>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            className="admin-login__input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="admin-login__input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="admin-login__error">{error}</p>}
          <button type="submit" className="admin-login__btn" disabled={loading}>
            {loading ? "SIGNING IN..." : "LOGIN"}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Admin login page using Supabase Auth (email + password).
 *
 * Replaces the old client-side credential check with real
 * server-verified authentication via Supabase Auth.
 *
 * After login, the session cookie is set automatically by Supabase SSR,
 * and the middleware will allow access to /admin/* routes.
 */
export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-login">
          <div className="admin-login__box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/FERAL LOGO.svg"
              alt="FERAL"
              style={{ display: "block", width: 120, margin: "0 auto 32px", opacity: 0.9 }}
            />
            <p style={{ color: "#888", textAlign: "center", fontFamily: "'Space Mono', monospace" }}>
              Loading...
            </p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
