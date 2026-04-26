"use client";

import { useEffect, useState } from "react";
import { X, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
      setError("That doesn't look like a valid email.");
      return;
    }
    if (invitees.includes(trimmed)) {
      setError("Already on the list.");
      return;
    }
    if (invitees.length >= MAX_INVITES) {
      setError(`Up to ${MAX_INVITES} invites here — you can add more from Team Settings.`);
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
    <>
      <SectionHeading
        title="Bring your team"
        subtitle="Invite anyone who'll help run events with you. They'll get a magic link to set up their account."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invite teammates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SectionField
            label="Email"
            htmlFor="onb-team-email"
            hint={`Up to ${MAX_INVITES} here — add more from Team Settings anytime.`}
            error={error ?? undefined}
          >
            <div className="flex gap-2">
              <Input
                id="onb-team-email"
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
              />
              <Button
                variant="outline"
                size="default"
                onClick={addEmail}
                disabled={!draft.trim() || invitees.length >= MAX_INVITES}
              >
                Add
              </Button>
            </div>
          </SectionField>

          {invitees.length > 0 && (
            <div className="space-y-2">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">
                {invitees.length} invite{invitees.length === 1 ? "" : "s"} ready
              </div>
              <div className="flex flex-wrap gap-2">
                {invitees.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-2.5 pr-1 text-xs text-primary ring-1 ring-primary/15"
                  >
                    <UserPlus size={11} />
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className="rounded-full p-1 transition-colors hover:bg-primary/15"
                      aria-label={`Remove ${email}`}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <HintCard>
        Teammates start with access to events and orders. Grant marketing or finance permissions
        later in Settings → Team.
      </HintCard>

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
    </>
  );
}
