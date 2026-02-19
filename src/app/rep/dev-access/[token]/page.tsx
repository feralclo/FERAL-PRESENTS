"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function DevAccessPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState("Signing you in...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function login() {
      try {
        // Step 1: Get OTP from the API
        setStatus("Getting login token...");
        const res = await fetch(`/api/rep-portal/dev-login/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `API returned ${res.status}`);
        }

        const { email, otp } = await res.json();
        if (cancelled) return;

        // Step 2: Exchange OTP for a session via browser Supabase client
        setStatus("Exchanging token...");
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase not configured");

        const { error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: "email",
        });

        if (verifyError) throw new Error(verifyError.message);
        if (cancelled) return;

        // Step 3: Hard redirect so cookies are sent with fresh request
        setStatus("Redirecting...");
        window.location.href = "/rep";
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Login failed");
        }
      }
    }

    login();
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#fff", background: "#0e0e0e", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        <p style={{ color: "#f87171" }}>{error}</p>
        <a href="/rep/login" style={{ color: "#8B5CF6", textDecoration: "underline" }}>
          Go to login
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", textAlign: "center", color: "#fff", background: "#0e0e0e", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
      <div style={{ width: "24px", height: "24px", border: "2px solid #8B5CF6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
      <p style={{ color: "#888" }}>{status}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
