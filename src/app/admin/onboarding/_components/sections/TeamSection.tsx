"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { SectionFooter, SectionField, SectionHeading, HintCard } from "../Shell";
import type { OnboardingApi } from "../../_state";

interface TeamData {
  invited_emails?: string[];
}

const MAX_INVITES = 5;

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export function TeamSection({ api }: { api: OnboardingApi }) {
  const stored = (api.getSection("team")?.data ?? {}) as TeamData;
  const [invitees, setInvitees] = useState<string[]>(stored.invited_emails ?? []);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.updateSectionData("team", { invited_emails: invitees });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitees]);

  function addEmail() {
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setError("That doesn't look like a valid email address");
      return;
    }
    if (invitees.includes(trimmed)) {
      setError("Already on the list");
      return;
    }
    if (invitees.length >= MAX_INVITES) {
      setError(`Up to ${MAX_INVITES} invites at once — you can add more later from Team Settings.`);
      return;
    }
    setInvitees([...invitees, trimmed]);
    setDraft("");
    setError(null);
  }

  function removeEmail(email: string) {
    setInvitees(invitees.filter((e) => e !== email));
  }

  async function handleContinue() {
    if (invitees.length === 0) {
      await api.completeAndAdvance("team", { invited_emails: [] });
      return;
    }
    setSending(true);
    setError(null);
    try {
      await Promise.all(
        invitees.map(async (email) =>
          fetch("/api/team", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              // Default minimal first_name; the invitee fills in their own
              // first/last name during accept-invite.
              first_name: email.split("@")[0],
              perm_events: true,
              perm_orders: true,
              perm_marketing: false,
              perm_finance: false,
            }),
          }).catch(() => {})
        )
      );
      await api.completeAndAdvance("team", { invited_emails: invitees });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <SectionHeading
        eyebrow="Step 8 of 9"
        title="Bring your team"
        subtitle="Invite anyone who'll help run events with you. They'll get a magic link to set up their account."
      />

      <div className="space-y-5">
        <SectionField
          label="Invite by email"
          hint={`Up to ${MAX_INVITES} for now — add more from Team Settings anytime.`}
          error={error ?? undefined}
        >
          <div className="flex gap-2">
            <input
              type="email"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              placeholder="teammate@yourbrand.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmail();
                }
              }}
              className="h-11 flex-1 rounded-xl border border-input bg-background/40 px-4 text-[14px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-[3px] focus:ring-primary/15"
            />
            <button
              type="button"
              onClick={addEmail}
              disabled={!draft.trim() || invitees.length >= MAX_INVITES}
              className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 text-[12px] font-semibold text-foreground transition-colors hover:bg-white/[0.04] disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </SectionField>

        {invitees.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
              {invitees.length} invite{invitees.length === 1 ? "" : "s"} ready to send
            </div>
            <div className="flex flex-wrap gap-2">
              {invitees.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1.5 pl-3 pr-1.5 text-[12px] text-primary"
                >
                  <UserPlus size={11} />
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="rounded-full p-1 hover:bg-primary/15"
                    aria-label={`Remove ${email}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <HintCard>
          New teammates start with access to events and orders. You can grant marketing or finance
          permissions later from Settings → Team.
        </HintCard>
      </div>

      <SectionFooter
        primaryLabel={
          invitees.length > 0
            ? sending
              ? "Sending invites…"
              : `Send ${invitees.length} invite${invitees.length === 1 ? "" : "s"}`
            : "Continue"
        }
        primaryLoading={sending || api.saving}
        onPrimary={handleContinue}
        skipLabel={invitees.length === 0 ? "Skip — I'll add the team later" : undefined}
        onSkip={
          invitees.length === 0
            ? async () => {
                await api.skipAndAdvance("team");
              }
            : undefined
        }
      />
    </div>
  );
}
