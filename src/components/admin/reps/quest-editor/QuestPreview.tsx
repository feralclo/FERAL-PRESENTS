"use client";

import { QuestCardPreview } from "../QuestCardPreview";
import { questTypeFor, type QuestFormState } from "./types";

/**
 * Phone-frame mirror of the iOS Quests tab focused on the card the rep
 * will see. Hand-composed in admin so we never mount a real iOS surface
 * — matches the pattern set by `BrandPreview.tsx` for the event editor.
 *
 * - `QuestPreview` — the desktop right-column variant (sticky on scroll,
 *   hidden on mobile). The orchestrator mounts a separate floating pill
 *   for mobile.
 * - `QuestPreviewSurface` — the bare phone-frame + card. Reused by the
 *   mobile preview sheet so the mobile rendering is identical.
 */
export interface QuestPreviewProps {
  state: QuestFormState;
}

export function QuestPreview({ state }: QuestPreviewProps) {
  if (!state.kind) return null;
  return (
    <aside className="hidden md:block">
      <div className="md:sticky md:top-4">
        <QuestPreviewSurface state={state} />
      </div>
    </aside>
  );
}

export function QuestPreviewSurface({ state }: QuestPreviewProps) {
  if (!state.kind) return null;

  const questType = questTypeFor(state.kind, state.socialSubType);

  return (
    <PhoneFrame>
      <div className="space-y-3 p-4">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
          Quests
        </p>
        <QuestCardPreview
          title={state.title}
          subtitle={state.subtitle ?? ""}
          coverImageUrl={state.cover_image_url ?? ""}
          promoterAccentHex={null}
          questType={questType}
          xp={state.xp_reward}
          ep={state.ep_reward}
          proofType={state.proof_type}
        />
      </div>
    </PhoneFrame>
  );
}

/**
 * Lightweight iPhone bezel + status bar. Mirrors `BrandPreview.tsx`'s
 * device frame so the admin's two preview surfaces feel consistent.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-3 rounded-[44px]"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 30%, rgba(255,255,255,0.04), transparent)",
        }}
      />
      <div className="relative overflow-hidden rounded-[40px] border border-white/[0.1] bg-black p-[3px] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.04)_inset]">
        <div className="overflow-hidden rounded-[36px] bg-black">
          <StatusBar />
          <div className="max-h-[620px] overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="relative flex h-9 items-center justify-between bg-black px-6 text-[11px] font-semibold text-white">
      <span className="tabular-nums">9:41</span>
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1.5 h-6 w-24 -translate-x-1/2 rounded-full bg-black"
      />
      <div className="flex items-center gap-1">
        <SignalIcon />
        <WifiIcon />
        <BatteryIcon />
      </div>
    </div>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 18 12" className="h-3 w-3.5" aria-hidden="true">
      <rect x="0" y="8" width="3" height="4" rx="0.5" fill="currentColor" />
      <rect x="5" y="6" width="3" height="6" rx="0.5" fill="currentColor" />
      <rect x="10" y="3" width="3" height="9" rx="0.5" fill="currentColor" />
      <rect x="15" y="0" width="3" height="12" rx="0.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-3.5" aria-hidden="true">
      <path
        d="M8 11.5c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1Zm-3-3a4.5 4.5 0 0 1 6 0l-1 1a3 3 0 0 0-4 0l-1-1Zm-2.5-2a8 8 0 0 1 11 0l-1 1a6.5 6.5 0 0 0-9 0l-1-1Zm-2.5-2a11.5 11.5 0 0 1 16 0l-1 1a10 10 0 0 0-14 0l-1-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 24 12" className="h-3 w-5" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="20"
        height="11"
        rx="2.5"
        ry="2.5"
        stroke="currentColor"
        strokeOpacity="0.55"
        fill="none"
      />
      <rect x="21" y="3.5" width="1.6" height="5" rx="0.6" fill="currentColor" opacity="0.55" />
      <rect x="2" y="2" width="14" height="8" rx="1.2" fill="currentColor" />
    </svg>
  );
}
