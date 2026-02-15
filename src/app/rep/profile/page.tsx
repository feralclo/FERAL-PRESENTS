"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, LogOut, Save, Loader2 } from "lucide-react";

interface RepProfile {
  id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  email: string;
  phone?: string;
  photo_url?: string;
  instagram?: string;
  tiktok?: string;
  bio?: string;
  level: number;
  points_balance: number;
  total_sales: number;
}

export default function RepProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<RepProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [bio, setBio] = useState("");

  // Discount
  const [discountCode, setDiscountCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, discRes] = await Promise.all([
          fetch("/api/rep-portal/me"),
          fetch("/api/rep-portal/discount"),
        ]);
        const meJson = await meRes.json();
        const discJson = await discRes.json();

        if (meJson.data) {
          const p = meJson.data;
          setProfile(p);
          setDisplayName(p.display_name || "");
          setPhone(p.phone || "");
          setInstagram(p.instagram || "");
          setTiktok(p.tiktok || "");
          setBio(p.bio || "");
        }
        if (discJson.data?.[0]) {
          setDiscountCode(discJson.data[0].code);
        }
      } catch { /* network */ }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/rep-portal/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          phone: phone.trim() || null,
          instagram: instagram.trim() || null,
          tiktok: tiktok.trim() || null,
          bio: bio.trim() || null,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch { /* network */ }
    setSaving(false);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/rep-portal/logout", { method: "POST" });
    } catch { /* network */ }
    router.push("/rep/login");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(discountCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-md mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--rep-accent)]/10 border border-[var(--rep-accent)]/20 rep-glow mb-3 overflow-hidden">
          {profile.photo_url ? (
            <img src={profile.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl font-bold text-[var(--rep-accent)]">
              {profile.first_name.charAt(0)}
            </span>
          )}
        </div>
        <h1 className="text-lg font-bold text-white">
          {profile.first_name} {profile.last_name}
        </h1>
        <p className="text-xs text-[var(--rep-text-muted)]">{profile.email}</p>
      </div>

      {/* Discount Code */}
      {discountCode && (
        <div className="rounded-2xl border border-[var(--rep-accent)]/20 bg-[var(--rep-accent)]/5 p-4">
          <p className="text-[10px] uppercase tracking-[2px] text-[var(--rep-accent)] font-semibold mb-2">
            Your Discount Code
          </p>
          <div className="flex items-center gap-3">
            <p className="text-lg font-bold font-mono tracking-[3px] text-white flex-1">
              {discountCode}
            </p>
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--rep-accent)] px-3 py-2 text-xs font-semibold text-white transition-all hover:brightness-110"
            >
              {copiedCode ? <Check size={12} /> : <Copy size={12} />}
              {copiedCode ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">
            Display Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
            placeholder="How you appear on the leaderboard"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
            placeholder="+44..."
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
          <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors resize-none"
            placeholder="Tell everyone about yourself..."
            rows={3}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-[var(--rep-accent)] px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Profile"}
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full rounded-xl border border-red-500/20 px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/5 flex items-center justify-center gap-2"
      >
        <LogOut size={14} /> Sign Out
      </button>
    </div>
  );
}
