"use client";

import { useEffect, useState } from "react";
import { Swords, Upload, Link as LinkIcon, Type, X, Loader2, Check } from "lucide-react";

interface Quest {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  quest_type: string;
  image_url?: string;
  video_url?: string;
  points_reward: number;
  expires_at?: string;
  my_submissions: { total: number; approved: number; pending: number; rejected: number };
  max_completions?: number;
}

export default function RepQuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [tab, setTab] = useState<"active" | "completed">("active");

  // Submit proof
  const [submitQuestId, setSubmitQuestId] = useState<string | null>(null);
  const [proofType, setProofType] = useState<"screenshot" | "url" | "text">("url");
  const [proofText, setProofText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rep-portal/quests");
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          setError(errJson?.error || "Failed to load quests (" + res.status + ")");
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json.data) setQuests(json.data);
      } catch { setError("Failed to load quests — check your connection"); }
      setLoading(false);
    })();
  }, [loadKey]);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, key: `quest-proof-${Date.now()}` }),
      });
      if (res.ok) {
        const json = await res.json();
        const mediaUrl = `/api/media/${json.key}`;
        setUploadedUrl(mediaUrl);
        setProofText(mediaUrl);
      } else {
        setError("Failed to upload image");
      }
    } catch { setError("Failed to upload image — check your connection"); }
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!submitQuestId) return;
    const proofValue = proofType === "screenshot" ? (uploadedUrl || proofText.trim()) : proofText.trim();
    if (!proofValue) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rep-portal/quests/${submitQuestId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof_type: proofType,
          proof_text: proofValue,
          proof_url: proofType === "screenshot" || proofType === "url" ? proofValue : undefined,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setError("");
        setTimeout(() => {
          setSubmitQuestId(null);
          setSubmitted(false);
          setProofText("");
        }, 1500);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || "Failed to submit quest proof");
      }
    } catch { setError("Failed to submit quest proof — check your connection"); }
    setSubmitting(false);
  };

  const getApprovedCount = (q: Quest): number => {
    return q.my_submissions?.approved ?? 0;
  };

  const activeQuests = quests.filter((q) =>
    !q.max_completions || getApprovedCount(q) < q.max_completions
  );
  const completedQuests = quests.filter((q) =>
    q.max_completions && getApprovedCount(q) >= q.max_completions
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--rep-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && quests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button
          onClick={() => { setError(""); setLoading(true); setLoadKey((k) => k + 1); }}
          className="text-xs text-[var(--rep-accent)] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const displayQuests = tab === "active" ? activeQuests : completedQuests;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Quests</h1>
        <p className="text-sm text-[var(--rep-text-muted)]">
          Complete tasks to earn bonus points
        </p>
      </div>

      {/* Inline error (e.g. submission failure) */}
      {error && quests.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[var(--rep-surface)] p-1 w-fit">
        {(["active", "completed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-[var(--rep-card)] text-white shadow-sm"
                : "text-[var(--rep-text-muted)] hover:text-white"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Quest Cards */}
      {displayQuests.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--rep-accent)]/10 mb-4">
            <Swords size={22} className="text-[var(--rep-accent)]" />
          </div>
          <p className="text-sm text-white font-medium mb-1">
            {tab === "active" ? "No active quests" : "No completed quests"}
          </p>
          <p className="text-xs text-[var(--rep-text-muted)]">
            {tab === "active" ? "Check back soon for new quests" : "Complete quests to earn bonus points"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayQuests.map((quest) => (
            <div key={quest.id} className="rep-quest-card">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-white">{quest.title}</h3>
                  {quest.description && (
                    <p className="text-xs text-[var(--rep-text-muted)] mt-1 line-clamp-2">{quest.description}</p>
                  )}
                </div>
                <div className="shrink-0 rounded-lg bg-[var(--rep-accent)]/10 px-2.5 py-1">
                  <span className="text-xs font-bold text-[var(--rep-accent)]">+{quest.points_reward}</span>
                </div>
              </div>

              {quest.instructions && (
                <div className="rounded-lg bg-[var(--rep-surface)] p-3 mb-3">
                  <p className="text-[11px] text-[var(--rep-text-muted)] leading-relaxed">{quest.instructions}</p>
                </div>
              )}

              {quest.image_url && (
                <img src={quest.image_url} alt="" className="rounded-lg mb-3 max-h-40 w-full object-cover" />
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[10px] text-[var(--rep-text-muted)]">
                  <span className="uppercase tracking-wider">{quest.quest_type.replace("_", " ")}</span>
                  {quest.expires_at && (
                    <span>Expires {new Date(quest.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  )}
                </div>
                {tab === "active" && (
                  <button
                    onClick={() => {
                      setSubmitQuestId(quest.id);
                      setSubmitted(false);
                      setProofText("");
                    }}
                    className="rounded-lg bg-[var(--rep-accent)] px-4 py-2 text-xs font-semibold text-white transition-all hover:brightness-110"
                  >
                    Submit Proof
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit Proof Modal */}
      {submitQuestId && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSubmitQuestId(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--rep-border)] bg-[var(--rep-bg)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Submit Proof</h3>
              <button onClick={() => setSubmitQuestId(null)} className="text-[var(--rep-text-muted)] hover:text-white">
                <X size={18} />
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--rep-success)]/10 mb-3">
                  <Check size={20} className="text-[var(--rep-success)]" />
                </div>
                <p className="text-sm text-white font-medium">Submitted for review!</p>
              </div>
            ) : (
              <>
                {/* Proof type selector */}
                <div className="flex gap-2 mb-4">
                  {([
                    { value: "url" as const, label: "URL", icon: LinkIcon },
                    { value: "screenshot" as const, label: "Screenshot", icon: Upload },
                    { value: "text" as const, label: "Text", icon: Type },
                  ]).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setProofType(value)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        proofType === value
                          ? "bg-[var(--rep-accent)]/10 text-[var(--rep-accent)] border border-[var(--rep-accent)]/30"
                          : "bg-[var(--rep-surface)] text-[var(--rep-text-muted)] border border-[var(--rep-border)]"
                      }`}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Proof input */}
                {proofType === "text" ? (
                  <textarea
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors resize-none"
                    placeholder="Describe what you did..."
                    rows={4}
                    autoFocus
                  />
                ) : proofType === "screenshot" ? (
                  <div className="space-y-3">
                    {uploadedUrl ? (
                      <div className="relative rounded-xl overflow-hidden border border-[var(--rep-border)]">
                        <img src={uploadedUrl} alt="Proof" className="w-full max-h-48 object-contain bg-[var(--rep-surface)]" />
                        <button
                          onClick={() => { setUploadedUrl(""); setProofText(""); }}
                          className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--rep-border)] bg-[var(--rep-surface)] py-8 cursor-pointer transition-colors hover:border-[var(--rep-accent)]/50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                        {uploading ? (
                          <Loader2 size={20} className="animate-spin text-[var(--rep-accent)]" />
                        ) : (
                          <Upload size={20} className="text-[var(--rep-text-muted)]" />
                        )}
                        <span className="text-xs text-[var(--rep-text-muted)]">
                          {uploading ? "Uploading..." : "Tap to upload a screenshot"}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                        />
                      </label>
                    )}
                    <p className="text-[10px] text-center text-[var(--rep-text-muted)]">or paste a URL</p>
                    <input
                      value={uploadedUrl ? "" : proofText}
                      onChange={(e) => { setProofText(e.target.value); setUploadedUrl(""); }}
                      className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                      placeholder="Paste screenshot URL..."
                      disabled={!!uploadedUrl}
                    />
                  </div>
                ) : (
                  <input
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    className="w-full rounded-xl border border-[var(--rep-border)] bg-[var(--rep-surface)] px-4 py-3 text-sm text-white placeholder:text-[var(--rep-text-muted)]/50 focus:border-[var(--rep-accent)] focus:outline-none transition-colors"
                    placeholder="Paste the URL..."
                    autoFocus
                  />
                )}

                <button
                  onClick={handleSubmit}
                  disabled={submitting || !proofText.trim()}
                  className="w-full mt-4 rounded-xl bg-[var(--rep-accent)] px-4 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Submitting...
                    </span>
                  ) : (
                    "Submit"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
