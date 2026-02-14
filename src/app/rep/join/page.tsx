"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "details", title: "Details" },
  { id: "socials", title: "Socials" },
  { id: "about", title: "About You" },
  { id: "photo", title: "Photo" },
  { id: "confirm", title: "Done" },
];

export default function RepJoinPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [bio, setBio] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rep-portal/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase(),
          password,
          first_name: firstName,
          last_name: lastName,
          phone: phone || undefined,
          instagram: instagram || undefined,
          tiktok: tiktok || undefined,
          date_of_birth: dob || undefined,
          gender: gender || undefined,
          bio: bio || undefined,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Signup failed");
        setLoading(false);
        return;
      }

      setSubmitted(true);
      next(); // Go to confirmation step
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const progress = ((step) / (STEPS.length - 1)) * 100;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span
              className="font-mono text-[11px] font-bold uppercase tracking-[3px]"
              style={{
                background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Entry Reps
            </span>
            <span className="text-[11px] text-[var(--rep-text-muted)] font-mono">
              {step + 1}/{STEPS.length}
            </span>
          </div>
          <div className="h-1 rounded-full bg-[var(--rep-border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#A78BFA] via-[#8B5CF6] to-[#7C3AED] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="rep-wizard-step" key={step}>
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="mb-6">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--rep-accent)]/20 to-[var(--rep-accent)]/5 rep-glow mb-4">
                  <span className="text-4xl">🚀</span>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">
                  Join the Team
                </h1>
                <p className="text-sm text-[var(--rep-text-muted)] leading-relaxed max-w-xs mx-auto">
                  Become a rep, share your code, earn points, unlock rewards, and climb the leaderboard.
                </p>
              </div>
              <button
                onClick={next}
                className="w-full rounded-xl bg-[var(--rep-accent)] px-6 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110"
              >
                Let&apos;s Go
              </button>
            </div>
          )}

          {/* Step 1: Details */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">The basics</h2>
              <p className="text-sm text-[var(--rep-text-muted)] mb-6">Tell us who you are.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">First name *</label>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                      placeholder="First name"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Last name *</label>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                    placeholder="your@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Password *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                    placeholder="Min 6 characters"
                  />
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
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={back} className="flex-1 rounded-xl border border-[var(--rep-border)] px-4 py-3 text-sm font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 transition-colors">
                  Back
                </button>
                <button
                  onClick={next}
                  disabled={!firstName || !email || !password}
                  className="flex-1 rounded-xl bg-[var(--rep-accent)] px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-30"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Socials */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Your socials</h2>
              <p className="text-sm text-[var(--rep-text-muted)] mb-6">Where can we find you online?</p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Instagram</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--rep-text-muted)]">@</span>
                    <input
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value.replace("@", ""))}
                      className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] pl-8 pr-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                      placeholder="yourhandle"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">TikTok</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--rep-text-muted)]">@</span>
                    <input
                      value={tiktok}
                      onChange={(e) => setTiktok(e.target.value.replace("@", ""))}
                      className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] pl-8 pr-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                      placeholder="yourhandle"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={back} className="flex-1 rounded-xl border border-[var(--rep-border)] px-4 py-3 text-sm font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 transition-colors">
                  Back
                </button>
                <button onClick={next} className="flex-1 rounded-xl bg-[var(--rep-accent)] px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110">
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: About You */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">About you</h2>
              <p className="text-sm text-[var(--rep-text-muted)] mb-6">Just a few more things.</p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Date of birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white focus:border-[var(--rep-accent)] focus:outline-none transition-colors [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Gender</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "male", label: "Male" },
                      { value: "female", label: "Female" },
                      { value: "non-binary", label: "Non-binary" },
                      { value: "prefer-not-to-say", label: "Prefer not to say" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setGender(opt.value)}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                          gender === opt.value
                            ? "border-[var(--rep-accent)] bg-[var(--rep-accent)]/10 text-white"
                            : "border-[var(--rep-border)] bg-[var(--rep-surface)] text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--rep-text-muted)] uppercase tracking-wider">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors resize-none"
                    placeholder="Tell us a bit about yourself..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={back} className="flex-1 rounded-xl border border-[var(--rep-border)] px-4 py-3 text-sm font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 transition-colors">
                  Back
                </button>
                <button onClick={next} className="flex-1 rounded-xl bg-[var(--rep-accent)] px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110">
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Photo (optional) — submit here */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Almost there</h2>
              <p className="text-sm text-[var(--rep-text-muted)] mb-6">
                Ready to submit your application?
              </p>
              <div className="rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-surface)] p-5 mb-6">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--rep-text-muted)]">Name</span>
                    <span className="text-white font-medium">{firstName} {lastName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--rep-text-muted)]">Email</span>
                    <span className="text-white">{email}</span>
                  </div>
                  {instagram && (
                    <div className="flex justify-between">
                      <span className="text-[var(--rep-text-muted)]">Instagram</span>
                      <span className="text-white">@{instagram}</span>
                    </div>
                  )}
                  {tiktok && (
                    <div className="flex justify-between">
                      <span className="text-[var(--rep-text-muted)]">TikTok</span>
                      <span className="text-white">@{tiktok}</span>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400 mb-4">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={back} className="flex-1 rounded-xl border border-[var(--rep-border)] px-4 py-3 text-sm font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 transition-colors">
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-[var(--rep-accent)] px-4 py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {loading ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Confirmation */}
          {step === 5 && (
            <div className="text-center">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--rep-success)]/20 to-[var(--rep-success)]/5 mb-6">
                <span className="text-4xl">✓</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Application Submitted</h2>
              <p className="text-sm text-[var(--rep-text-muted)] mb-8 max-w-xs mx-auto leading-relaxed">
                We&apos;ll review your application and let you know once you&apos;re approved. Check your email for updates.
              </p>
              <button
                onClick={() => router.push("/rep/login")}
                className="rounded-xl border border-[var(--rep-border)] px-6 py-3 text-sm font-medium text-[var(--rep-text-muted)] hover:border-[var(--rep-accent)]/50 transition-colors"
              >
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
