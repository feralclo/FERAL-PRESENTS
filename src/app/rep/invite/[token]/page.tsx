"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function RepInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [repInfo, setRepInfo] = useState<{ first_name?: string; email?: string; org_id?: string } | null>(null);

  // Form
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/rep-portal/invite/${token}`);
        const json = await res.json();
        if (json.valid) {
          setValid(true);
          setRepInfo(json.rep);
        }
      } catch { /* network */ }
      setValidating(false);
    })();
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/rep-portal/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          phone: phone || undefined,
          instagram: instagram || undefined,
          tiktok: tiktok || undefined,
          gender: gender || undefined,
          date_of_birth: dob || undefined,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to accept invite");
        setLoading(false);
        return;
      }

      setAccepted(true);
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-[var(--rep-text-muted)]">Verifying your invite...</p>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 mb-4">
            <span className="text-3xl">✕</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Invalid Invite</h1>
          <p className="text-sm text-[var(--rep-text-muted)] mb-6">
            This invite link is expired or has already been used.
          </p>
          <Link href="/rep/join" className="text-sm text-[var(--rep-accent)] hover:underline">
            Apply to become a rep instead
          </Link>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--rep-accent)]/20 to-[var(--rep-accent)]/5 rep-glow mb-6">
            <span className="text-4xl">🎉</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">You&apos;re In!</h1>
          <p className="text-sm text-[var(--rep-text-muted)] mb-6 leading-relaxed">
            Welcome to the team. Your dashboard is ready and your discount code is live.
          </p>
          <button
            onClick={() => router.push("/rep/login")}
            className="rounded-xl bg-[var(--rep-accent)] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--rep-accent)]/20 to-[var(--rep-accent)]/5 rep-glow mb-4">
            <span className="text-3xl">⚡</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            You&apos;ve been selected
          </h1>
          <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed">
            {repInfo?.first_name ? `Hey ${repInfo.first_name}, ` : ""}
            you&apos;ve been personally invited to join as a rep. Set up your account to get started.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleAccept} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Create Password *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
              placeholder="Min 6 characters"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Instagram</label>
              <input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.replace("@", ""))}
                className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                placeholder="@handle"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">TikTok</label>
              <input
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value.replace("@", ""))}
                className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                placeholder="@handle"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
              placeholder="+44..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Date of birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white focus:border-[var(--rep-accent)] focus:outline-none transition-colors [color-scheme:dark]"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-xl bg-[var(--rep-accent)] px-4 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Setting up..." : "Accept & Join"}
          </button>
        </form>
      </div>
    </div>
  );
}
