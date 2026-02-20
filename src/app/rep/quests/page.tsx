"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Compass, Zap } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState, RepPageError } from "@/components/rep";
import { QuestCard } from "@/components/rep/QuestCard";
import { QuestDetailSheet } from "@/components/rep/QuestDetailSheet";
import { QuestSubmitSheet } from "@/components/rep/QuestSubmitSheet";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Quest {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  quest_type: string;
  platform?: "tiktok" | "instagram" | "any";
  image_url?: string;
  video_url?: string;
  reference_url?: string | null;
  uses_sound?: boolean;
  points_reward: number;
  currency_reward: number;
  expires_at?: string;
  my_submissions: { total: number; approved: number; pending: number; rejected: number };
  max_completions?: number;
}

interface Submission {
  id: string;
  quest_id: string;
  proof_type: string;
  proof_url?: string | null;
  proof_text?: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  points_awarded: number;
  created_at: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RepQuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [currencyName, setCurrencyName] = useState("FRL");

  // Detail + submit modals
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null);
  const [submitQuest, setSubmitQuest] = useState<Quest | null>(null);

  // Fullscreen image
  const [mediaFullscreen, setMediaFullscreen] = useState(false);

  // Submissions expansion
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  const [questSubmissions, setQuestSubmissions] = useState<Record<string, Submission[]>>({});
  const [loadingSubs, setLoadingSubs] = useState<string | null>(null);

  // Modal stack: Escape key + body scroll lock
  useEffect(() => {
    if (!detailQuest && !mediaFullscreen && !submitQuest) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (submitQuest) { setSubmitQuest(null); return; }
        if (mediaFullscreen) { setMediaFullscreen(false); return; }
        if (detailQuest) { setDetailQuest(null); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [detailQuest, mediaFullscreen, submitQuest]);

  const loadQuests = useCallback(async () => {
    try {
      const [res, settingsRes] = await Promise.all([
        fetch("/api/rep-portal/quests"),
        fetch("/api/rep-portal/settings"),
      ]);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.error || "Failed to load quests (" + res.status + ")");
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (json.data) setQuests(json.data);
      const settingsJson = settingsRes.ok ? await settingsRes.json() : { data: null };
      if (settingsJson.data?.currency_name) setCurrencyName(settingsJson.data.currency_name);
    } catch {
      setError("Failed to load quests — check your connection");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadQuests(); }, [loadQuests]);

  const loadSubmissions = useCallback(async (questId: string) => {
    setLoadingSubs(questId);
    try {
      const res = await fetch(`/api/rep-portal/quests/submissions?quest_id=${questId}`);
      if (res.ok) {
        const json = await res.json();
        setQuestSubmissions((prev) => ({ ...prev, [questId]: json.data || [] }));
      }
    } catch { /* network */ }
    setLoadingSubs(null);
  }, []);

  const toggleSubmissions = (questId: string) => {
    if (expandedQuestId === questId) {
      setExpandedQuestId(null);
    } else {
      setExpandedQuestId(questId);
      if (!questSubmissions[questId]) {
        loadSubmissions(questId);
      }
    }
  };

  const handleSubmitComplete = () => {
    const questId = submitQuest?.id;
    setSubmitQuest(null);
    setDetailQuest(null);
    loadQuests();
    if (questId && expandedQuestId === questId) {
      loadSubmissions(questId);
    }
  };

  const getApprovedCount = (q: Quest): number => q.my_submissions?.approved ?? 0;

  const activeQuests = quests.filter((q) =>
    !q.max_completions || getApprovedCount(q) < q.max_completions
  );
  const completedQuests = quests.filter((q) =>
    q.max_completions && getApprovedCount(q) >= q.max_completions
  );
  const totalAvailableXP = activeQuests.reduce((sum, q) => sum + q.points_reward, 0);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="h-12 w-12 rounded-2xl bg-secondary animate-pulse" />
          <div className="h-6 w-24 rounded bg-secondary animate-pulse" />
          <div className="h-4 w-48 rounded bg-secondary animate-pulse" />
        </div>
        <div className="h-10 rounded-xl bg-secondary animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[160px] rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && quests.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-8">
        <RepPageError
          icon={Compass}
          title="Failed to load quests"
          message={error}
          onRetry={() => { setError(""); setLoading(true); loadQuests(); }}
        />
      </div>
    );
  }

  const displayQuests = tab === "active" ? activeQuests : completedQuests;

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center pt-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mb-3">
          <Compass size={22} className="text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Quests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete tasks to earn bonus points
        </p>
        {totalAvailableXP > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/15 px-4 py-1.5">
            <Zap size={13} className="text-primary" />
            <span className="text-xs font-bold text-primary">{totalAvailableXP} XP available</span>
          </div>
        )}
      </div>

      {/* Inline error */}
      {error && quests.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Tab bar */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "completed")} className="gap-4">
        <TabsList className="w-full bg-secondary rounded-xl border border-border">
          <TabsTrigger value="active" className="flex-1 rounded-[10px] text-[13px] font-semibold data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            Active
            {activeQuests.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold min-w-[18px] bg-primary/20 text-primary animate-pulse">{activeQuests.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex-1 rounded-[10px] text-[13px] font-semibold data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            Completed
            {completedQuests.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold min-w-[18px] bg-white/10 text-muted-foreground">{completedQuests.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {(["active", "completed"] as const).map((tabId) => {
          const quests = tabId === "active" ? activeQuests : completedQuests;
          return (
            <TabsContent key={tabId} value={tabId}>
              {quests.length === 0 ? (
                <div className="text-center py-16">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                    <Compass size={22} className="text-primary" />
                  </div>
                  <p className="text-sm text-foreground font-medium mb-1">
                    {tabId === "active" ? "No active quests" : "No completed quests"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tabId === "active" ? "Check back soon for new quests" : "Complete quests to earn bonus points"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {quests.map((quest, index) => (
                    <QuestCard
                      key={quest.id}
                      quest={quest}
                      index={index}
                      onSelect={setDetailQuest}
                      submissions={questSubmissions}
                      expandedQuestId={expandedQuestId}
                      onToggleSubmissions={toggleSubmissions}
                      loadingSubs={loadingSubs}
                      currencyName={currencyName}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Quest Detail Modal — portalled */}
      {detailQuest && typeof document !== "undefined" && createPortal(
        <QuestDetailSheet
          quest={detailQuest}
          onClose={() => { setDetailQuest(null); }}
          onSubmit={(q) => setSubmitQuest(q)}
          onExpandImage={() => setMediaFullscreen(true)}
          currencyName={currencyName}
        />,
        document.getElementById("rep-portal-root") || document.body
      )}

      {/* Fullscreen image overlay — portalled */}
      {mediaFullscreen && detailQuest?.image_url && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={() => setMediaFullscreen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 z-20 w-9 h-9 bg-white/8 border border-white/12 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/15 hover:border-white/20 hover:text-white transition-all cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setMediaFullscreen(false); }}
            aria-label="Close zoom"
          >
            <span className="sr-only">Close</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={detailQuest.image_url}
            alt={detailQuest.title}
            className="max-w-[90vw] max-h-[90vh] object-contain cursor-zoom-out"
          />
        </div>,
        document.getElementById("rep-portal-root") || document.body
      )}

      {/* Submit Proof Modal — portalled, stacks on top of detail modal */}
      {submitQuest && typeof document !== "undefined" && createPortal(
        <QuestSubmitSheet
          quest={submitQuest}
          onClose={() => setSubmitQuest(null)}
          onSubmitted={handleSubmitComplete}
          currencyName={currencyName}
        />,
        document.getElementById("rep-portal-root") || document.body
      )}
    </div>
  );
}
